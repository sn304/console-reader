// Listen for messages from panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'openEpub') {
    // Handle EPUB file opened by user
    chrome.storage.local.set({ currentBook: message.data });
    sendResponse({ success: true });
  }
});

// Listen for keyboard shortcut (boss key)
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    chrome.runtime.sendMessage({ type: 'togglePanel' });
  }
});
