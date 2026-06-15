import { readFileSync, readdirSync, existsSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";
import { DailyUsage, ModelUsage, PlatformConfig } from "./types.js";
import { calculateCost } from "../pricing/models.js";

interface OpenCodeSession {
  id: string;
  model: string;
  created_at: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export const opencodeConfig: PlatformConfig = {
  name: "OpenCode",
  logPath: join(homedir(), ".opencode"),
  parse: parseOpenCode,
};

export function parseOpenCode(): DailyUsage[] {
  const logPath = opencodeConfig.logPath;
  if (!existsSync(logPath)) return [];

  const dailyMap = new Map<string, { input: number; output: number; cacheCreate: number; cacheRead: number; total: number; models: Map<string, ModelUsage> }>();

  try {
    const files = readdirSync(logPath);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    for (const file of jsonFiles) {
      const filePath = join(logPath, file);

      try {
        const content = readFileSync(filePath, "utf-8");
        const session: OpenCodeSession = JSON.parse(content);

        if (!session.created_at || !session.usage) continue;

        const date = session.created_at.split("T")[0];
        const model = session.model || "claude-sonnet-4-20250514";
        const u = session.usage;

        const input = u.input_tokens || 0;
        const output = u.output_tokens || 0;
        const cacheCreate = u.cache_creation_input_tokens || 0;
        const cacheRead = u.cache_read_input_tokens || 0;
        const total = input + output + cacheCreate + cacheRead;

        if (total === 0) continue;

        if (!dailyMap.has(date)) {
          dailyMap.set(date, { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, models: new Map() });
        }

        const dayData = dailyMap.get(date)!;
        dayData.input += input;
        dayData.output += output;
        dayData.cacheCreate += cacheCreate;
        dayData.cacheRead += cacheRead;
        dayData.total += total;

        if (!dayData.models.has(model)) {
          dayData.models.set(model, { model, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, cost: 0 });
        }

        const modelData = dayData.models.get(model)!;
        modelData.input += input;
        modelData.output += output;
        modelData.cacheCreate += cacheCreate;
        modelData.cacheRead += cacheRead;
        modelData.total += total;
        modelData.cost += calculateCost(model, { input, output, cacheCreate, cacheRead, total });
      } catch {
        // Skip invalid JSON files
      }
    }
  } catch {}

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
