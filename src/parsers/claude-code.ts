import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, basename } from "path";
import { homedir } from "os";
import { TokenUsage, ModelUsage, PlatformConfig, DailyUsage } from "./types.js";
import { calculateCost } from "../pricing/models.js";

interface ClaudeMessage {
  id?: string;
  role: string;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

interface ClaudeJsonlEntry {
  timestamp: string;
  sessionId?: string;
  message?: ClaudeMessage;
  type?: string;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export const claudeCodeConfig: PlatformConfig = {
  name: "Claude Code",
  logPath: join(homedir(), ".claude", "projects"),
  parse: parseClaudeCode,
};

function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && extname(entry.name) === ".jsonl") {
        files.push(fullPath);
      } else if (entry.isDirectory()) {
        files.push(...findJsonlFiles(fullPath));
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}

function parseJsonlLine(line: string): ClaudeJsonlEntry | null {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as ClaudeJsonlEntry;
  } catch {
    return null;
  }
}

function extractUsage(entry: ClaudeJsonlEntry): {
  model: string;
  usage: TokenUsage;
  timestamp: string;
} | null {
  // Try message.usage first (most common format)
  if (entry.message?.usage && entry.message?.model) {
    if (entry.message.model === "<synthetic>") return null;
    const u = entry.message.usage;
    if (u.input_tokens === 0 && u.output_tokens === 0) return null;
    return {
      model: entry.message.model,
      usage: {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheCreate: u.cache_creation_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        total: u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      },
      timestamp: entry.timestamp,
    };
  }

  // Try top-level usage (alternative format)
  if (entry.usage && entry.model) {
    if (entry.model === "<synthetic>") return null;
    const u = entry.usage;
    if (u.input_tokens === 0 && u.output_tokens === 0) return null;
    return {
      model: entry.model,
      usage: {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheCreate: u.cache_creation_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        total: u.input_tokens + u.output_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      },
      timestamp: entry.timestamp,
    };
  }

  return null;
}

export function parseClaudeCode(): DailyUsage[] {
  return parseClaudeCodeFromDir(claudeCodeConfig.logPath);
}

export function parseClaudeCodeFromDir(logPath: string): DailyUsage[] {

  if (!existsSync(logPath)) {
    return [];
  }

  const jsonlFiles = findJsonlFiles(logPath);

  if (jsonlFiles.length === 0) {
    return [];
  }

  const usageMap = new Map<
    string,
    {
      input: number;
      output: number;
      cacheCreate: number;
      cacheRead: number;
      total: number;
      models: Map<string, ModelUsage>;
    }
  >();

  let totalEntries = 0;
  let parsedEntries = 0;
  const seenMessageIds = new Set<string>();

  for (const file of jsonlFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        totalEntries++;
        const entry = parseJsonlLine(line);
        if (!entry) continue;

        const messageId = entry.message?.id;
        if (messageId && seenMessageIds.has(messageId)) continue;

        const extracted = extractUsage(entry);
        if (!extracted) continue;

        if (messageId) seenMessageIds.add(messageId);

        parsedEntries++;
        const date = extracted.timestamp.split("T")[0];

        if (!usageMap.has(date)) {
          usageMap.set(date, {
            input: 0,
            output: 0,
            cacheCreate: 0,
            cacheRead: 0,
            total: 0,
            models: new Map(),
          });
        }

        const dayData = usageMap.get(date)!;
        dayData.input += extracted.usage.input;
        dayData.output += extracted.usage.output;
        dayData.cacheCreate += extracted.usage.cacheCreate;
        dayData.cacheRead += extracted.usage.cacheRead;
        dayData.total += extracted.usage.total;

        if (!dayData.models.has(extracted.model)) {
          dayData.models.set(extracted.model, {
            model: extracted.model,
            input: 0,
            output: 0,
            cacheCreate: 0,
            cacheRead: 0,
            total: 0,
            cost: 0,
          });
        }

        const modelData = dayData.models.get(extracted.model)!;
        modelData.input += extracted.usage.input;
        modelData.output += extracted.usage.output;
        modelData.cacheCreate += extracted.usage.cacheCreate;
        modelData.cacheRead += extracted.usage.cacheRead;
        modelData.total += extracted.usage.total;
        modelData.cost += calculateCost(extracted.model, extracted.usage);
      }
    } catch {
      // Skip files we can't read
    }
  }

  return Array.from(usageMap.entries())
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
