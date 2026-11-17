# Recall AI plugins

**Sign in first.** Every coding-agent plugin and MCP server uses the login from the Recall CLI, and refuses to run
without it (Claude Code shows "not logged in" at session start; the MCP servers won't start):

```sh
npx @tryrecallai/cli login          # opens your browser; this machine gets its own key
npx @tryrecallai/cli setup --all    # every agent found on this machine; or setup <agent> for one
npx @tryrecallai/cli doctor         # what works: login, this folder's realm, each agent's hooks and last capture
```

The login lives in `~/.recall/config.json`; `recall logout` turns every plugin off again. `RECALL_API_KEY` overrides it
(CI, servers without a browser). Every agent uses the realm **`project-<repository folder>`**, from any subfolder, so
all your agents share one memory per repository. `recall connect <realm>` links a folder to another realm (saved in
`.recall.json`, found from any subfolder up to the repository root); `RECALL_REALM` overrides it for a session, and
`RECALL_BASE_URL` points at another deployment.

| Agent | What Recall does there | Install |
| --- | --- | --- |
| [Claude Code](claude-code) | About at session start, relevant notes with each prompt, the conversation saved turn by turn; the Recall tools and `/recall:remember`, `/recall:recall`, `/recall:pause` | `/plugin marketplace add Nidonic/Recall-AI-`, then `/plugin install recall@recall-ai` |
| [Codex](codex) | About, notes with each prompt, turn-by-turn saving (`~/.codex/hooks.json`); Recall tools | `recall setup codex`, then approve the hooks once with `/hooks` in Codex |
| Gemini CLI | About, notes with each prompt, turn-by-turn saving (`~/.gemini/settings.json`); Recall tools | `recall setup gemini` |
| Qwen Code | About, notes with each prompt, turn-by-turn saving (`~/.qwen/settings.json`); Recall tools | `recall setup qwen` |
| Factory Droid | About, notes with each prompt, turn-by-turn saving (`~/.factory/hooks.json`) | `recall setup factory` |
| [OpenCode](opencode) | About and notes with each message, turn-by-turn saving (a plugin in `~/.config/opencode/plugins/`); Recall tools | `recall setup opencode` |
| [Cline](cline) | About and notes before each run, turn-by-turn saving (a plugin in `~/.cline/plugins/recall/`) | `recall setup cline` |
| [Amp](amp) | About and notes appended to each prompt, turn-by-turn saving (a plugin in `~/.config/amp/plugins/recall/`) | `recall setup amp` |
| [Cursor](cursor) | About at session start, turn-by-turn saving (`~/.cursor/hooks.json`); Cursor's prompt hook can't add context, so notes come through the Recall tools; optional always-on rule | `recall setup cursor`; optionally copy `recall.mdc` to `.cursor/rules/` |
| Copilot (CLI) | As on Cursor: About at session start, turn-by-turn saving (`~/.copilot/hooks/recall.json`), notes through the Recall tools. Copilot hooks are in preview | `recall setup copilot` |
| Windsurf / Devin | About and notes with each prompt; **your prompts** are saved (its hooks carry no reply, so answers are not) | `recall setup devin` |
| Kiro | About and notes with each prompt (global hooks in `~/.kiro/hooks/`); your prompts are saved (no reply in its hooks); Recall tools | `recall setup kiro` |
| [Browser](browser) | Save the page (button, right-click, `Alt+Shift+S`) or a selection, with private parts and secrets removed first; find from the toolbar; sign in through the console | `chrome://extensions` → Developer mode → Load unpacked → `plugins/browser`, then Settings → Sign in with Recall |

Agents without hooks (Zed, Aider, Continue): add the Recall MCP server (`recall mcp`) and a rule telling the agent to
use `recall_find` and `recall_save`; finding works, saving depends on the model.

MCP tools: `recall_save`, `recall_find`, `recall_about`, `recall_remove`, `recall_notes`, `recall_graph` (the earlier names
`memory_add` and `memory_search` still work).

## How capture works

Each agent's hooks run one shared core (`hook.mjs`; `recall setup` copies it to `~/.recall/bin/`). It keeps your prompt
and the agent's reply in a local spool (`~/.recall/state/`), and sends only the new turns, appended to one file per
session. A send that fails or times out is retried later without duplicates or a second charge. Agents that wait on
their hooks get an instant answer; the send runs in the background.

## Privacy

Saving conversations is on by default. Before anything is written to disk or sent:

- text inside `<private>…</private>` becomes `[private]` (a message that is all private is not kept at all);
- likely secrets are masked: provider tokens (`sk-…`, `ghp_…`, `xox…-`, `AKIA…`, Recall's own `rc_…`), `*_KEY=`,
  `TOKEN`/`SECRET`/`PASSWORD` assignments, `Bearer` tokens, JWTs, private keys, passwords in URLs. Recall's server
  masks provider tokens in captured turns a second time. This is best-effort: put anything that must never leave
  your machine inside `<private>`;
- tool calls and tool output are never sent.

To stop saving: `recall pause [hours]` (or `/recall:pause` in Claude Code) pauses this machine, `recall pause off`
resumes; `"save": false` in a repository's `.recall.json` turns it off there; `RECALL_SAVE=off` turns it off for a
session (`RECALL_CAPTURE=off` still works). Finding notes keeps working in every case.

## License

Copyright © 2026 Nidonic Labs. All rights reserved. Proprietary software; see `LICENSE` at the repository root.
