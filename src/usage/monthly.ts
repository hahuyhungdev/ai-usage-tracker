import { PlatformUsageResult } from "./weekly.js";

export interface MonthlyWeekUsage {
  week: number;
  since: string;
  until: string;
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

function createWeekRanges(since: string, until: string): Array<{ since: string; until: string }> {
  const ranges: Array<{ since: string; until: string }> = [];
  const current = parseDate(since);
  const end = parseDate(until);

  while (current <= end) {
    const rangeStart = new Date(current);
    const day = current.getUTCDay();
    const daysUntilSunday = day === 0 ? 0 : 7 - day;
    const rangeEnd = new Date(current);
    rangeEnd.setUTCDate(current.getUTCDate() + daysUntilSunday);
    if (rangeEnd > end) rangeEnd.setTime(end.getTime());

    ranges.push({ since: formatDate(rangeStart), until: formatDate(rangeEnd) });
    current.setTime(rangeEnd.getTime());
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return ranges;
}

export function aggregateMonthlyWeeks(
  results: PlatformUsageResult[],
  since: string,
  until: string,
): MonthlyWeekUsage[] {
  const rows: MonthlyWeekUsage[] = createWeekRanges(since, until).map((range, index) => ({
    week: index + 1,
    ...range,
    input: 0,
    output: 0,
    cacheCreate: 0,
    cacheRead: 0,
    total: 0,
    cost: 0,
    source: "none",
    hasEstimates: false,
    platforms: [] as string[],
    models: [] as string[],
  }));
  const measuredWeeks = new Set<number>();

  for (const result of results) {
    for (const usage of result.data) {
      const index = rows.findIndex((row) => usage.date >= row.since && usage.date <= row.until);
      if (index < 0) continue;

      const row = rows[index];
      row.input += usage.input;
      row.output += usage.output;
      row.cacheCreate += usage.cacheCreate;
      row.cacheRead += usage.cacheRead;
      row.total += usage.total;
      row.cost += usage.cost;
      row.hasEstimates ||= usage.isEstimate === true;
      if (!usage.isEstimate) measuredWeeks.add(index);
      if (!row.platforms.includes(result.name)) row.platforms.push(result.name);

      const modelNames = usage.modelNames ?? usage.models.map((model) => model.model);
      for (const model of modelNames) {
        if (model && !row.models.includes(model)) row.models.push(model);
      }
    }
  }

  rows.forEach((row, index) => {
    if (row.platforms.length === 0) row.source = "none";
    else if (row.hasEstimates && measuredWeeks.has(index)) row.source = "mixed";
    else if (row.hasEstimates) row.source = "estimated";
    else row.source = "measured";
  });

  return rows;
}
