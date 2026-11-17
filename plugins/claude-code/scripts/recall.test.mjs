// node --test plugins/claude-code/scripts — the plugin's hook script end to end, as Claude Code runs it.
// The core it calls (hook.mjs) is tested in packages/cli/test/hook.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const loggedOut = () => ({ ...process.env, RECALL_API_KEY: "", RECALL_CONFIG_DIR: mkdtempSync(join(tmpdir(), "recall-cc-")) });

test("without a login: SessionStart tells the user to log in, other hooks stay silent", () => {
  const start = spawnSync(process.execPath, [here("./recall.mjs"), "start"], { input: "{}", env: loggedOut(), encoding: "utf8" });
  assert.equal(start.status, 0);
  assert.match(JSON.parse(start.stdout).systemMessage, /not logged in.*tryrecallai\/cli login/);
  const prompt = spawnSync(process.execPath, [here("./recall.mjs"), "prompt"], { input: JSON.stringify({ prompt: "how do we deploy this app?" }), env: loggedOut(), encoding: "utf8" });
  assert.equal(prompt.status, 0);
  assert.equal(prompt.stdout, "");
});

test("without a login the MCP server refuses to start", () => {
  const r = spawnSync(process.execPath, [here("./mcp.mjs")], { input: "", env: loggedOut(), encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not logged in/);
});

test("prompt, Stop and SessionEnd: the exchange is appended once, under the session's id", async () => {
  const posts = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url.endsWith("/file")) posts.push({ url: req.url, body: JSON.parse(body) });
      res.setHeader("content-type", "application/json");
      res.end(req.url.endsWith("/find") ? '{"results":[]}' : "{}");
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const cwd = mkdtempSync(join(tmpdir(), "recall-cc-repo-"));
  mkdirSync(join(cwd, ".git"));
  const env = { ...loggedOut(), RECALL_API_KEY: "rc_test", RECALL_BASE_URL: `http://127.0.0.1:${server.address().port}` };
  const hook = (mode, input) => new Promise((ok) => {
    const p = spawn(process.execPath, [here("./recall.mjs"), mode], { env });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.on("close", (status) => ok({ status, out }));
    p.stdin.end(JSON.stringify({ session_id: "cc1", cwd, ...input }));
  });
  try {
    await hook("prompt", { prompt: "We release the mobile app through TestFlight every second Monday." });
    await hook("turn_end", { last_assistant_message: "Got it: TestFlight releases go out every second Monday, after QA signs off." });
    assert.equal(posts.length, 0, "Stop waits for a bigger batch");
    assert.equal((await hook("end", {})).status, 0);
    assert.equal(posts.length, 1);
    assert.match(posts[0].url, /^\/v1\/realms\/project-.+\/file$/);
    assert.match(posts[0].body.content, /### User[^\n]*\nWe release the mobile app[\s\S]*### Assistant[^\n]*\nGot it/);
    assert.equal(posts[0].body.customId, "claude-code:cc1");
    await hook("end", {}); // SessionEnd again (or PreCompact first): nothing new
    assert.equal(posts.length, 1);
  } finally { server.close(); }
});
