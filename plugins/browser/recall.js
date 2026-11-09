// Shared by the service worker, the popup and the options page.
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

export const savePage = ({ title, url, text }) =>
  api("POST", "/file", {
    content: text, title: title || url,
    customId: `page:${url}`.slice(0, 255), // saving the same page again refreshes it
    metadata: { source: "browser", url: url.slice(0, 1000) },
  });

export const saveSelection = ({ title, url, text }) =>
  api("POST", "/file", { content: text, title: `Selection · ${title || url}`, metadata: { source: "browser", url: url.slice(0, 1000) } });
