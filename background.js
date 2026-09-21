globalThis.KrbBrowser.runtime.onMessage.addListener(function (message, sender, sendResponse) {
	if (message?.type !== "KRB_OPEN_SETTINGS" || sender.id !== globalThis.KrbBrowser.runtime.id || !sender.tab) return;
	openSettings(sender.tab.windowId, sendResponse);
	return true;
});

async function openSettings(windowId, sendResponse) {
	try {
		await globalThis.KrbBrowser.action.openPopup({ windowId });
		sendResponse({ ok: true });
	}
	catch (error) {
		sendResponse({ ok: false, error: error.message });
	}
}
