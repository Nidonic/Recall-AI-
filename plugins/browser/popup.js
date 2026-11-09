import { api, readTab, savePage, settings } from "./recall.js";

const $ = (id) => document.getElementById(id);
const status = (text) => { $("status").textContent = text; };

settings().then((s) => {
  $("ns").textContent = s.namespace;
  if (!s.apiKey) status("Add your API key in Settings to start.");
});

$("save").addEventListener("click", async () => {
  status("Saving…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const page = await readTab(tab.id);
    if (!page.text.trim()) return status("This page has no text to save.");
    await savePage(page);
    status("Saved. Findable in a few seconds.");
  } catch (err) { status(err.message); }
});

$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (!q) return;
  status("Finding…");
  $("results").replaceChildren();
  try {
    const { results } = await api("POST", "/find", { q, limit: 8 });
    status(results.length ? "" : "Nothing found.");
    for (const r of results) {
      const li = document.createElement("li");
      const text = document.createElement("p");
      text.textContent = r.text.length > 280 ? `${r.text.slice(0, 280)}…` : r.text;
      li.append(text);
      const src = r.metadata?.url;
      if (typeof src === "string" && /^https?:\/\//.test(src)) {
        const a = document.createElement("a");
        a.href = src; a.target = "_blank"; a.rel = "noreferrer";
        a.textContent = r.document_title || src;
        li.append(a);
      } else if (r.document_title) {
        const t = document.createElement("span");
        t.className = "muted"; t.textContent = r.document_title;
        li.append(t);
      }
      $("results").append(li);
    }
  } catch (err) { status(err.message); }
});
