import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conversationText, RecallPlugin } from "./index.js";

test("conversationText keeps real text, drops synthetic parts and tools", () => {
  const text = conversationText([
    { info: { role: "user" }, parts: [{ type: "text", text: "Use pnpm here. <private>k</private>" }, { type: "text", text: "injected", synthetic: true }] },
    { info: { role: "assistant" }, parts: [{ type: "tool", tool: "bash" }, { type: "text", text: "OK." }] },
    { info: { role: "assistant" }, parts: [{ type: "tool", tool: "read" }] },
  ]);
  assert.equal(text, "User: Use pnpm here. [private]\n\nAssistant: OK.");
});

test("without a login the plugin registers no hooks and says how to log in", async () => {
  delete process.env.RECALL_API_KEY;
  process.env.RECALL_CONFIG_DIR = mkdtempSync(join(tmpdir(), "recall-oc-")); // an empty login folder
  const logged = [];
  assert.deepEqual(await RecallPlugin({ client: { app: { log: async (m) => logged.push(m.body.message) } }, directory: "/x" }), {});
  assert.match(logged[0], /not logged in.*recall-ai\/cli login/);
});

test("with a saved `recall login` the plugin turns on", async () => {
  delete process.env.RECALL_API_KEY;
  process.env.RECALL_CONFIG_DIR = mkdtempSync(join(tmpdir(), "recall-oc-"));
  writeFileSync(join(process.env.RECALL_CONFIG_DIR, "config.json"), JSON.stringify({ apiKey: "rc_test", baseUrl: "http://127.0.0.1:9" }));
  const hooks = await RecallPlugin({ client: {}, directory: "/x" });
  assert.equal(typeof hooks["chat.message"], "function");
});
