#!/usr/bin/env node
// Recall AI for Claude Code. Copyright © 2026 Nidonic Labs. All rights reserved.
// Run by the plugin's hooks: `node recall.mjs <start|prompt|turn_end|compact|end>` with the hook's JSON on stdin.
// The work is done by hook.mjs, the same core `recall hook` runs for every agent (copied from packages/cli/bin).
import { runHook } from "./hook.mjs";

await runHook("claude-code", process.argv[2]);
