// Toolbar click (or Alt+Shift+S) -> make sure the bundle is in the tab, then toggle the swarm.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const target = { tabId: tab.id };
  try {
    await chrome.scripting.executeScript({ target, files: ['swarm-cursors.js'] }); // idempotent: keeps the first instance
    await chrome.scripting.executeScript({
      target,
      func: () => (window.SwarmCursors.isRunning() ? window.SwarmCursors.stop() : window.SwarmCursors.start()),
    });
  } catch (err) {
    // chrome:// pages, the Web Store and the PDF viewer can't be scripted
    chrome.action.setBadgeText({ tabId: tab.id, text: '×' });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#d33' });
    console.warn('[swarm-cursors] cannot run on this page', err);
  }
});
