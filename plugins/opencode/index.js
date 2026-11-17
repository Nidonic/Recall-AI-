// Recall AI for OpenCode. Copyright © 2026 Nidonic Labs. All rights reserved.
// Injects About and relevant notes into each message and saves the conversation as it goes, turn by turn.
// Tools (recall_find / recall_save) come from Recall's MCP server (`recall setup opencode`).
// Needs `recall login` (or RECALL_API_KEY); without it the plugin logs how to log in and does nothing.
// The work is done by hook.mjs, the same core `recall hook` runs for every agent (copied from packages/cli/bin).
import { capturing, login, NOT_LOGGED_IN, promptContext, realmFor, send, spool, startContext } from "./hook.mjs";

/** A message's own text: no synthetic parts (our injections), no ignored parts, no tool output. */
export const textOf = (parts) => parts.filter((p) => p.type === "text" && !p.synthetic && !p.ignored).map((p) => p.text).join("\n").trim();

/** @type {import("@opencode-ai/plugin").Plugin} */
export const RecallPlugin = async ({ client, directory }) => {
  const auth = login();
  if (!auth) {
    await client?.app?.log?.({ body: { service: "recall", level: "warn", message: NOT_LOGGED_IN } }).catch(() => {});
    return {};
  }
  const where = realmFor(directory), { realm } = where;
  const started = new Set(); // sessions that already got About

  return {
    "chat.message": async (input, output) => {
      const prompt = textOf(output.parts);
      if (!prompt) return;
      const blocks = [];
      try {
        if (!started.has(input.sessionID)) {
          started.add(input.sessionID);
          blocks.push(await startContext(auth, realm));
        }
        const notes = await promptContext(auth, realm, "opencode", input.sessionID, prompt);
        if (notes) blocks.push(notes);
      } catch { /* memory is a bonus: never fail the user's message */ }
      if (blocks.length) {
        output.parts.push({ id: `prt_recall_${Date.now()}`, sessionID: input.sessionID, messageID: output.message.id, type: "text", text: blocks.join("\n\n"), synthetic: true });
      }
    },

    event: async ({ event }) => {
      const id = event.properties?.sessionID ?? event.properties?.info?.id;
      if (!id || !capturing(where) || !["session.idle", "session.compacted", "session.deleted"].includes(event.type)) return;
      try {
        if (event.type === "session.idle") {
          const { data } = await client.session.messages({ path: { id } });
          spool("opencode", id, (data ?? []).map(({ info, parts }) => ({ id: info.id, role: info.role === "user" ? "user" : "assistant", text: textOf(parts) })));
        }
        await send(auth, realm, "opencode", id, { force: event.type !== "session.idle", repoId: where.repoId }); // compaction or deletion: send the rest now
      } catch { /* kept in the spool; sent on the next idle */ }
    },
  };
};
