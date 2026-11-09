# Recall AI plugins

**Sign in first.** Every coding-agent plugin and MCP server uses the login from the Recall CLI, and refuses to run
without it (Claude Code shows "not logged in" at session start; the MCP servers won't start):

```sh
npx @recall-ai/cli login          # opens your browser; this machine gets its own key
npx @recall-ai/cli setup cursor   # or claude, codex, opencode: adds the Recall MCP server
```

The login lives in `~/.recall/config.json`; `recall logout` turns every plugin off again. `RECALL_API_KEY` overrides it
(CI, servers without a browser). The plugins all use the realm **`project-<repo folder>`**, so Claude Code, OpenCode,
Cursor and Codex share one realm per repository. `recall connect <realm>` links a folder to another realm (saved in
`.recall.json`); `RECALL_REALM` overrides it for a session, and `RECALL_BASE_URL` points at another deployment.

| Plugin | What it does | Install |
| --- | --- | --- |
| [Claude Code](claude-code) | Brings in what Recall knows at session start and relevant notes with each prompt; keeps learning by saving the conversation in the background as it grows; adds the Recall tools and `/recall:remember`, `/recall:recall` | `/plugin marketplace add Nidonic/Recall-AI-`, then `/plugin install recall@recall-ai` |
| [OpenCode](opencode) | Brings in what Recall knows and relevant notes with each message; keeps learning by saving after each reply as the conversation grows | see below |
| [Cursor](cursor) | Recall tools plus an always-on rule telling the agent when to find and save | `recall setup cursor`, then copy `recall.mdc` to `.cursor/rules/` |
| [Codex](codex) | Recall tools plus an `AGENTS.md` section with the same rule | `recall setup codex`, then append `AGENTS.md` to your repo's `AGENTS.md` |
| [Browser](browser) | Save the page (button, right-click, `Alt+Shift+S`) or a selection; find from the toolbar | `chrome://extensions` → Developer mode → Load unpacked → `plugins/browser` |

MCP tools: `recall_save`, `recall_find`, `recall_about`, `recall_remove`, `recall_notes` (the earlier names
`memory_add` and `memory_search` still work).

## OpenCode

`recall setup opencode` adds the MCP server to `~/.config/opencode/opencode.json`. To bring in and save notes
automatically, copy `opencode/index.js` to `.opencode/plugin/recall.js` (until `opencode-recall` is published to npm).

## Privacy

Saving conversations is on by default in Claude Code and OpenCode. Text inside `<private>…</private>` is replaced with
`[private]` before it leaves your machine; tool calls and tool output are never sent. Set `RECALL_SAVE=off` to keep
finding notes but stop saving conversations (`RECALL_CAPTURE=off` still works).

## License

Copyright © 2026 Nidonic Labs. All rights reserved. Proprietary software; see `LICENSE` at the repository root.
