# AI Usage Tracker

Track token usage across multiple AI coding CLI platforms.

## Installation

```bash
git clone https://github.com/OWNER/ai-usage-tracker.git
cd ai-usage-tracker
pnpm install
npm link
```

## Usage

```bash
# Show summary (default)
ai-usage

# Show daily breakdown
ai-usage daily

# Show each day for the latest seven days, plus the week total
ai-usage weekly

# Show each calendar week for the current month, plus the month total
ai-usage monthly

# Filter by platform
ai-usage --platform claude
ai-usage daily --platform antigravity

# Filter by date range
ai-usage daily --since 2026-06-01 --until 2026-06-08

# JSON output
ai-usage --json
ai-usage daily --json
```

## Supported Platforms

| Platform | Data Source | Status |
|----------|-------------|--------|
| Claude Code | `~/.claude/projects/` JSONL files | Working, measured |
| Antigravity | `~/.gemini/antigravity-cli/` history + conversation files | Working, estimated |
| Codex | `~/.codex/sessions/` token count events | Working, measured |
| Gemini CLI | `~/.gemini/logs/` log files | ⏳ Pending data |
| OpenCode | `~/.opencode/` session files | ⏳ Pending data |

Antigravity does not expose billing-grade token usage in local logs. Its usage is estimated once per unique conversation from conversation file size, then distributed by history activity date. Rows that include estimates are marked as `Estimated` or `Mixed`, and estimated costs are prefixed with `~`.

## Privacy and Accuracy

- All parsing happens locally.
- The project contains no telemetry or network requests.
- Prompt and response content is not printed by reports.
- Costs are API-equivalent calculations, not provider invoices.
- Antigravity usage is estimated and clearly labeled.

See [SECURITY.md](SECURITY.md) for the complete data-handling policy.

## Development

```bash
# Run in dev mode
pnpm dev

# Type check
pnpm typecheck

# Test calculation logic
pnpm test

# Build
pnpm build
```

## License

MIT
