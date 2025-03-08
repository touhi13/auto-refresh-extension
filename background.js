// background.js
let refreshTimeout = null;
let targetTabId = null;
let nextRefreshTime = null;

// Get random time between min and max
function getRandomTime(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Schedule the next refresh
function scheduleRefresh(tabId, minTime, maxTime) {
    const refreshTime = getRandomTime(minTime, maxTime);
    console.log(`Next refresh in ${refreshTime} seconds`);

    // Clear any existing timeout
    if (refreshTimeout) {
        clearTimeout(refreshTimeout);
    }

    // Set the next refresh time (for countdown display)
    nextRefreshTime = Date.now() + (refreshTime * 1000);

    // Schedule the refresh
    refreshTimeout = setTimeout(() => {
        // Check if the tab still exists
        chrome.tabs.get(tabId, function (tab) {
            if (chrome.runtime.lastError) {
                console.log("Tab no longer exists, stopping auto-refresh");
                stopRefresh();
                return;
            }

            // Refresh the tab
            chrome.tabs.reload(tabId);

            // Check if we should continue refreshing
            chrome.storage.local.get('isActive', function (result) {
                if (result.isActive) {
                    chrome.storage.local.get(['minTime', 'maxTime'], function (timeResult) {
                        scheduleRefresh(tabId, timeResult.minTime, timeResult.maxTime);
                    });
                }
            });
        });
    }, refreshTime * 1000);
}

// Stop refreshing
function stopRefresh() {
    if (refreshTimeout) {
        clearTimeout(refreshTimeout);
        refreshTimeout = null;
    }
    nextRefreshTime = null;
    targetTabId = null;
    chrome.storage.local.set({ isActive: false });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === "startRefresh") {
        targetTabId = request.tabId;
        scheduleRefresh(request.tabId, request.minTime, request.maxTime);
        sendResponse({ status: "started" });
    }
    else if (request.action === "stopRefresh") {
        stopRefresh();
        sendResponse({ status: "stopped" });
    }
    else if (request.action === "getTimeLeft") {
        if (nextRefreshTime) {
            const timeLeft = (nextRefreshTime - Date.now()) / 1000;
            sendResponse({ timeLeft: timeLeft > 0 ? timeLeft : 0 });
        } else {
            sendResponse({ timeLeft: undefined });
        }
    }
    return true; // Keep the messaging channel open for async responses
});

// When the extension is installed or updated
chrome.runtime.onInstalled.addListener(function () {
    // Initialize default settings
    chrome.storage.local.set({
        minTime: 30,
        maxTime: 60,
        isActive: false
    });
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener(function (tabId) {
    if (tabId === targetTabId) {
        stopRefresh();
    }
});