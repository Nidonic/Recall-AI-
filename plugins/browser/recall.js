// Shared by the service worker, the popup and the options page.
import { redact } from "./redact.js"; // the agents' privacy pass (generated from the CLI's hook core)
export const DEFAULTS = { apiKey: "", baseUrl: "https://recallai.nidonic.online", namespace: "browser" };
export const MAX_PAGE_CHARS = 200_000; // well under the API's 2 MB file limit

export const settings = async () => ({ ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) });

export async function api(method, path, body) {
  const s = await settings();
  if (!s.apiKey) throw new Error("Add your Recall API key in the extension options first.");
  const res = await fetch(`${s.baseUrl.replace(/\/+$/, "")}/v1/realms/${encodeURIComponent(s.namespace)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${s.apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Recall returned HTTP ${res.status}`);
  return data;
}

/** Reads the visible text of a tab (needs activeTab: a click on the action, menu or shortcut). */
export async function readTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (max) => ({ title: document.title, url: location.href, text: (document.body?.innerText ?? "").slice(0, max) }),
    args: [MAX_PAGE_CHARS],
  });
  return result;
}

/** Text as it may leave the browser: <private>…</private> removed, likely secrets masked (best-effort). */
const clean = (text) => {
  const out = redact(text);
  if (!out) throw new Error("Nothing to save: all of it was private.");
  return out;
};

export const savePage = ({ title, url, text }) =>
  api("POST", "/file", {
    content: clean(text), title: title || url,
    customId: `page:${url}`.slice(0, 255), // saving the same page again refreshes it
    metadata: { source: "browser", url: url.slice(0, 1000) },
  });

const digest = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);

export const saveSelection = async ({ title, url, text }) => {
  const content = clean(text);
  return api("POST", "/file", {
    content, title: `Selection · ${title || url}`,
    customId: `selection:${await digest(`${url}\n${content}`)}`, // the same selection saved twice is one file
    metadata: { source: "browser", url: url.slice(0, 1000) },
  });
};

const PENDING = "recall.signIn"; // { state, expires }: one sign-in in flight
/** Sign in through the console, like `recall login`: it asks the user, mints a key for this browser and sends it here. */
export async function signIn() {
  const s = await settings(), state = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await chrome.storage.local.set({ [PENDING]: { state, expires: Date.now() + 10 * 60_000 } });
  await chrome.tabs.create({ url: `${s.baseUrl.replace(/\/+$/, "")}/console#ext-login?ext=${chrome.runtime.id}&state=${state}` });
}
/** The console's answer (background.js): saves the key if it answers our own, unexpired sign-in from the console's origin. */
export async function acceptSignIn(message, senderOrigin) {
  const s = await settings(), { [PENDING]: pending } = await chrome.storage.local.get(PENDING);
  const fresh = pending && pending.expires > Date.now() && message?.state === pending.state;
  if (!fresh || senderOrigin !== new URL(s.baseUrl).origin) return { ok: false };
  await chrome.storage.local.remove(PENDING);
  if (message.error || !/^rc_[A-Za-z0-9_-]+$/.test(message.key ?? "")) return { ok: false };
  await chrome.storage.local.set({ apiKey: message.key });
  return { ok: true };
}
