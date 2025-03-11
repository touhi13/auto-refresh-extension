// popup.js
let timeLeftInterval = null;

document.addEventListener('DOMContentLoaded', function () {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const minTimeInput = document.getElementById('minTime');
    const maxTimeInput = document.getElementById('maxTime');
    const statusDiv = document.getElementById('status');
    const timeLeftDiv = document.getElementById('timeLeft');

    // Load saved settings
    chrome.storage.local.get(['minTime', 'maxTime', 'isActive'], function (result) {
        if (result.minTime) minTimeInput.value = result.minTime;
        if (result.maxTime) maxTimeInput.value = result.maxTime;

        if (result.isActive) {
            statusDiv.textContent = 'Auto refresh is active';
            statusDiv.className = 'status active';
        } else {
            statusDiv.textContent = 'Auto refresh is inactive';
            statusDiv.className = 'status inactive';
        }
    });

    // Update remaining time
    function updateTimeLeft() {
        chrome.runtime.sendMessage({ action: "getTimeLeft" }, function (response) {
            if (response && response.timeLeft !== undefined) {
                timeLeftDiv.textContent = `Next refresh in: ${Math.ceil(response.timeLeft)} seconds`;
            }
        });
    }

    // Update every second if active
    chrome.storage.local.get('isActive', function (result) {
        if (result.isActive) {
            updateTimeLeft();
            if (timeLeftInterval) {
                clearInterval(timeLeftInterval);
            }
            timeLeftInterval = setInterval(updateTimeLeft, 1000);
        }
    });

    // Start auto refresh
    startBtn.addEventListener('click', function () {
        let minTime = parseInt(minTimeInput.value);
        let maxTime = parseInt(maxTimeInput.value);

        // Validate input
        if (isNaN(minTime) || minTime < 1) minTime = 30;
        if (isNaN(maxTime) || maxTime < 1) maxTime = 60;
        if (minTime > maxTime) {
            let temp = minTime;
            minTime = maxTime;
            maxTime = temp;
            minTimeInput.value = minTime;
            maxTimeInput.value = maxTime;
        }

        // Save settings
        chrome.storage.local.set({
            minTime: minTime,
            maxTime: maxTime,
            isActive: true
        });

        // Send message to start refreshing
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.runtime.sendMessage({
                    action: "startRefresh",
                    tabId: tabs[0].id,
                    minTime: minTime,
                    maxTime: maxTime
                });
            }
        });

        statusDiv.textContent = 'Auto refresh is active';
        statusDiv.className = 'status active';

        // Start updating time left display
        updateTimeLeft();
        if (timeLeftInterval) {
            clearInterval(timeLeftInterval);
        }
        timeLeftInterval = setInterval(updateTimeLeft, 1000);
    });

    // Stop auto refresh
    stopBtn.addEventListener('click', function () {
        chrome.storage.local.set({ isActive: false });
        chrome.runtime.sendMessage({ action: "stopRefresh" });

        statusDiv.textContent = 'Auto refresh is inactive';
        statusDiv.className = 'status inactive';
        timeLeftDiv.textContent = '';
    });
});