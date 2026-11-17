import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RECALL_CONFIG_DIR = mkdtempSync(join(tmpdir(), "recall-cline-"));
process.env.RECALL_API_KEY = "rc_test";
process.env.RECALL_BASE_URL = "http://recall.test";
const { default: plugin } = await import("./index.js");

const msg = (id, role, text) => ({ id, role, content: [{ type: "text", text }], createdAt: 0 });
const settle = () => new Promise((r) => setTimeout(r, 50)); // afterRun sends without awaiting

test("a Cline plugin: manifest with hooks, default export", () => {
  assert.equal(plugin.name, "recall");
  assert.deepEqual(plugin.manifest.capabilities, ["hooks"]);
  assert.equal(typeof plugin.hooks.beforeRun, "function");
});

test("beforeRun appends About once per conversation and the notes for the prompt; afterRun appends new messages only", async () => {
  const posts = [], finds = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    url = String(url);
    if (url.endsWith("/file")) posts.push(JSON.parse(init.body));
    if (url.endsWith("/find")) finds.push(JSON.parse(init.body).q);
    return new Response(JSON.stringify(url.endsWith("/about") ? { static: [{ memory: "The API runs on Supabase." }], dynamic: [] } : { results: [{ text: "We deploy on Fridays." }] }));
  };
  try {
    plugin.setup({}, { cwd: process.env.RECALL_CONFIG_DIR });
    const conversation = [msg("m1", "user", "When do we usually deploy the API to production around here?")];
    const first = await plugin.hooks.beforeRun({ snapshot: { conversationId: "c1", agentId: "a", parentAgentId: null, messages: conversation } });
    assert.match(first.appendContext, /Supabase[\s\S]*Fridays/);
    assert.deepEqual(finds, ["When do we usually deploy the API to production around here?"]);
    const second = await plugin.hooks.beforeRun({ snapshot: { conversationId: "c1", agentId: "a", parentAgentId: null, messages: conversation } });
    assert.equal(second, undefined, "About once; the note was already shown");
    const done = [...conversation,
      { id: "t1", role: "tool", content: [{ type: "tool-result", output: "secret file contents" }] },
      msg("m2", "assistant", "We deploy on Fridays, after the migrations run; the release checklist lives in the wiki.")];
    await plugin.hooks.afterRun({ snapshot: { conversationId: "c1", agentId: "a", parentAgentId: null, messages: done }, result: {} });
    await settle();
    assert.equal(posts.length, 0, "a small first batch waits");
    const more = [...done, msg("m3", "user", "Also remember that hotfixes skip the Friday window and ship any day of the week."),
      msg("m4", "assistant", "Noted: hotfixes can ship any day; regular releases stay on Fridays after the migrations."),
      msg("m5", "user", "And staging resets every Monday morning, so never leave test data there you still need."),
      msg("m6", "assistant", "Understood: staging is wiped every Monday morning, so test data there is temporary.")];
    await plugin.hooks.afterRun({ snapshot: { conversationId: "c1", agentId: "a", parentAgentId: null, messages: more }, result: {} });
    await settle();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].customId, "cline:c1");
    assert.doesNotMatch(posts[0].content, /secret file contents/, "tool results are not kept");
    assert.match(posts[0].content, /hotfixes skip[\s\S]*staging resets/);
    await plugin.hooks.afterRun({ snapshot: { conversationId: "c2", agentId: "b", parentAgentId: "a", messages: more }, result: {} });
    await settle();
    assert.equal(posts.length, 1, "a subagent's run is not saved");
  } finally { globalThis.fetch = realFetch; }
});
