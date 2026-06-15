import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateMonthlyWeeks } from "../src/usage/monthly.js";

test("groups a month into Monday-to-Sunday rows clipped to the month", () => {
  const rows = aggregateMonthlyWeeks([
    {
      name: "Codex",
      data: [
        {
          date: "2026-05-01",
          input: 10,
          output: 2,
          cacheCreate: 0,
          cacheRead: 8,
          total: 20,
          cost: 1,
          models: [{ model: "gpt-5.5", input: 10, output: 2, cacheCreate: 0, cacheRead: 8, total: 20, cost: 1 }],
        },
        {
          date: "2026-05-04",
          input: 5,
          output: 1,
          cacheCreate: 0,
          cacheRead: 4,
          total: 10,
          cost: 0.5,
          models: [{ model: "gpt-5.5", input: 5, output: 1, cacheCreate: 0, cacheRead: 4, total: 10, cost: 0.5 }],
        },
      ],
    },
  ], "2026-05-01", "2026-05-31");

  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], {
    week: 1,
    since: "2026-05-01",
    until: "2026-05-03",
    input: 10,
    output: 2,
    cacheCreate: 0,
    cacheRead: 8,
    total: 20,
    cost: 1,
    source: "measured",
    hasEstimates: false,
    platforms: ["Codex"],
    models: ["gpt-5.5"],
  });
  assert.equal(rows[1].since, "2026-05-04");
  assert.equal(rows[1].until, "2026-05-10");
  assert.equal(rows[4].since, "2026-05-25");
  assert.equal(rows[4].until, "2026-05-31");
});

test("propagates estimated source and model metadata into a weekly row", () => {
  const [row] = aggregateMonthlyWeeks([{
    name: "Antigravity",
    data: [{
      date: "2026-06-01",
      input: 6,
      output: 2,
      cacheCreate: 0,
      cacheRead: 2,
      total: 10,
      cost: 0.5,
      models: [],
      modelNames: ["Gemini 3.5 Flash (High)"],
      isEstimate: true,
      source: "estimated",
    }],
  }], "2026-06-01", "2026-06-07");

  assert.equal(row.source, "estimated");
  assert.deepEqual(row.models, ["Gemini 3.5 Flash (High)"]);
});
