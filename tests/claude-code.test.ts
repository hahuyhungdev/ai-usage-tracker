import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseClaudeCodeFromDir } from "../src/parsers/claude-code.js";

test("deduplicates repeated Claude message IDs and ignores synthetic usage", () => {
  const root = mkdtempSync(join(tmpdir(), "ai-usage-claude-"));
  const project = join(root, "project");
  mkdirSync(project);

  const message = {
    timestamp: "2026-06-15T10:00:00.000Z",
    message: {
      id: "msg-1",
      role: "assistant",
      model: "mimo-v2.5-pro",
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_read_input_tokens: 80,
      },
    },
  };
  const synthetic = {
    timestamp: "2026-06-15T10:01:00.000Z",
    message: {
      id: "msg-synthetic",
      role: "assistant",
      model: "<synthetic>",
      usage: { input_tokens: 999, output_tokens: 999 },
    },
  };

  writeFileSync(
    join(project, "session.jsonl"),
    [JSON.stringify(message), JSON.stringify(message), JSON.stringify(synthetic)].join("\n"),
  );

  const [usage] = parseClaudeCodeFromDir(root);
  assert.equal(usage.input, 100);
  assert.equal(usage.output, 20);
  assert.equal(usage.cacheRead, 80);
  assert.equal(usage.total, 200);
  assert.deepEqual(usage.models.map((model) => model.model), ["mimo-v2.5-pro"]);
});
