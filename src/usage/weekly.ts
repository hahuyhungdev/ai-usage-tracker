import { DailyUsage } from "../parsers/types.js";

export interface PlatformUsageResult {
  name: string;
  data: DailyUsage[];
}

export interface WeeklyDailyUsage {
  date: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  cost: number;
  source: "measured" | "estimated" | "mixed" | "none";
  hasEstimates: boolean;
  platforms: string[];
  models: string[];
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getLatestWeekRange(today: string): { since: string; until: string } {
  const date = parseDate(today);
  const firstDay = new Date(date);
  firstDay.setUTCDate(date.getUTCDate() - 6);
  return { since: formatDate(firstDay), until: today };
}

export function listDates(since: string, until: string): string[] {
  const dates: string[] = [];
  const current = parseDate(since);
  const end = parseDate(until);

  while (current <= end) {
    dates.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export function aggregateDailyUsage(
  results: PlatformUsageResult[],
  since: string,
  until: string,
): WeeklyDailyUsage[] {
  const rows = new Map<string, WeeklyDailyUsage>();

  for (const date of listDates(since, until)) {
    rows.set(date, {
      date,
      input: 0,
      output: 0,
      cacheCreate: 0,
      cacheRead: 0,
      total: 0,
      cost: 0,
      source: "none",
      hasEstimates: false,
      platforms: [],
      models: [],
    });
  }

  for (const result of results) {
    for (const usage of result.data) {
      const row = rows.get(usage.date);
      if (!row) continue;

      row.input += usage.input;
      row.output += usage.output;
      row.cacheCreate += usage.cacheCreate;
      row.cacheRead += usage.cacheRead;
      row.total += usage.total;
      row.cost += usage.cost;
      row.hasEstimates ||= usage.isEstimate === true;
      if (!row.platforms.includes(result.name)) row.platforms.push(result.name);
      const modelNames = usage.modelNames ?? usage.models.map((model) => model.model);
      for (const model of modelNames) {
        if (model && !row.models.includes(model)) row.models.push(model);
      }
    }
  }

  for (const row of rows.values()) {
    if (row.platforms.length === 0) {
      row.source = "none";
    } else if (row.hasEstimates && row.platforms.length > 1) {
      row.source = "mixed";
    } else if (row.hasEstimates) {
      row.source = "estimated";
    } else {
      row.source = "measured";
    }
  }

  return Array.from(rows.values());
}
