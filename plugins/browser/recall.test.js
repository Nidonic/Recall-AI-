// node --test plugins/browser — the extension's shared module against a fake `chrome` and a stubbed fetch.
import { test } from "node:test";
import assert from "node:assert/strict";

const store = {};
globalThis.chrome = {
  runtime: { id: "abcdefghijklmnopabcdefghijklmnop" },
  storage: { local: {
    get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((k) => k in store).map((k) => [k, store[k]])),
    set: async (o) => { Object.assign(store, o); },
    remove: async (k) => { delete store[k]; },
  } },
  tabs: { create: async ({ url }) => { opened.push(url); } },
};
const opened = [], posts = [];
globalThis.fetch = async (url, init) => { posts.push({ url: String(url), body: JSON.parse(init.body) }); return new Response("{}"); };
const { acceptSignIn, savePage, saveSelection, signIn } = await import("./recall.js");

test("pages and selections are redacted first; a selection saved twice has one External ID", async () => {
  store.apiKey = "rc_test";
  await savePage({ title: "Docs", url: "https://example.com/a", text: "Deploy with OPENAI_API_KEY=sk-abcdefghijklmnop1234 <private>my notes</private> today." });
  assert.equal(posts[0].body.content, "Deploy with OPENAI_API_KEY=[redacted] [private] today.");
  const sel = { title: "Docs", url: "https://example.com/a", text: "We pin Node 22 in CI." };
  await saveSelection(sel); await saveSelection(sel);
  assert.match(posts[1].body.customId, /^selection:[0-9a-f]{32}$/);
  assert.equal(posts[2].body.customId, posts[1].body.customId);
  await assert.rejects(saveSelection({ ...sel, text: "<private>only this</private>" }), /all of it was private/);
});

test("sign in: opens the console with this extension's id; only its own fresh state from the Recall origin is accepted", async () => {
  delete store.apiKey;
  await signIn();
  const url = new URL(opened[0]), q = new URLSearchParams(url.hash.slice("#ext-login?".length));
  assert.equal(url.origin + url.pathname, "https://recallai.nidonic.online/console");
  assert.equal(q.get("ext"), chrome.runtime.id);
  const state = q.get("state");
  assert.deepEqual(await acceptSignIn({ state, key: "rc_good" }, "https://evil.example"), { ok: false }, "wrong origin");
  assert.deepEqual(await acceptSignIn({ state: "0".repeat(32), key: "rc_good" }, "https://recallai.nidonic.online"), { ok: false }, "wrong state");
  assert.deepEqual(await acceptSignIn({ state, key: "rc_good" }, "https://recallai.nidonic.online"), { ok: true });
  assert.equal(store.apiKey, "rc_good");
  assert.deepEqual(await acceptSignIn({ state, key: "rc_again" }, "https://recallai.nidonic.online"), { ok: false }, "used once");
});
