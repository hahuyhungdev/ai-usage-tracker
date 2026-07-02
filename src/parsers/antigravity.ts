import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { DailyUsage, ModelUsage, PlatformConfig } from "./types.js";
import { calculateCost, normalizeModelName } from "../pricing/models.js";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

interface HistoryEntry {
  display: string;
  timestamp: number;
  workspace: string;
  conversationId: string;
}

export const antigravityConfig: PlatformConfig = {
  name: "Antigravity",
  logPath: join(homedir(), ".gemini", "antigravity-cli"),
  parse: parseAntigravity,
};

export function parseAntigravity(): DailyUsage[] {
  return parseAntigravityFromDir(antigravityConfig.logPath);
}

function readModelsByDate(agyDir: string): Map<string, string[]> {
  const modelsByDate = new Map<string, string[]>();
  const logDir = join(agyDir, "log");

  try {
    for (const file of readdirSync(logDir)) {
      const fileMatch = file.match(/^cli-(\d{4})(\d{2})(\d{2})_.*\.log$/);
      if (!fileMatch) continue;

      const date = `${fileMatch[1]}-${fileMatch[2]}-${fileMatch[3]}`;
      const models = modelsByDate.get(date) ?? [];
      const content = readFileSync(join(logDir, file), "utf-8");
      let currentModel: string | undefined;

      for (const line of content.split("\n")) {
        const modelMatch = line.match(/Propagating selected model override to backend: label="([^"]+)"/);
        if (modelMatch) currentModel = modelMatch[1];
        if (currentModel && line.includes("HandleUserInput called with text:") && !models.includes(currentModel)) {
          models.push(currentModel);
        }
      }

      if (models.length > 0) modelsByDate.set(date, models);
    }
  } catch {
    // Antigravity log directory is optional.
  }

  return modelsByDate;
}

export function parseAntigravityFromDir(agyDir: string): DailyUsage[] {
  if (!existsSync(agyDir)) return [];

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  let scriptPath = join(__dirname, "parse-sqlite.py");
  if (!existsSync(scriptPath)) {
    scriptPath = join(__dirname, "../../src/parsers/parse-sqlite.py");
  }

  const modelsByDate = readModelsByDate(agyDir);

  let preciseUsage: Record<string, { input: number; output: number; cacheRead: number }> = {};
  try {
    const pyOutput = execSync(`python3 "${scriptPath}" "${agyDir}"`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    preciseUsage = JSON.parse(pyOutput);
  } catch (e) {
    // Fallback to estimation if python script fails
  }

  if (Object.keys(preciseUsage).length > 0) {
    return Object.entries(preciseUsage)
      .map(([date, data]) => {
        const detectedModels = modelsByDate.get(date) ?? [];
        const modelsToUse = detectedModels.length > 0 ? detectedModels : ["gemini-2.5-flash"];
        const modelCount = modelsToUse.length;

        const note = `Accurately parsed from Antigravity conversation databases.`;
        const modelsList: ModelUsage[] = modelsToUse.map((rawModelName) => {
          const normalized = normalizeModelName(rawModelName);
          const modelInput = Math.round(data.input / modelCount);
          const modelOutput = Math.round(data.output / modelCount);
          const modelCacheRead = Math.round(data.cacheRead / modelCount);
          const modelTotal = modelInput + modelOutput + modelCacheRead;

          return {
            model: normalized,
            input: modelInput,
            output: modelOutput,
            cacheCreate: 0,
            cacheRead: modelCacheRead,
            total: modelTotal,
            cost: calculateCost(normalized, { input: modelInput, output: modelOutput, cacheCreate: 0, cacheRead: modelCacheRead }),
            source: "measured" as const,
            isEstimate: false,
            note,
          };
        });

        const totalCost = modelsList.reduce((sum, m) => sum + m.cost, 0);

        return {
          date,
          input: data.input,
          output: data.output,
          cacheCreate: 0,
          cacheRead: data.cacheRead,
          total: data.input + data.output + data.cacheRead,
          cost: totalCost,
          source: "measured" as const,
          isEstimate: false,
          note,
          modelNames: detectedModels,
          models: modelsList,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  const historyFile = join(agyDir, "history.jsonl");
  let historyEntries: HistoryEntry[] = [];


  try {
    const content = readFileSync(historyFile, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry: HistoryEntry = JSON.parse(line);
        if (entry.timestamp && entry.conversationId) {
          historyEntries.push(entry);
        }
      } catch {
        // Skip invalid lines
      }
    }
  } catch {
    // History file doesn't exist
  }

  const convDir = join(agyDir, "conversations");
  let totalConvSize = 0;
  let convCount = 0;
  const conversationSizes = new Map<string, number>();

  try {
    const convFiles = readdirSync(convDir);
    for (const file of convFiles) {
      if (file.endsWith(".db") || file.endsWith(".pb")) {
        const stat = statSync(join(convDir, file));
        const conversationId = file.replace(/\.(db|pb)$/, "");
        const currentSize = conversationSizes.get(conversationId) ?? 0;
        conversationSizes.set(conversationId, currentSize + stat.size);
        totalConvSize += stat.size;
        convCount++;
      }
    }
  } catch {
    // Conversations directory doesn't exist
  }

  const bytesPerToken = 3;
  const storageMultiplier = 2.5;
  const avgTokensPerConv = totalConvSize > 0
    ? Math.round((totalConvSize / bytesPerToken * storageMultiplier) / convCount)
    : 1_000_000; // Default 1M tokens per conversation

  const dailyMap = new Map<string, { count: number; input: number; output: number; cacheCreate: number; cacheRead: number; total: number }>();
  const conversationDates = new Map<string, Map<string, number>>();

  for (const entry of historyEntries) {
    const date = new Date(entry.timestamp).toISOString().split("T")[0];
    const conversationId = entry.conversationId;
    if (!date || !conversationId) continue;

    if (!conversationDates.has(conversationId)) {
      conversationDates.set(conversationId, new Map());
    }
    const dates = conversationDates.get(conversationId)!;
    dates.set(date, (dates.get(date) ?? 0) + 1);
  }

  for (const [conversationId, dates] of conversationDates) {
    const storedBytes = conversationSizes.get(conversationId);
    const estimatedTokens = storedBytes
      ? Math.round((storedBytes / bytesPerToken) * storageMultiplier)
      : avgTokensPerConv;
    const historyCount = Array.from(dates.values()).reduce((sum, count) => sum + count, 0);

    for (const [date, dateCount] of dates) {
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { count: 0, input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 });
      }

      const dayData = dailyMap.get(date)!;
      const dailyTokens = Math.round(estimatedTokens * (dateCount / historyCount));
      const estimatedInput = Math.round(dailyTokens * 0.6);
      const estimatedOutput = Math.round(dailyTokens * 0.2);
      const estimatedCacheRead = Math.max(0, dailyTokens - estimatedInput - estimatedOutput);

      dayData.count += dateCount;
      dayData.input += estimatedInput;
      dayData.output += estimatedOutput;
      dayData.cacheRead += estimatedCacheRead;
      dayData.total += estimatedInput + estimatedOutput + estimatedCacheRead;
    }
  }

  return Array.from(dailyMap.entries())
    .map(([date, data]) => {
      const usage = { input: data.input, output: data.output, cacheCreate: data.cacheCreate, cacheRead: data.cacheRead, total: data.total };
      const note = `Estimated from ${data.count} Antigravity history rows and ${convCount} conversation files.`;
      return {
        date,
        input: data.input,
        output: data.output,
        cacheCreate: data.cacheCreate,
        cacheRead: data.cacheRead,
        total: data.total,
        cost: calculateCost("gemini-2.5-flash", usage),
        isEstimate: true,
        source: "estimated" as const,
        note,
        modelNames: modelsByDate.get(date) ?? [],
        models: [{
          model: "gemini-2.5-flash",
          input: data.input,
          output: data.output,
          cacheCreate: data.cacheCreate,
          cacheRead: data.cacheRead,
          total: data.total,
          cost: calculateCost("gemini-2.5-flash", usage),
          isEstimate: true,
          source: "estimated" as const,
          note,
        }],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
