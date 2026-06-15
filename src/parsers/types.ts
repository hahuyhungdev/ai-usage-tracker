export interface TokenUsage {
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
}

export interface ModelUsage {
  model: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  cost: number;
  isEstimate?: boolean;
  source?: UsageSource;
  note?: string;
}

export type UsageSource = "measured" | "estimated";

export interface DailyUsage {
  date: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  cost: number;
  models: ModelUsage[];
  modelNames?: string[];
  isEstimate?: boolean;
  source?: UsageSource;
  note?: string;
}

export interface PlatformConfig {
  name: string;
  logPath: string;
  parse: () => DailyUsage[];
}

export type TimeGroup = "daily" | "weekly" | "monthly";

export interface GroupedUsage {
  period: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  cost: number;
}

// For daily display with platform info
export interface PlatformDailyUsage {
  platform: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  total: number;
  cost: number;
  isEstimate?: boolean;
  source?: UsageSource;
  note?: string;
}

// For summary display
export interface SummaryItem {
  name: string;
  data: DailyUsage[];
}

// Sum a list of DailyUsage
export function sumUsage(data: DailyUsage[]): TokenUsage & { cost: number } {
  return data.reduce(
    (acc, d) => ({
      input: acc.input + d.input,
      output: acc.output + d.output,
      cacheCreate: acc.cacheCreate + d.cacheCreate,
      cacheRead: acc.cacheRead + d.cacheRead,
      total: acc.total + d.total,
      cost: acc.cost + d.cost,
    }),
    { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, cost: 0 }
  );
}
