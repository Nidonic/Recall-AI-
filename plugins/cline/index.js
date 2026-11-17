// Recall AI for Cline. Copyright © 2026 Nidonic Labs. All rights reserved.
// A Cline SDK plugin (hooks only): beforeRun brings in About (first run of a conversation) and the notes relevant to
// the prompt, as appendContext; afterRun saves the conversation's new messages, turn by turn.
// Installed by `recall setup cline` into ~/.cline/plugins/recall/ with hook.mjs, the core every Recall agent hook
// runs (copied from packages/cli/bin). Needs `recall login` (or RECALL_API_KEY); without it the plugin does nothing.
// Types: @cline/shared AgentRuntimeHooks (beforeRun → { appendContext?: string }; snapshot.messages: { id, role, content[] }).
import { capturing, login, promptContext, realmFor, send, spool, startContext } from "./hook.mjs";

const HOOK_BUDGET_MS = 2_700; // Cline gives each hook 3 s; memory is a bonus, so it fails open before that
const textOf = (message) => (message?.content ?? []).filter((p) => p?.type === "text").map((p) => p.text).join("\n").trim();
const within = (ms, promise) => Promise.race([promise, new Promise((done) => setTimeout(() => done(null), ms))]);

let cwd = process.cwd(); // the session's folder, from setup(); process.cwd() is the host's
const started = new Set(); // conversations that already got About

export default {
  name: "recall",
  manifest: { capabilities: ["hooks"] },
  setup(_api, ctx) { if (ctx?.cwd) cwd = ctx.cwd; },
  hooks: {
    async beforeRun({ snapshot }) {
      const auth = login(), id = snapshot?.conversationId ?? snapshot?.agentId;
      if (!auth || !id || snapshot.parentAgentId) return undefined; // a subagent's run is its parent's business
      const { realm } = realmFor(cwd);
      const prompt = textOf([...(snapshot.messages ?? [])].reverse().find((m) => m.role === "user"));
      const first = !started.has(id);
      started.add(id);
      const parts = await within(HOOK_BUDGET_MS, Promise.all([
        first ? startContext(auth, realm).catch(() => null) : null,
        promptContext(auth, realm, "cline", id, prompt).catch(() => null),
      ]));
      const context = (parts ?? []).filter(Boolean).join("\n\n");
      return context ? { appendContext: context } : undefined;
    },
    async afterRun({ snapshot }) {
      const auth = login(), id = snapshot?.conversationId ?? snapshot?.agentId, where = realmFor(cwd);
      if (!auth || !id || snapshot.parentAgentId || !capturing(where)) return;
      const messages = (snapshot.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ id: m.id, role: m.role, text: textOf(m) })).filter((m) => m.text); // tool calls and results are not kept
      spool("cline", id, messages);
      // Not awaited: the hook has 3 s. A send that does not finish stays spooled for the next run.
      send(auth, where.realm, "cline", id, { repoId: where.repoId }).catch(() => {});
    },
  },
};
