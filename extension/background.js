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

// The page asks for one screenshot of the visible tab (taken before the overlay fades in) so canvases,
// videos and iframes it cannot read can be shown as images. Needs only `activeTab`, which the toolbar click / hotkey grants.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'swarm:capture' || sender.id !== chrome.runtime.id || !sender.tab) return false;
  chrome.tabs
    .captureVisibleTab(sender.tab.windowId, { format: 'jpeg', quality: 85 })
    .then((dataUrl) => sendResponse({ dataUrl }))
    .catch(() => sendResponse({}));
  return true; // answer asynchronously
});

// Alt+Shift+P: click a section on the page, then rebuild only that. Running a command grants `activeTab`, like the toolbar click.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'pick-section' || !tab?.id) return;
  const target = { tabId: tab.id };
  try {
    await chrome.scripting.executeScript({ target, files: ['swarm-cursors.js'] });
    await chrome.scripting.executeScript({ target, func: () => void window.SwarmCursors.pickAndStart() });
  } catch (err) {
    chrome.action.setBadgeText({ tabId: tab.id, text: '×' });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#d33' });
    console.warn('[swarm-cursors] cannot run on this page', err);
  }
});
