#!/usr/bin/env node
// Recall AI for Claude Code. Copyright © 2026 Nidonic Labs. All rights reserved.
// Run by the plugin's hooks: `node recall.mjs <start|prompt|turn_end|compact|end>` with the hook's JSON on stdin, and by
// /recall:pause: `node recall.mjs pause [hours|off]`.
// The work is done by hook.mjs, the same core `recall hook` runs for every agent (copied from packages/cli/bin).
import { pause, runHook } from "./hook.mjs";

const [mode, arg] = process.argv.slice(2);
if (mode === "pause") {
  const off = /^(off|resume|0)$/i.test(arg ?? ""), hours = Number(arg || 1);
  const until = pause(off ? 0 : hours > 0 ? hours : 1);
  console.log(until ? `Recall capture is paused on this machine until ${new Date(until).toLocaleString()}. Find still works. /recall:pause off resumes it.` : "Recall capture resumed.");
} else {
  await runHook("claude-code", mode);
}
