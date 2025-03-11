// background.js
let targetTabId = null;
let nextRefreshTime = null;

// Get random time between min and max
function getRandomTime(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Schedule the next refresh using Chrome's alarm API
function scheduleRefresh(tabId, minTime, maxTime) {
    // Clear any existing alarms
    chrome.alarms.clearAll();

    // Calculate refresh time in minutes (alarm API uses minutes)
    const refreshTimeSeconds = getRandomTime(minTime, maxTime);
    const refreshTimeMinutes = refreshTimeSeconds / 60;

    console.log(`Next refresh in ${refreshTimeSeconds} seconds (${refreshTimeMinutes.toFixed(2)} minutes)`);

    // Set the next refresh time (for countdown display)
    nextRefreshTime = Date.now() + (refreshTimeSeconds * 1000);

    // Store the next refresh time in storage for persistence
    chrome.storage.local.set({
        isActive: true,
        targetTabId: tabId,
        nextRefreshTime: nextRefreshTime,
        minTime: minTime,
        maxTime: maxTime
    });

    // Create an alarm for the refresh
    chrome.alarms.create('refreshAlarm', {
        delayInMinutes: refreshTimeMinutes
    });
}

// Stop refreshing
function stopRefresh() {
    chrome.alarms.clearAll();
    nextRefreshTime = null;
    targetTabId = null;

    chrome.storage.local.set({
        isActive: false,
        nextRefreshTime: null,
        targetTabId: null
    });
}

// Handle the alarm event (time to refresh)
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === 'refreshAlarm') {
        // Get the stored tab ID
        chrome.storage.local.get(['targetTabId', 'isActive', 'minTime', 'maxTime'], function (result) {
            if (result.isActive && result.targetTabId) {
                // Check if the tab still exists
                chrome.tabs.get(result.targetTabId, function (tab) {
                    if (chrome.runtime.lastError) {
                        console.log("Tab no longer exists, stopping auto-refresh");
                        stopRefresh();
                        return;
                    }

                    // Refresh the tab
                    chrome.tabs.reload(result.targetTabId);

                    // Schedule the next refresh
                    scheduleRefresh(result.targetTabId, result.minTime, result.maxTime);
                });
            }
        });
    } else if (alarm.name === 'watchdogAlarm') {
        // Watchdog check
        checkRefreshStatus();
    }
});

// Check if we need to restart a refresh
function checkRefreshStatus() {
    chrome.storage.local.get(['isActive', 'targetTabId', 'nextRefreshTime', 'minTime', 'maxTime'], function (result) {
        if (result.isActive && result.targetTabId && result.nextRefreshTime) {
            // If we're past when we should have refreshed
            if (Date.now() > result.nextRefreshTime + 10000) { // 10 seconds grace period
                console.log("Watchdog detected missed refresh, restarting");

                // Check if the tab still exists
                chrome.tabs.get(result.targetTabId, function (tab) {
                    if (!chrome.runtime.lastError) {
                        // Refresh the tab
                        chrome.tabs.reload(result.targetTabId);

                        // Schedule next refresh
                        scheduleRefresh(result.targetTabId, result.minTime, result.maxTime);
                    } else {
                        // Tab no longer exists
                        console.log("Tab no longer exists, stopping auto-refresh");
                        stopRefresh();
                    }
                });
            }
        }
    });
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
        chrome.storage.local.get(['nextRefreshTime'], function (result) {
            if (result.nextRefreshTime) {
                const timeLeft = (result.nextRefreshTime - Date.now()) / 1000;
                sendResponse({ timeLeft: timeLeft > 0 ? timeLeft : 0 });
            } else {
                sendResponse({ timeLeft: undefined });
            }
        });
        return true; // Keep the messaging channel open for async response
    }
    return true; // Keep the messaging channel open for async responses
});

// When the extension is installed or updated
chrome.runtime.onInstalled.addListener(function () {
    // Initialize default settings
    chrome.storage.local.set({
        minTime: 30,
        maxTime: 60,
        isActive: false,
        nextRefreshTime: null,
        targetTabId: null
    });

    // Set up watchdog alarm (checks every minute)
    chrome.alarms.create('watchdogAlarm', {
        periodInMinutes: 1
    });
});

// When Chrome starts up
chrome.runtime.onStartup.addListener(function () {
    // Set up watchdog alarm (checks every minute)
    chrome.alarms.create('watchdogAlarm', {
        periodInMinutes: 1
    });

    // Check if we need to resume refreshing
    chrome.storage.local.get(['isActive', 'targetTabId', 'minTime', 'maxTime'], function (result) {
        if (result.isActive && result.targetTabId) {
            targetTabId = result.targetTabId;

            // Check if the tab still exists
            chrome.tabs.get(result.targetTabId, function (tab) {
                if (!chrome.runtime.lastError) {
                    // Resume refreshing
                    scheduleRefresh(result.targetTabId, result.minTime, result.maxTime);
                } else {
                    // Tab no longer exists
                    stopRefresh();
                }
            });
        }
    });
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener(function (tabId) {
    chrome.storage.local.get(['targetTabId'], function (result) {
        if (tabId === result.targetTabId) {
            stopRefresh();
        }
    });
});