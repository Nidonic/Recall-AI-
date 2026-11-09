import { readTab, savePage, saveSelection } from "./recall.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "selection", title: "Save selection to Recall", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "page", title: "Save page to Recall", contexts: ["page"] });
});

// A short badge is the feedback: ✓ saved, ! failed (the error goes to the worker console).
async function report(work) {
  try {
    await work;
    await chrome.action.setBadgeBackgroundColor({ color: "#3ba9ee" });
    await chrome.action.setBadgeText({ text: "✓" });
  } catch (err) {
    console.warn("Recall:", err.message);
    await chrome.action.setBadgeBackgroundColor({ color: "#d34545" });
    await chrome.action.setBadgeText({ text: "!" });
  }
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2500);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "selection") report(saveSelection({ title: tab.title, url: tab.url ?? "", text: info.selectionText ?? "" }));
  else report(readTab(tab.id).then(savePage));
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "save-page" && tab?.id) report(readTab(tab.id).then(savePage));
});
