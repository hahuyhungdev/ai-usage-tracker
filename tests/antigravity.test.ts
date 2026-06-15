import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseAntigravityFromDir } from "../src/parsers/antigravity.js";

test("estimates Antigravity usage once per conversation instead of once per history row", () => {
  const root = mkdtempSync(join(tmpdir(), "ai-usage-agy-"));
  const convDir = join(root, "conversations");
  const logDir = join(root, "log");
  mkdirSync(convDir);
  mkdirSync(logDir);

  const day = Date.UTC(2026, 5, 15, 9, 0, 0);
  writeFileSync(
    join(root, "history.jsonl"),
    [
      JSON.stringify({ timestamp: day, conversationId: "conv-a", display: "first prompt" }),
      JSON.stringify({ timestamp: day + 60_000, conversationId: "conv-a", display: "second prompt" }),
      JSON.stringify({ timestamp: day + 120_000, conversationId: "conv-b", display: "third prompt" }),
    ].join("\n"),
  );
  writeFileSync(join(convDir, "conv-a.db"), "a".repeat(3_000));
  writeFileSync(join(convDir, "conv-b.db"), "b".repeat(6_000));
  writeFileSync(
    join(logDir, "cli-20260615_120000.log"),
    [
      'Propagating selected model override to backend: label="Gemini 3.5 Flash (High)"',
      "HandleUserInput called with text: first",
      'Propagating selected model override to backend: label="Claude Opus 4.6 (Thinking)"',
      "HandleUserInput called with text: second",
      'Propagating selected model override to backend: label="Gemini 3.5 Flash (High)"',
    ].join("\n"),
  );

  const [usage] = parseAntigravityFromDir(root);

  assert.equal(usage.date, "2026-06-15");
  assert.equal(usage.total, 7_500);
  assert.equal(usage.input, 4_500);
  assert.equal(usage.output, 1_500);
  assert.equal(usage.cacheRead, 1_500);
  assert.equal(usage.isEstimate, true);
  assert.equal(usage.source, "estimated");
  assert.deepEqual(usage.modelNames, [
    "Gemini 3.5 Flash (High)",
    "Claude Opus 4.6 (Thinking)",
  ]);
});
