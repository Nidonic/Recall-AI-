import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecallPlugin, textOf } from "./index.js";

test("textOf keeps real text, drops synthetic parts and tools", () => {
  assert.equal(textOf([{ type: "text", text: "Use pnpm here." }, { type: "text", text: "injected", synthetic: true }, { type: "tool", tool: "bash" }]), "Use pnpm here.");
});

test("session.idle appends only messages not sent before; the first idle of an old session sends its last exchange", async () => {
  delete process.env.RECALL_API_KEY;
  process.env.RECALL_CONFIG_DIR = mkdtempSync(join(tmpdir(), "recall-oc-"));
  writeFileSync(join(process.env.RECALL_CONFIG_DIR, "config.json"), JSON.stringify({ apiKey: "rc_test", baseUrl: "http://recall.test" }));
  const posts = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (String(url).endsWith("/file")) posts.push(JSON.parse(init.body)); return new Response("{}"); };
  const msg = (id, role, text) => ({ info: { id, role }, parts: [{ type: "text", text }] });
  let messages = [
    msg("m1", "user", "An old question from before the plugin was installed, long enough to matter."),
    msg("m2", "assistant", "An old answer from before the plugin was installed, also long enough."),
    msg("m3", "user", "We publish the npm packages from the release branch only, never from main."),
    msg("m4", "assistant", "Understood: npm publishes happen from the release branch, not from main."),
  ];
  try {
    const hooks = await RecallPlugin({ client: { session: { messages: async () => ({ data: messages }) } }, directory: process.env.RECALL_CONFIG_DIR });
    await hooks.event({ event: { type: "session.idle", properties: { sessionID: "o1" } } });
    await hooks.event({ event: { type: "session.deleted", properties: { sessionID: "o1" } } }); // flush
    assert.equal(posts.length, 1);
    assert.doesNotMatch(posts[0].content, /old question/);
    assert.match(posts[0].content, /release branch only[\s\S]*### Assistant/);
    messages = [...messages, msg("m5", "user", "Use pnpm, not npm, for installs in this repository from now on."), msg("m6", "assistant", "Switching to pnpm for every install in this repository, and removing package-lock.json.")];
    await hooks.event({ event: { type: "session.idle", properties: { sessionID: "o1" } } });
    await hooks.event({ event: { type: "session.compacted", properties: { sessionID: "o1" } } });
    assert.equal(posts.length, 2);
    assert.doesNotMatch(posts[1].content, /release branch/);
    assert.match(posts[1].content, /pnpm/);
    assert.equal(posts[1].customId, "opencode:o1");
  } finally { globalThis.fetch = realFetch; }
});

test("without a login the plugin registers no hooks and says how to log in", async () => {
  delete process.env.RECALL_API_KEY;
  process.env.RECALL_CONFIG_DIR = mkdtempSync(join(tmpdir(), "recall-oc-")); // an empty login folder
  const logged = [];
  assert.deepEqual(await RecallPlugin({ client: { app: { log: async (m) => logged.push(m.body.message) } }, directory: "/x" }), {});
  assert.match(logged[0], /not logged in.*tryrecallai\/cli login/);
});

test("with a saved `recall login` the plugin turns on", async () => {
  delete process.env.RECALL_API_KEY;
  process.env.RECALL_CONFIG_DIR = mkdtempSync(join(tmpdir(), "recall-oc-"));
  writeFileSync(join(process.env.RECALL_CONFIG_DIR, "config.json"), JSON.stringify({ apiKey: "rc_test", baseUrl: "http://127.0.0.1:9" }));
  const hooks = await RecallPlugin({ client: {}, directory: "/x" });
  assert.equal(typeof hooks["chat.message"], "function");
});

test("a note is injected once per session", async () => {
  delete process.env.RECALL_API_KEY;
  process.env.RECALL_CONFIG_DIR = mkdtempSync(join(tmpdir(), "recall-oc-"));
  writeFileSync(join(process.env.RECALL_CONFIG_DIR, "config.json"), JSON.stringify({ apiKey: "rc_test", baseUrl: "http://recall.test" }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith("/about") ? { static: [], dynamic: [] } : { results: [{ text: "We deploy on Fridays." }] }));
  try {
    const hooks = await RecallPlugin({ client: {}, directory: "/x" });
    const send = async (sessionID) => {
      const output = { message: { id: "m" }, parts: [{ type: "text", text: "when do we deploy to production?" }] };
      await hooks["chat.message"]({ sessionID }, output);
      return output.parts.slice(1).map((p) => p.text).join("");
    };
    assert.match(await send("s1"), /Fridays/);
    assert.doesNotMatch(await send("s1"), /Fridays/); // already shown in this session
    assert.match(await send("s2"), /Fridays/); // a new session sees it again
  } finally { globalThis.fetch = realFetch; }
});
