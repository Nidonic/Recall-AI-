# Recall AI plugins

Long-term memory for AI coding agents, by [Nidonic Labs](https://nidonic.online/). Recall AI is a hosted service:
[recallai.nidonic.online](https://recallai.nidonic.online/).

## Install

Sign in first. Every plugin uses this login:

```sh
npx @tryrecallai/cli login
```

**Claude Code**

```
/plugin marketplace add Nidonic/Recall-AI-
/plugin install recall@recall-ai
```

**Every other agent** (Codex, Gemini CLI, Qwen Code, Factory, OpenCode, Cline, Amp, Cursor, Copilot, Windsurf, Kiro)

```sh
npx @tryrecallai/cli setup --all   # every agent found on this machine; or: setup codex, setup cline, ...
npx @tryrecallai/cli doctor        # check that capture works, agent by agent
```

[plugins/README.md](plugins/README.md) covers every plugin, including the browser extension, and what each one saves.

## License

Copyright © 2026 Nidonic Labs. All rights reserved. Proprietary software; see [LICENSE](LICENSE).
