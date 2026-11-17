// Recall AI for Amp. Copyright © 2026 Nidonic Labs. All rights reserved.
// An Amp plugin (Bun): agent.start appends About (first turn of a thread) and the notes relevant to the prompt to the
// user's message; agent.end saves the turn's messages. Installed by `recall setup amp` into
// ~/.config/amp/plugins/recall/ with hook.mjs, the core every Recall agent hook runs (copied from packages/cli/bin).
// Needs `recall login` (or RECALL_API_KEY); without it the plugin does nothing.
// Types: @ampcode/plugin PluginEventMap (agent.start → { message?: { content, display? } }; agent.end: { status, messages }).
import { capturing, login, promptContext, realmFor, send, spool, startContext } from "./hook.mjs";

const HOOK_BUDGET_MS = 2_700; // memory is a bonus: a slow network never holds the turn
type Block = { type: string; text?: string };
type Message = { role: string; content?: Block[] };
const textOf = (m: Message) => (m.content ?? []).filter((b) => b?.type === "text").map((b) => b.text).join("\n").trim();
const within = <T>(ms: number, p: Promise<T>) => Promise.race([p, new Promise<null>((done) => setTimeout(() => done(null), ms))]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function recall(amp: any) {
  const started = new Set<string>(); // threads that already got About
  const cwd = () => {
    const root = amp.system?.workspaceRoot;
    return root ? amp.helpers.filePathFromURI(root) : process.cwd();
  };

  amp.on("agent.start", async (event: { thread: { id: string }; message: string }) => {
    const auth = login(), id = event?.thread?.id;
    if (!auth || !id) return undefined;
    const { realm } = realmFor(cwd());
    const first = !started.has(id);
    started.add(id);
    const parts = await within(HOOK_BUDGET_MS, Promise.all([
      first ? startContext(auth, realm).catch(() => null) : null,
      promptContext(auth, realm, "amp", id, event.message).catch(() => null),
    ]));
    const content = (parts ?? []).filter(Boolean).join("\n\n");
    return content ? { message: { content, display: false } } : undefined;
  });

  amp.on("agent.end", async (event: { thread: { id: string }; status: string; messages: Message[] }) => {
    const auth = login(), id = event?.thread?.id, where = realmFor(cwd());
    if (!auth || !id || event.status !== "done" || !capturing(where)) return undefined;
    // Only this turn's messages arrive here, so they need no ids; tool calls, results and info lines are not kept.
    const messages = (event.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, text: textOf(m) })).filter((m) => m.text);
    spool("amp", id, messages);
    send(auth, where.realm, "amp", id, { repoId: where.repoId }).catch(() => {}); // not awaited; kept spooled on failure
    return undefined;
  });
}
