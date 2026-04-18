// Listen for messages from booking page
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'BOOK_DEMO') {
    const { phone, date, time, spName } = message.data;

    // Store booking data
    chrome.storage.local.set({
      pendingBooking: { phone, date, time, spName, status: 'pending' }
    });

    // Open TeleCRM in new tab
    const workspaceId = '6995662b76252a5f9d43656a';
    chrome.tabs.create({
      url: `https://next.telecrm.in/${workspaceId}/leads/all-leads`
    }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });

    return true; // Keep message channel open
  }
});

// Listen for completion from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BOOKING_COMPLETE') {
    chrome.storage.local.set({
      pendingBooking: { ...message.data, status: 'complete' }
    });
  }
  if (message.type === 'BOOKING_FAILED') {
    chrome.storage.local.set({
      pendingBooking: { ...message.data, status: 'failed', error: message.error }
    });
  }
});
