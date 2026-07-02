import { readFileSync, readdirSync, existsSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";
import { DailyUsage, ModelUsage, PlatformConfig } from "./types.js";
import { calculateCost } from "../pricing/models.js";

export const codexConfig: PlatformConfig = {
  name: "Codex",
  logPath: join(homedir(), ".codex", "sessions"),
  parse: parseCodex,
};

export function splitOpenAIInputTokens(totalInput: number, cachedInput: number): { input: number; cacheRead: number } {
  const cacheRead = Math.min(Math.max(0, cachedInput), Math.max(0, totalInput));
  return {
    input: Math.max(0, totalInput - cacheRead),
    cacheRead,
  };
}

function findAllJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && extname(entry.name) === ".jsonl") {
        files.push(fullPath);
      } else if (entry.isDirectory()) {
        files.push(...findAllJsonlFiles(fullPath));
      }
    }
  } catch {}

  return files;
}

export function parseCodex(): DailyUsage[] {
  const logPath = codexConfig.logPath;
  if (!existsSync(logPath)) return [];

  const jsonlFiles = findAllJsonlFiles(logPath);
  if (jsonlFiles.length === 0) return [];

  const dailyMap = new Map<string, { input: number; output: number; cacheCreate: number; cacheRead: number; total: number; models: Map<string, ModelUsage> }>();

  for (const file of jsonlFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n").filter(Boolean);

      let currentModel = "gpt-5";
      let lastTotalInput = 0;
      let lastTotalOutput = 0;
      let lastTotalCacheRead = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Get model from turn_context
          if (entry.type === "turn_context" && entry.payload?.model) {
            currentModel = entry.payload.model;
          }

          // Extract token usage
          if (entry.type === "event_msg" && entry.payload?.type === "token_count") {
            const date = entry.timestamp.split("T")[0];
            if (!date) continue;

            const totalUsage = entry.payload.info.total_token_usage || {};
            const lastUsage = entry.payload.info.last_token_usage;

            let inputWithCache = 0;
            let output = 0;
            let cachedInput = 0;

            if (lastUsage) {
              // If last_token_usage is present, we can read the step's tokens directly (highly accurate)
              inputWithCache = lastUsage.input_tokens || 0;
              output = lastUsage.output_tokens || 0;
              cachedInput = lastUsage.cached_input_tokens || 0;
            } else {
              // Fallback to calculating delta from cumulative total_token_usage
              const totalInput = totalUsage.input_tokens || 0;
              const totalOutput = totalUsage.output_tokens || 0;
              const totalCacheRead = totalUsage.cached_input_tokens || 0;

              inputWithCache = Math.max(0, totalInput - lastTotalInput);
              output = Math.max(0, totalOutput - lastTotalOutput);
              cachedInput = Math.max(0, totalCacheRead - lastTotalCacheRead);
            }

            // Always update last totals from total_token_usage for the fallback tracking
            lastTotalInput = totalUsage.input_tokens || 0;
            lastTotalOutput = totalUsage.output_tokens || 0;
            lastTotalCacheRead = totalUsage.cached_input_tokens || 0;

            if (inputWithCache === 0 && output === 0 && cachedInput === 0) continue;

            const { input, cacheRead } = splitOpenAIInputTokens(inputWithCache, cachedInput);
            const total = input + output + cacheRead;


            if (total === 0) continue;

            if (!dailyMap.has(date)) {
              dailyMap.set(date, { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, models: new Map() });
            }

            const dayData = dailyMap.get(date)!;
            dayData.input += input;
            dayData.output += output;
            dayData.cacheRead += cacheRead;
            dayData.total += total;

            if (!dayData.models.has(currentModel)) {
              dayData.models.set(currentModel, { model: currentModel, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, cost: 0 });
            }

            const modelData = dayData.models.get(currentModel)!;
            modelData.input += input;
            modelData.output += output;
            modelData.cacheRead += cacheRead;
            modelData.total += total;
            modelData.cost += calculateCost(currentModel, { input, output, cacheCreate: 0, cacheRead, total });
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    } catch {
      // Skip files we can't read
    }
  }

  return Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      input: data.input,
      output: data.output,
      cacheCreate: data.cacheCreate,
      cacheRead: data.cacheRead,
      total: data.total,
      cost: Array.from(data.models.values()).reduce((sum, m) => sum + m.cost, 0),
      models: Array.from(data.models.values()),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
