#!/usr/bin/env node
// Recall AI for Claude Code. Copyright © 2026 Nidonic Labs. All rights reserved.
// One script, run by the plugin's hooks:
//   start   (SessionStart)      → inject what Recall knows about the project and tell Claude which realm to use
//   prompt  (UserPromptSubmit)  → find with the prompt, inject the top notes
//   learn   (Stop, in the background) → the same save, once the conversation has grown by LEARN_EVERY characters
//   capture (PreCompact, SessionEnd) → save the session's conversation as one file (updated, not duplicated)
// It needs `recall login` (or RECALL_API_KEY): without it, SessionStart tells you how to log in and nothing else runs.
// It never blocks a session: a timeout or an API error exits 0.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The `recall login` of this machine (or RECALL_API_KEY). Plugins never run without one. */
export function login() {
  if (process.env.RECALL_API_KEY) return { key: process.env.RECALL_API_KEY, base: process.env.RECALL_BASE_URL };
  try {
    const cfg = JSON.parse(readFileSync(join(process.env.RECALL_CONFIG_DIR || join(homedir(), ".recall"), "config.json"), "utf8"));
    return cfg.apiKey ? { key: cfg.apiKey, base: process.env.RECALL_BASE_URL || cfg.baseUrl } : null;
  } catch { return null; }
}
const linkedRealm = (dir) => { try { return JSON.parse(readFileSync(join(dir, ".recall.json"), "utf8")).realm || null; } catch { return null; } };
export const NOT_LOGGED_IN = "Recall AI is off: you are not logged in. Run `npx @recall-ai/cli login` in a terminal, then start a new session.";
let BASE = "https://recallai.nidonic.online";
const MAX_CAPTURE = 60_000; // characters of conversation kept per session (the most recent)
const LEARN_EVERY = 2_000; // re-save only after this much new conversation: each save is a metered write

/** Same rule in every Recall plugin, so Claude Code, OpenCode, Cursor and Codex share one realm per repo:
 *  the folder's .recall.json (from `recall connect`), else RECALL_REALM, else project-<folder>. */
export const namespaceFor = (cwd) =>
  linkedRealm(cwd || process.cwd()) || process.env.RECALL_REALM || process.env.RECALL_NAMESPACE || `project-${(cwd || process.cwd()).split(/[\\/]/).filter(Boolean).pop() ?? "default"}`.replace(/[^a-zA-Z0-9_:-]/g, "-").slice(0, 255);

/** A Claude Code transcript (JSONL) → "User: … / Assistant: …" text. Tool calls, tool results and meta lines are dropped. */
export function transcriptText(jsonl, max = MAX_CAPTURE) {
  const turns = [];
  for (const line of jsonl.split("\n")) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if ((entry.type !== "user" && entry.type !== "assistant") || entry.isMeta || entry.isSidechain) continue;
    const content = entry.message?.content;
    const text = typeof content === "string" ? content
      : Array.isArray(content) ? content.filter((p) => p.type === "text").map((p) => p.text).join("\n") : "";
    const clean = text.replace(/<private>[\s\S]*?<\/private>/g, "[private]").replace(/<(command|local-command|system-reminder)[\w-]*>[\s\S]*?<\/\1[\w-]*>/g, "").trim();
    if (clean) turns.push(`${entry.type === "user" ? "User" : "Assistant"}: ${clean}`);
  }
  return turns.join("\n\n").slice(-max);
}

async function api(key, ns, method, path, body, timeoutMs) {
  const res = await fetch(`${BASE}/v1/realms/${encodeURIComponent(ns)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 404) return null; // the realm has nothing saved yet: not an error for a new project
  if (!res.ok) throw new Error(`Recall ${method} ${path}: HTTP ${res.status}`);
  return res.json();
}

const inject = (event, text) =>
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));

async function main(mode, input, key) {
  const ns = namespaceFor(input.cwd);
  const howTo = `Recall AI realm for this project: "${ns}". Pass realm "${ns}" to the recall MCP tools (recall_find, recall_save). Save durable facts (decisions, preferences, conventions) with recall_save; use recall_find before guessing about past work.`;

  if (mode === "start") {
    const profile = await api(key, ns, "GET", "/about", undefined, 4000).catch(() => null); // a new realm has no About yet
    const facts = profile ? [...profile.static, ...profile.dynamic].slice(0, 30).map((m) => `- ${m.memory}`) : [];
    inject("SessionStart", facts.length ? `${howTo}\n\nWhat Recall knows about this project:\n${facts.join("\n")}` : howTo);
  } else if (mode === "prompt") {
    const prompt = (input.prompt || "").trim();
    if (prompt.length < 12 || prompt.startsWith("/")) return; // greetings and slash commands: nothing worth searching
    const results = (await api(key, ns, "POST", "/find", { q: prompt.slice(0, 2000), limit: 5, mode: "notes" }, 3000))?.results ?? [];
    if (results.length) inject("UserPromptSubmit", `Relevant notes from Recall ("${ns}"):\n${results.map((r) => `- ${r.text}`).join("\n")}`);
  } else if (mode === "capture" || mode === "learn") {
    if ((process.env.RECALL_SAVE ?? process.env.RECALL_CAPTURE) === "off" || !input.transcript_path || !input.session_id) return;
    const jsonl = readFileSync(input.transcript_path, "utf8");
    const content = transcriptText(jsonl);
    if (content.length < 200) return; // too short to hold a fact
    const mark = join(tmpdir(), `recall-${String(input.session_id).replace(/\W/g, "")}.saved`);
    const total = transcriptText(jsonl, Infinity).length; // the saved text stops growing at MAX_CAPTURE; this doesn't
    let saved = 0;
    try { saved = Number(readFileSync(mark, "utf8")) || 0; } catch { /* first save of this session */ }
    if (mode === "learn" && total - saved < LEARN_EVERY) return;
    await api(key, ns, "POST", "/file", {
      content,
      title: `Claude Code session ${new Date().toISOString().slice(0, 10)}`,
      customId: `claude-code:${input.session_id}`, // re-sending the same session updates it instead of duplicating
      metadata: { source: "claude-code", session: input.session_id },
    }, 12_000);
    writeFileSync(mark, String(total)); // only after a successful save, so a failed one is retried next turn
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const auth = login();
  let input = {};
  try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* no stdin */ }
  if (!auth) { // shown to the user, once per session; prompts and captures are skipped
    if (process.argv[2] === "start") process.stdout.write(JSON.stringify({ systemMessage: NOT_LOGGED_IN }));
  } else {
    BASE = (auth.base || BASE).replace(/\/+$/, "");
    await main(process.argv[2], input, auth.key).catch((err) => process.stderr.write(`recall: ${err.message}\n`));
  }
}
