import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateCost } from "../src/pricing/models.js";
import { splitOpenAIInputTokens } from "../src/parsers/codex.js";

test("prices GPT-5.5 with current standard API rates", () => {
  const cost = calculateCost("gpt-5.5", {
    input: 1_000_000,
    output: 1_000_000,
    cacheRead: 1_000_000,
    cacheCreate: 0,
  });

  assert.equal(cost, 35.5);
});

test("prices GPT-5.4 and mini variants with cached input discounts", () => {
  assert.equal(
    calculateCost("gpt-5.4", {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 1_000_000,
      cacheCreate: 0,
    }),
    17.75,
  );

  assert.equal(
    calculateCost("gpt-5.4-mini", {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 1_000_000,
      cacheCreate: 0,
    }),
    5.325,
  );
});

test("treats OpenAI cached input as a subset of input tokens", () => {
  assert.deepEqual(splitOpenAIInputTokens(1_000_000, 800_000), {
    input: 200_000,
    cacheRead: 800_000,
  });

  assert.deepEqual(splitOpenAIInputTokens(100_000, 120_000), {
    input: 0,
    cacheRead: 100_000,
  });
});

test("treats Mimo Claude Code models as zero-cost subscription usage", () => {
  assert.equal(calculateCost("mimo-v2.5", {
    input: 1_000_000,
    output: 1_000_000,
    cacheRead: 1_000_000,
    cacheCreate: 0,
  }), 0);
});
