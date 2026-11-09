// node --test plugins/claude-code/scripts
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { namespaceFor, transcriptText } from "./recall.mjs";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const loggedOut = () => ({ ...process.env, RECALL_API_KEY: "", RECALL_CONFIG_DIR: mkdtempSync(join(tmpdir(), "recall-cc-")) });

test("transcriptText keeps user/assistant text and drops tools, meta and private blocks", () => {
  const lines = [
    { type: "user", message: { role: "user", content: "We deploy with Vercel. <private>token abc</private>" } },
    { type: "assistant", message: { content: [{ type: "text", text: "Noted." }, { type: "tool_use", name: "Bash", input: {} }] } },
    { type: "user", message: { content: [{ type: "tool_result", content: "secret output" }] } },
    { type: "user", isMeta: true, message: { content: "meta" } },
    { type: "user", message: { content: "<command-name>/mcp</command-name>" } },
    { type: "summary", summary: "x" },
  ].map((l) => JSON.stringify(l)).join("\n") + "\nnot json";
  assert.equal(transcriptText(lines), "User: We deploy with Vercel. [private]\n\nAssistant: Noted.");
});

test("namespaceFor derives a valid project namespace", () => {
  delete process.env.RECALL_NAMESPACE;
  assert.equal(namespaceFor("E:\\code\\My App (v2)"), "project-My-App--v2-");
  assert.match(namespaceFor("/home/me/recall"), /^project-recall$/);
});

test("without a login: SessionStart tells the user to log in, other hooks stay silent", () => {
  const start = spawnSync(process.execPath, [here("./recall.mjs"), "start"], { input: "{}", env: loggedOut(), encoding: "utf8" });
  assert.equal(start.status, 0);
  assert.match(JSON.parse(start.stdout).systemMessage, /not logged in.*recall-ai\/cli login/);
  const prompt = spawnSync(process.execPath, [here("./recall.mjs"), "prompt"], { input: JSON.stringify({ prompt: "how do we deploy this app?" }), env: loggedOut(), encoding: "utf8" });
  assert.equal(prompt.status, 0);
  assert.equal(prompt.stdout, "");
});

test("without a login the MCP server refuses to start", () => {
  const r = spawnSync(process.execPath, [here("./mcp.mjs")], { input: "", env: loggedOut(), encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not logged in/);
});

test("learn saves in the background only after enough new conversation, and honours RECALL_SAVE=off", async () => {
  const posts = [];
  const server = createServer((req, res) => { req.resume(); req.on("end", () => { posts.push(req.url); res.setHeader("content-type", "application/json"); res.end("{}"); }); });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const dir = mkdtempSync(join(tmpdir(), "recall-learn-")), transcript = join(dir, "t.jsonl");
  const say = (n) => JSON.stringify({ type: "assistant", message: { content: "We decided something important today. ".repeat(n) } }) + "\n";
  const input = JSON.stringify({ cwd: dir, transcript_path: transcript, session_id: `learn-${Date.now()}` });
  const env = { ...process.env, RECALL_API_KEY: "rc_test", RECALL_BASE_URL: `http://127.0.0.1:${server.address().port}` };
  const learn = (extra = {}) => new Promise((ok) => { const p = spawn(process.execPath, [here("./recall.mjs"), "learn"], { env: { ...env, ...extra } }); p.on("close", ok); p.stdin.end(input); });
  try {
    writeFileSync(transcript, say(100));
    await learn(); assert.equal(posts.length, 1, "first save");
    await learn(); assert.equal(posts.length, 1, "nothing new: no save");
    appendFileSync(transcript, say(10)); await learn(); assert.equal(posts.length, 1, "too little new text");
    appendFileSync(transcript, say(100)); await learn({ RECALL_SAVE: "off" }); assert.equal(posts.length, 1, "turned off");
    await learn(); assert.equal(posts.length, 2, "enough new text");
    assert.match(posts[1], /^\/v1\/realms\/.+\/file$/);
  } finally { server.close(); }
});
