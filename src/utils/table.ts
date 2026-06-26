import Table from "cli-table3";
import chalk from "chalk";
import { formatTokens, formatCost } from "./format.js";
import { DailyUsage, SummaryItem, PlatformDailyUsage, sumUsage } from "../parsers/types.js";
import { WeeklyDailyUsage } from "../usage/weekly.js";
import { MonthlyWeekUsage } from "../usage/monthly.js";

// ── Shared table config ───────────────────────────────────────

const TABLE_STYLE = { head: [], border: [] };

function createTable(head: string[], colAligns: Table.HorizontalAlignment[]): Table.Table {
  return new Table({ head: head.map((h) => chalk.cyan(h)), colAligns, style: TABLE_STYLE });
}

// ── Summary ───────────────────────────────────────────────────

export function printSummary(summary: SummaryItem[]): void {
  console.log(chalk.bold.cyan("\n📊 AI USAGE SUMMARY\n"));

  const table = createTable(
    ["Platform", "Total", "Cost", "Input", "Output", "Cache Read"],
    ["left", "right", "right", "right", "right", "right"],
  );

  let grand = { input: 0, output: 0, cacheRead: 0, total: 0, cost: 0 };

  for (const s of summary) {
    const t = sumUsage(s.data);
    table.push([s.name, formatTokens(t.total), formatCost(t.cost), formatTokens(t.input), formatTokens(t.output), formatTokens(t.cacheRead)]);
    grand.input += t.input;
    grand.output += t.output;
    grand.cacheRead += t.cacheRead;
    grand.total += t.total;
    grand.cost += t.cost;
  }

  if (summary.length > 1) {
    table.push([
      chalk.bold("TOTAL"),
      chalk.bold(formatTokens(grand.total)),
      chalk.bold(formatCost(grand.cost)),
      chalk.bold(formatTokens(grand.input)),
      chalk.bold(formatTokens(grand.output)),
      chalk.bold(formatTokens(grand.cacheRead)),
    ]);
  }

  console.log(table.toString());
}

// ── Daily ─────────────────────────────────────────────────────

export function printDaily(allDays: Map<string, PlatformDailyUsage[]>): void {
  console.log(chalk.bold.cyan("\n📅 DAILY USAGE BREAKDOWN\n"));

  const table = createTable(
    ["Date", "Platform", "Source", "Total", "Cost", "Input", "Output", "Cache Read"],
    ["left", "left", "left", "right", "right", "right", "right", "right"],
  );

  for (const date of Array.from(allDays.keys()).sort()) {
    const platforms = allDays.get(date)!;

    for (const p of platforms) {
      table.push([
        date,
        p.platform,
        p.isEstimate ? chalk.yellow("Estimated") : "Measured",
        formatTokens(p.total),
        p.isEstimate ? `~${formatCost(p.cost)}` : formatCost(p.cost),
        formatTokens(p.input),
        formatTokens(p.output),
        formatTokens(p.cacheRead),
      ]);
    }

    if (platforms.length > 1) {
      const dayTotal = platforms.reduce((s, p) => s + p.total, 0);
      const dayCost = platforms.reduce((s, p) => s + p.cost, 0);
      const dayInput = platforms.reduce((s, p) => s + p.input, 0);
      const dayOutput = platforms.reduce((s, p) => s + p.output, 0);
      const dayCacheRead = platforms.reduce((s, p) => s + p.cacheRead, 0);
      const hasEstimate = platforms.some((p) => p.isEstimate);
      table.push([
        chalk.bold(date),
        chalk.bold("TOTAL"),
        chalk.bold(hasEstimate ? "Mixed" : "Measured"),
        chalk.bold(formatTokens(dayTotal)),
        chalk.bold(hasEstimate ? `~${formatCost(dayCost)}` : formatCost(dayCost)),
        chalk.bold(formatTokens(dayInput)),
        chalk.bold(formatTokens(dayOutput)),
        chalk.bold(formatTokens(dayCacheRead)),
      ]);
    }
  }

  console.log(table.toString());
}

export function printWeeklyDaily(rows: WeeklyDailyUsage[], since: string, until: string): void {
  console.log(chalk.bold.cyan(`\n📅 WEEKLY USAGE: ${since} to ${until}\n`));

  const table = createTable(
    ["Date", "Day", "Source", "Models Used", "Total", "Cost", "Input", "Output", "Cache Read"],
    ["left", "left", "left", "left", "right", "right", "right", "right", "right"],
  );

  for (const row of rows) {
    const day = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${row.date}T00:00:00Z`));
    const source = row.source === "none"
      ? "No usage"
      : row.source.charAt(0).toUpperCase() + row.source.slice(1);
    const estimatedPrefix = row.hasEstimates ? "~" : "";

    table.push([
      row.date,
      day,
      row.hasEstimates ? chalk.yellow(source) : source,
      row.models.length > 0 ? row.models.join("\n") : "-",
      formatTokens(row.total),
      `${estimatedPrefix}${formatCost(row.cost)}`,
      formatTokens(row.input),
      formatTokens(row.output),
      formatTokens(row.cacheRead),
    ]);
  }

  const total = rows.reduce(
    (sum, row) => ({
      input: sum.input + row.input,
      output: sum.output + row.output,
      cacheRead: sum.cacheRead + row.cacheRead,
      total: sum.total + row.total,
      cost: sum.cost + row.cost,
      hasEstimates: sum.hasEstimates || row.hasEstimates,
      models: [...new Set([...sum.models, ...row.models])],
    }),
    { input: 0, output: 0, cacheRead: 0, total: 0, cost: 0, hasEstimates: false, models: [] as string[] },
  );

  table.push([
    chalk.bold("WEEK TOTAL"),
    "",
    chalk.bold(total.hasEstimates ? "Mixed" : "Measured"),
    total.models.join("\n"),
    chalk.bold(formatTokens(total.total)),
    chalk.bold(`${total.hasEstimates ? "~" : ""}${formatCost(total.cost)}`),
    chalk.bold(formatTokens(total.input)),
    chalk.bold(formatTokens(total.output)),
    chalk.bold(formatTokens(total.cacheRead)),
  ]);

  console.log(table.toString());
}

export function printMonthlyWeeks(rows: MonthlyWeekUsage[], since: string, until: string): void {
  console.log(chalk.bold.cyan(`\n📅 MONTHLY USAGE BY WEEK: ${since} to ${until}\n`));

  const table = createTable(
    ["Week", "Range", "Source", "Models Used", "Total", "Cost", "Input", "Output", "Cache Read"],
    ["center", "left", "left", "left", "right", "right", "right", "right", "right"],
  );

  for (const row of rows) {
    const source = row.source === "none"
      ? "No usage"
      : row.source.charAt(0).toUpperCase() + row.source.slice(1);
    table.push([
      row.week.toString(),
      `${row.since} to ${row.until}`,
      row.hasEstimates ? chalk.yellow(source) : source,
      row.models.length > 0 ? row.models.join("\n") : "-",
      formatTokens(row.total),
      `${row.hasEstimates ? "~" : ""}${formatCost(row.cost)}`,
      formatTokens(row.input),
      formatTokens(row.output),
      formatTokens(row.cacheRead),
    ]);
  }

  const total = rows.reduce(
    (sum, row) => ({
      input: sum.input + row.input,
      output: sum.output + row.output,
      cacheRead: sum.cacheRead + row.cacheRead,
      total: sum.total + row.total,
      cost: sum.cost + row.cost,
      hasEstimates: sum.hasEstimates || row.hasEstimates,
      models: [...new Set([...sum.models, ...row.models])],
    }),
    { input: 0, output: 0, cacheRead: 0, total: 0, cost: 0, hasEstimates: false, models: [] as string[] },
  );

  table.push([
    chalk.bold("TOTAL"),
    `${since} to ${until}`,
    chalk.bold(total.hasEstimates ? "Mixed" : "Measured"),
    total.models.join("\n"),
    chalk.bold(formatTokens(total.total)),
    chalk.bold(`${total.hasEstimates ? "~" : ""}${formatCost(total.cost)}`),
    chalk.bold(formatTokens(total.input)),
    chalk.bold(formatTokens(total.output)),
    chalk.bold(formatTokens(total.cacheRead)),
  ]);

  console.log(table.toString());
}


