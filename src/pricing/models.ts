export interface ModelPricing {
  input: number;      // per 1M tokens
  output: number;     // per 1M tokens
  cacheRead: number;  // per 1M tokens
  cacheCreate: number; // per 1M tokens
}

// Pricing in USD per 1M tokens
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI Models
  'gpt-4': { input: 30.00, output: 60.00, cacheRead: 15.00, cacheCreate: 30.00 },
  'gpt-4-turbo': { input: 10.00, output: 30.00, cacheRead: 5.00, cacheCreate: 10.00 },
  'gpt-4o': { input: 5.00, output: 15.00, cacheRead: 2.50, cacheCreate: 5.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, cacheRead: 0.075, cacheCreate: 0.15 },
  'gpt-5': { input: 10.00, output: 30.00, cacheRead: 1.00, cacheCreate: 10.00 },
  'gpt-5-mini': { input: 1.00, output: 3.00, cacheRead: 0.50, cacheCreate: 1.00 },
  'gpt-5.3-codex': { input: 10.00, output: 30.00, cacheRead: 5.00, cacheCreate: 10.00 },
  'gpt-5.4': { input: 2.50, output: 15.00, cacheRead: 0.25, cacheCreate: 2.50 },
  'gpt-5.4-mini': { input: 0.75, output: 4.50, cacheRead: 0.075, cacheCreate: 0.75 },
  'gpt-5.5': { input: 5.00, output: 30.00, cacheRead: 0.50, cacheCreate: 5.00 },

  // Anthropic Models
  'claude-3-opus': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheCreate: 18.75 },
  'claude-3-sonnet': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheCreate: 3.75 },
  'claude-3-haiku': { input: 0.25, output: 1.25, cacheRead: 0.03, cacheCreate: 0.30 },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheCreate: 3.75 },
  'claude-sonnet-4': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheCreate: 3.75 },
  'claude-opus-4': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheCreate: 18.75 },

  // Google Models
  'gemini-1.5-pro': { input: 3.50, output: 10.50, cacheRead: 0.875, cacheCreate: 4.25 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30, cacheRead: 0.01875, cacheCreate: 0.1425 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40, cacheRead: 0.025, cacheCreate: 0.10 },
  'gemini-2.5-pro': { input: 1.25, output: 10.00, cacheRead: 0.3125, cacheCreate: 4.25 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60, cacheRead: 0.0375, cacheCreate: 0.15 },
  'gemini-3-flash-preview': { input: 0.10, output: 0.40, cacheRead: 0.025, cacheCreate: 0.10 },
  'gemini-3.5-flash': { input: 0.10, output: 0.40, cacheRead: 0.025, cacheCreate: 0.10 },
  'gemini-3.5-flash-high': { input: 0.10, output: 0.40, cacheRead: 0.025, cacheCreate: 0.10 },

  // Custom/Free Models
  'mimo-v2.5-pro': { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
  'mimo-v2.5': { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
  'mimo': { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
};

export function calculateCost(
  model: string,
  tokens: { input: number; output: number; cacheRead: number; cacheCreate: number; total?: number }
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini']; // fallback

  return (
    (tokens.input / 1_000_000) * pricing.input +
    (tokens.output / 1_000_000) * pricing.output +
    (tokens.cacheRead / 1_000_000) * pricing.cacheRead +
    (tokens.cacheCreate / 1_000_000) * pricing.cacheCreate
  );
}
