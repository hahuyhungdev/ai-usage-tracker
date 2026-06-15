# Security and Privacy

## Local-only operation

AI Usage Tracker reads supported coding-agent logs from the current user's home
directory. It does not upload log contents, prompts, credentials, tokens, or
usage reports. The application has no telemetry and makes no network requests.

The CLI reports aggregate token counts, model names, dates, and estimated API
costs. It does not intentionally print prompt or response content.

## Data sources

- Claude Code: `~/.claude/projects/`
- Codex: `~/.codex/sessions/`
- Antigravity: `~/.gemini/antigravity-cli/`
- Gemini CLI: supported JSON or log files under `~/.gemini/`
- OpenCode: `~/.opencode/`

Antigravity token counts are estimates derived from local conversation storage.
They are marked `Estimated` or `Mixed` and must not be treated as provider
billing records. Claude Code and Codex totals are derived from recorded usage
fields, but calculated costs remain API-equivalent estimates and may differ from
subscription charges, discounts, taxes, or provider invoices.

## Reporting an issue

Open a GitHub security advisory or repository issue without including real log
files, authentication data, prompts, email addresses, or other private data.
