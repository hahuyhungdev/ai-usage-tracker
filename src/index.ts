import { Command } from "commander";
import { parseClaudeCode } from "./parsers/claude-code.js";
import { parseCodex } from "./parsers/codex.js";
import { parseAntigravity } from "./parsers/antigravity.js";
import { parseGeminiCli } from "./parsers/gemini-cli.js";
import { parseOpenCode } from "./parsers/opencode.js";
import { DailyUsage, SummaryItem, PlatformDailyUsage, sumUsage } from "./parsers/types.js";
import { printSummary, printDaily, printWeeklyDaily, printMonthlyWeeks } from "./utils/table.js";
import { aggregateDailyUsage, getLatestWeekRange } from "./usage/weekly.js";
import { aggregateMonthlyWeeks } from "./usage/monthly.js";

// ── Date helpers ──────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getToday(): string {
  return formatDate(new Date());
}

function getCurrentMonth(): { since: string; until: string } {
  const now = new Date();
  const year = now.getFullYear();
  const mon = now.getMonth() + 1;
  const lastDay = new Date(year, mon, 0).getDate();
  const mm = mon.toString().padStart(2, "0");
  return { since: `${year}-${mm}-01`, until: `${year}-${mm}-${lastDay}` };
}

function getCurrentMonthToDate(): { since: string; until: string } {
  const today = getToday();
  return { since: `${today.slice(0, 7)}-01`, until: today };
}

function parseMonthOption(month?: string | boolean): { since: string; until: string } | undefined {
  if (month === undefined || month === false) return undefined;
  const monthStr = month === true ? getCurrentMonth().since.substring(0, 7) : month;
  const match = monthStr.match(/^(\d{4})-(\d{2})$/);
  if (!match) return undefined;
  const year = parseInt(match[1]);
  const mon = parseInt(match[2]);
  const lastDay = new Date(year, mon, 0).getDate();
  return { since: `${match[1]}-${match[2]}-01`, until: `${match[1]}-${match[2]}-${lastDay}` };
}

// ── Data helpers ──────────────────────────────────────────────

interface PlatformResult {
  name: string;
  data: DailyUsage[];
}

function collectAllData(platforms?: string[]): PlatformResult[] {
  const all: { name: string; parse: () => DailyUsage[] }[] = [
    { name: "Claude Code", parse: parseClaudeCode },
    { name: "Codex", parse: parseCodex },
    { name: "Antigravity", parse: parseAntigravity },
    { name: "Gemini CLI", parse: parseGeminiCli },
    { name: "OpenCode", parse: parseOpenCode },
  ];

  const selected = platforms
    ? all.filter((p) => platforms.some((f) => p.name.toLowerCase().includes(f.toLowerCase())))
    : all;

  return selected.map((p) => ({ name: p.name, data: p.parse() }));
}

function filterByDate(data: DailyUsage[], since?: string, until?: string): DailyUsage[] {
  return data.filter((d) => {
    if (since && d.date < since) return false;
    if (until && d.date > until) return false;
    return true;
  });
}

function getDateRange(opts: any, defaultRange?: { since?: string; until?: string }): { since?: string; until?: string } {
  const monthRange = parseMonthOption(opts.month);
  return {
    since: monthRange?.since || opts.since || defaultRange?.since,
    until: monthRange?.until || opts.until || defaultRange?.until,
  };
}

// ── CLI ───────────────────────────────────────────────────────

function addCommonOptions(cmd: Command): Command {
  return cmd
    .option("-p, --platform <name>", "Filter by platform")
    .option("-m, --month [YYYY-MM]", "Filter by month (default: current month)")
    .option("-s, --since <date>", "Start date (YYYY-MM-DD)")
    .option("-u, --until <date>", "End date (YYYY-MM-DD)")
    .option("--json", "Output as JSON");
}

function getPlatformFilter(opts: any): string[] | undefined {
  return opts.platform ? [opts.platform] : undefined;
}

// Summary handler (shared by summary command and default action)
function handleSummary(opts: any, defaultRange?: { since?: string; until?: string }) {
  const { since, until } = getDateRange(opts, defaultRange);
  const results = collectAllData(getPlatformFilter(opts));

  const summary: SummaryItem[] = results
    .map((r) => ({ name: r.name, data: filterByDate(r.data, since, until) }))
    .filter((r) => r.data.length > 0);

  if (summary.length === 0) {
    console.log("No usage data found.");
    return;
  }

  if (opts.json) {
    const jsonOutput = summary.map((s) => ({ platform: s.name, ...sumUsage(s.data), days: s.data.length }));
    console.log(JSON.stringify(jsonOutput, null, 2));
    return;
  }

  printSummary(summary);
}

function handleWeekly(opts: any): void {
  const defaultRange = getLatestWeekRange(getToday());
  const { since = defaultRange.since, until = defaultRange.until } = getDateRange(opts, defaultRange);
  const results = collectAllData(getPlatformFilter(opts));
  const rows = aggregateDailyUsage(results, since, until);

  if (!rows.some((row) => row.total > 0)) {
    console.log("No usage data found.");
    return;
  }

  if (opts.json) {
    const totals = rows.reduce(
      (sum, row) => ({
        input: sum.input + row.input,
        output: sum.output + row.output,
        cacheCreate: sum.cacheCreate + row.cacheCreate,
        cacheRead: sum.cacheRead + row.cacheRead,
        total: sum.total + row.total,
        cost: sum.cost + row.cost,
      }),
      { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, cost: 0 },
    );
    const hasEstimates = rows.some((row) => row.hasEstimates);
    console.log(JSON.stringify({
      since,
      until,
      source: hasEstimates ? "mixed" : "measured",
      hasEstimates,
      days: rows,
      totals,
    }, null, 2));
    return;
  }

  printWeeklyDaily(rows, since, until);
}

function handleMonthly(opts: any): void {
  const defaultRange = getCurrentMonthToDate();
  const { since = defaultRange.since, until = defaultRange.until } = getDateRange(opts, defaultRange);
  const results = collectAllData(getPlatformFilter(opts));
  const rows = aggregateMonthlyWeeks(results, since, until);

  if (!rows.some((row) => row.total > 0)) {
    console.log("No usage data found.");
    return;
  }

  if (opts.json) {
    const totals = rows.reduce(
      (sum, row) => ({
        input: sum.input + row.input,
        output: sum.output + row.output,
        cacheCreate: sum.cacheCreate + row.cacheCreate,
        cacheRead: sum.cacheRead + row.cacheRead,
        total: sum.total + row.total,
        cost: sum.cost + row.cost,
      }),
      { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0, cost: 0 },
    );
    const hasEstimates = rows.some((row) => row.hasEstimates);
    console.log(JSON.stringify({
      since,
      until,
      source: hasEstimates ? "mixed" : "measured",
      hasEstimates,
      weeks: rows,
      totals,
    }, null, 2));
    return;
  }

  printMonthlyWeeks(rows, since, until);
}

// ── Commands ──────────────────────────────────────────────────

const program = new Command();
program
  .name("ai-usage")
  .description("Track AI token usage across platforms")
  .version("1.0.0")
  .enablePositionalOptions();

// Summary (all time)
addCommonOptions(program.command("summary").description("Show total usage summary"))
  .action((opts) => handleSummary(opts));

// Daily (default: today)
addCommonOptions(program.command("daily").description("Show daily usage (default: today)"))
  .action((opts) => {
    const today = getToday();

    if (opts.json) {
      // Daily JSON needs per-platform breakdown
      const { since, until } = getDateRange(opts, { since: today, until: today });
      const results = collectAllData(getPlatformFilter(opts));
      const allDays = new Map<string, PlatformDailyUsage[]>();

      for (const r of results) {
        for (const d of filterByDate(r.data, since, until)) {
          if (!allDays.has(d.date)) allDays.set(d.date, []);
          allDays.get(d.date)!.push({
            platform: r.name,
            input: d.input,
            output: d.output,
            cacheCreate: d.cacheCreate,
            cacheRead: d.cacheRead,
            total: d.total,
            cost: d.cost,
            isEstimate: d.isEstimate ?? false,
            source: d.source ?? "measured",
            note: d.note,
          });
        }
      }

      if (allDays.size === 0) { console.log("No usage data found."); return; }

      const jsonOutput = Array.from(allDays.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, platforms]) => {
          const hasEstimates = platforms.some((p) => p.isEstimate);
          return {
            date,
            source: hasEstimates ? "mixed" : "measured",
            hasEstimates,
            platforms,
            total: platforms.reduce((s, p) => s + p.total, 0),
            cost: platforms.reduce((s, p) => s + p.cost, 0),
          };
        });
      console.log(JSON.stringify(jsonOutput, null, 2));
      return;
    }

    // Table output
    const { since, until } = getDateRange(opts, { since: today, until: today });
    const results = collectAllData(getPlatformFilter(opts));
    const allDays = new Map<string, PlatformDailyUsage[]>();

    for (const r of results) {
      for (const d of filterByDate(r.data, since, until)) {
        if (!allDays.has(d.date)) allDays.set(d.date, []);
          allDays.get(d.date)!.push({
            platform: r.name,
            input: d.input,
            output: d.output,
            cacheCreate: d.cacheCreate,
            cacheRead: d.cacheRead,
            total: d.total,
            cost: d.cost,
            isEstimate: d.isEstimate ?? false,
            source: d.source ?? "measured",
            note: d.note,
          });
      }
    }

    if (allDays.size === 0) { console.log("No usage data found."); return; }
    printDaily(allDays);
  });

// Weekly (default: latest seven days)
addCommonOptions(program.command("weekly").description("Show daily usage for the latest seven days"))
  .action((opts) => handleWeekly(opts));

// Monthly (default: current month to date)
addCommonOptions(program.command("monthly").description("Show weekly usage for the current month"))
  .action((opts) => handleMonthly(opts));

// Default action: summary
addCommonOptions(program).action((opts) => handleSummary(opts));

program.parse();
