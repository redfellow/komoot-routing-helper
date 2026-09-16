chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
	if (message?.type !== "KRB_OPEN_SETTINGS" || sender.id !== chrome.runtime.id || !sender.tab) return;
	openSettings(sender.tab.windowId, sendResponse);
	return true;
});

async function openSettings(windowId, sendResponse) {
	try {
		await chrome.action.openPopup({ windowId });
		sendResponse({ ok: true });
	}
	catch (error) {
		sendResponse({ ok: false, error: error.message });
	}
}
