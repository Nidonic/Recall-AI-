import { DEFAULTS, settings, signIn } from "./recall.js";

const fields = Object.keys(DEFAULTS);
const $ = (id) => document.getElementById(id);

settings().then((s) => { for (const f of fields) $(f).value = s[f]; });

$("signin").addEventListener("click", () => signIn());
// The key arrives from the console in the background; show it once it is there.
chrome.storage.onChanged.addListener((changes) => { if (changes.apiKey?.newValue) { $("apiKey").value = changes.apiKey.newValue; $("status").textContent = "Signed in."; } });

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const next = Object.fromEntries(fields.map((f) => [f, $(f).value.trim()]));
  // a self-hosted or staging URL needs the user's permission to call it
  if (next.baseUrl !== DEFAULTS.baseUrl) {
    const origin = `${new URL(next.baseUrl).origin}/*`;
    if (!(await chrome.permissions.request({ origins: [origin] }))) return ($("status").textContent = "Permission for that URL was refused.");
  }
  await chrome.storage.local.set(next);
  $("status").textContent = "Saved.";
});
