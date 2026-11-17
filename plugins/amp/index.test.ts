// node --test plugins/amp/index.test.ts (Node 24 strips the types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RECALL_CONFIG_DIR = mkdtempSync(join(tmpdir(), "recall-amp-"));
process.env.RECALL_API_KEY = "rc_test";
process.env.RECALL_BASE_URL = "http://recall.test";
const { default: recall } = await import("./index.ts");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => Promise<any>;
const fakeAmp = () => {
  const on: Record<string, Handler> = {};
  return { on: (name: string, fn: Handler) => { on[name] = fn; }, handlers: on, system: { workspaceRoot: null }, helpers: { filePathFromURI: (u: string) => u } };
};
const text = (role: string, t: string) => ({ role, id: t.slice(0, 8), content: [{ type: "text", text: t }] });

test("agent.start appends About and notes to the user's message; agent.end saves the turn", async () => {
  const posts: { customId: string; content: string }[] = [], realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { body?: string }) => {
    url = String(url);
    if (url.endsWith("/file")) posts.push(JSON.parse(init.body ?? "{}"));
    return new Response(JSON.stringify(url.endsWith("/about") ? { static: [{ memory: "The API runs on Supabase." }], dynamic: [] } : { results: [{ text: "We deploy on Fridays." }] }));
  }) as typeof fetch;
  try {
    const amp = fakeAmp();
    recall(amp);
    const start = await amp.handlers["agent.start"]({ thread: { id: "T-1" }, message: "When do we deploy the API to production?", id: "u1" });
    assert.equal(start.message.display, false);
    assert.match(start.message.content, /Supabase[\s\S]*Fridays/);
    const turn = [
      text("user", "When do we deploy the API to production? Our team keeps forgetting the schedule."),
      { role: "assistant", content: [{ type: "tool_use", name: "Read" }] },
      { role: "user", content: [{ type: "tool_result", content: "file contents" }] },
      text("assistant", "Production deploys go out on Fridays, after the database migrations have run."),
    ];
    await amp.handlers["agent.end"]({ thread: { id: "T-1" }, status: "cancelled", messages: turn });
    await amp.handlers["agent.end"]({ thread: { id: "T-1" }, status: "done", messages: turn });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(posts.length, 0, "below the batch size");
    for (let i = 0; i < 2; i++) await amp.handlers["agent.end"]({ thread: { id: "T-1" }, status: "done", messages: [text("user", `Question ${i}: what else should I know about releases here?`), text("assistant", `Answer ${i}: hotfixes ship any day; staging resets on Mondays.`)] });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].customId, "amp:T-1");
    assert.doesNotMatch(posts[0].content, /file contents/);
    assert.match(posts[0].content, /### User[^\n]*\nWhen do we deploy[\s\S]*### Assistant[^\n]*\nProduction deploys/);
  } finally { globalThis.fetch = realFetch; }
});
