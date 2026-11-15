#!/usr/bin/env node
// Copyright © 2026 Nidonic Labs. All rights reserved.
// Recall AI's MCP server for Claude Code, over stdio: forwards each JSON-RPC line to <server>/mcp with the key from
// `recall login` (or RECALL_API_KEY). Without a login it refuses to start, so the tools never appear unauthenticated.
import { createInterface } from "node:readline";
import { login, NOT_LOGGED_IN } from "./recall.mjs";

const auth = login();
if (!auth) { process.stderr.write(`${NOT_LOGGED_IN}\n`); process.exit(1); }
const url = `${(auth.base || "https://recallai.nidonic.online").replace(/\/+$/, "")}/mcp`;
const reply = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
// A network failure before any answer (dropped socket, DNS blip) is retried twice, after 0.5 s and 1.5 s, instead of
// reaching the agent as a bare "fetch failed". Same policy as `recall mcp` in packages/cli.
async function fetchRetrying(target, init, waits = [500, 1500]) {
  for (let attempt = 0; ; attempt++) {
    try { return await fetch(target, init); }
    catch (err) {
      const code = err?.cause?.code || err?.code || err?.cause?.message || err?.message || "network error";
      if (attempt >= waits.length) throw new Error(`Couldn't reach Recall (${code}) after ${attempt + 1} tries. Check the connection and try again.`);
      process.stderr.write(`recall: network error (${code}), retrying\n`);
      await new Promise((ok) => setTimeout(ok, waits[attempt]));
    }
  }
}

for await (const line of createInterface({ input: process.stdin, terminal: false })) {
  if (!line.trim()) continue;
  let msg;
  try { msg = JSON.parse(line); } catch { reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); continue; }
  const wantsReply = msg.id !== undefined && msg.id !== null;
  fetchRetrying(url, { method: "POST", body: line, headers: { Authorization: `Bearer ${auth.key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" } })
    .then(async (res) => {
      if (!wantsReply) return;
      if (res.status === 401) throw new Error("Your Recall login is no longer valid. Run `npx @tryrecallai/cli login`.");
      const text = (await res.text()).trim();
      if (text.startsWith("{")) process.stdout.write(text + "\n"); else throw new Error(`Recall returned HTTP ${res.status}`);
    })
    .catch((err) => { if (wantsReply) reply({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: err.message } }); });
}
