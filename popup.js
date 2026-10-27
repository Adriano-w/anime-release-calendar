"use strict";

document.getElementById("open").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("calendar.html") });
});

(async function start() {
  await initLanguage();
  applyStaticTranslations();
})();
