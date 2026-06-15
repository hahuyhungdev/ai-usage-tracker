import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateDailyUsage,
  getLatestWeekRange,
  listDates,
} from "../src/usage/weekly.js";

test("returns the latest seven calendar days without timezone shifts", () => {
  assert.deepEqual(getLatestWeekRange("2026-06-15"), {
    since: "2026-06-09",
    until: "2026-06-15",
  });

  assert.deepEqual(getLatestWeekRange("2026-01-03"), {
    since: "2025-12-28",
    until: "2026-01-03",
  });
});

test("lists every calendar day in the selected weekly range", () => {
  assert.deepEqual(listDates("2026-06-15", "2026-06-17"), [
    "2026-06-15",
    "2026-06-16",
    "2026-06-17",
  ]);
});

test("aggregates platform rows into one row per distinct day", () => {
  const rows = aggregateDailyUsage([
    {
      name: "Codex",
      data: [{
        date: "2026-06-15",
        input: 10,
        output: 2,
        cacheCreate: 0,
        cacheRead: 8,
        total: 20,
        cost: 1,
        models: [{
          model: "gpt-5.5",
          input: 10,
          output: 2,
          cacheCreate: 0,
          cacheRead: 8,
          total: 20,
          cost: 1,
        }],
      }],
    },
    {
      name: "Antigravity",
      data: [{
        date: "2026-06-15",
        input: 6,
        output: 2,
        cacheCreate: 0,
        cacheRead: 2,
        total: 10,
        cost: 0.5,
        models: [],
        modelNames: ["Gemini 3.5 Flash (High)", "Claude Opus 4.6 (Thinking)"],
        isEstimate: true,
        source: "estimated",
      }],
    },
  ], "2026-06-15", "2026-06-16");

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    date: "2026-06-15",
    input: 16,
    output: 4,
    cacheCreate: 0,
    cacheRead: 10,
    total: 30,
    cost: 1.5,
    source: "mixed",
    hasEstimates: true,
    platforms: ["Codex", "Antigravity"],
    models: ["gpt-5.5", "Gemini 3.5 Flash (High)", "Claude Opus 4.6 (Thinking)"],
  });
  assert.equal(rows[1].date, "2026-06-16");
  assert.equal(rows[1].total, 0);
  assert.equal(rows[1].source, "none");
  assert.deepEqual(rows[1].models, []);
});
