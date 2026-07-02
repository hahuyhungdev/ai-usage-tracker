import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseAntigravityFromDir } from "../src/parsers/antigravity.js";
import { execSync } from "node:child_process";


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

test("accurately parses Antigravity precise usage from real SQLite database", () => {
  const root = mkdtempSync(join(tmpdir(), "ai-usage-precise-"));
  const convDir = join(root, "conversations");
  mkdirSync(convDir);

  const dbPath = join(convDir, "conv-precise.db");
  const pythonScript = `
import sqlite3

def encode_varint(val):
    res = bytearray()
    while True:
        towrite = val & 0x7f
        val >>= 7
        if val > 0:
            res.append(towrite | 0x80)
        else:
            res.append(towrite)
            break
    return bytes(res)

ts_bytes = encode_varint(1782957901)
ts_proto = b'\\x08' + ts_bytes
field1_proto = b'\\x0a' + encode_varint(len(ts_proto)) + ts_proto

f2_bytes = b'\\x10' + encode_varint(20000)
f3_bytes = b'\\x18' + encode_varint(1000)
f5_bytes = b'\\x28' + encode_varint(15000)
f9_sub = f2_bytes + f3_bytes + f5_bytes
field9_proto = b'\\x4a' + encode_varint(len(f9_sub)) + f9_sub

blob = field1_proto + field9_proto

conn = sqlite3.connect("${dbPath}")
cursor = conn.cursor()
cursor.execute("CREATE TABLE steps (idx integer, step_type integer, status integer, has_subtrajectory numeric, metadata blob)")
cursor.execute("INSERT INTO steps (idx, metadata) VALUES (0, ?)", (blob,))
conn.commit()
conn.close()
`;

  execSync(`python3 -c '${pythonScript.replace(/'/g, "'\\''")}'`);

  const [usage] = parseAntigravityFromDir(root);

  assert.ok(usage);
  assert.equal(usage.date, "2026-07-02");
  assert.equal(usage.input, 20000);
  assert.equal(usage.output, 1000);
  assert.equal(usage.cacheRead, 15000);
  assert.equal(usage.total, 36000);
  assert.equal(usage.isEstimate, false);
  assert.equal(usage.source, "measured");
});

