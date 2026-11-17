---
description: Pause Recall's capture on this machine (incognito); `/recall:pause off` resumes
argument-hint: [hours | off]
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/recall.mjs" pause $ARGUMENTS`

Tell the user, in one line, what the command above printed. Do not save anything to Recall while capture is paused.
