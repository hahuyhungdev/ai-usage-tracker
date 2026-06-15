import { readFileSync, readdirSync, existsSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";
import { DailyUsage, ModelUsage, PlatformConfig } from "./types.js";
import { calculateCost } from "../pricing/models.js";

export const geminiCliConfig: PlatformConfig = {
  name: "Gemini CLI",
  logPath: join(homedir(), ".gemini"),
  parse: parseGeminiCli,
};

function findAllFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && extensions.includes(extname(entry.name))) {
        files.push(fullPath);
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        files.push(...findAllFiles(fullPath, extensions));
      }
    }
  } catch {}

  return files;
}

export function parseGeminiCli(): DailyUsage[] {
  const logPath = geminiCliConfig.logPath;
  if (!existsSync(logPath)) return [];

  // Look for history files, JSONL files, or log files
  const files = findAllFiles(logPath, [".jsonl", ".json", ".log"]);
  if (files.length === 0) return [];

  const dailyMap = new Map<string, { input: number; output: number; cacheCreate: number; cacheRead: number; total: number; models: Map<string, ModelUsage> }>();

  for (const file of files) {
    // Skip non-usage files
    if (file.includes("settings") || file.includes("config") || file.includes("oauth") || file.includes("accounts")) continue;

    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // Look for usage data in various formats
          const usage = entry.usage || entry.token_usage || entry.payload?.info?.total_token_usage;
          if (!usage) continue;

          const date = (entry.timestamp || entry.created_at || "").split("T")[0];
          if (!date) continue;

          const model = entry.model || entry.payload?.model || "gemini-2.5-flash";

          const input = usage.input_tokens || usage.promptTokenCount || 0;
          const output = usage.output_tokens || usage.candidatesTokenCount || 0;
          const cacheRead = usage.cached_input_tokens || usage.cachedContentTokenCount || 0;
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

          if (!dayData.models.has(model)) {
            dayData.models.set(model, { model, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, cost: 0 });
          }

          const modelData = dayData.models.get(model)!;
          modelData.input += input;
          modelData.output += output;
          modelData.cacheRead += cacheRead;
          modelData.total += total;
          modelData.cost += calculateCost(model, { input, output, cacheCreate: 0, cacheRead, total });
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
