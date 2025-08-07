importScripts('torrent.js', 'transmission.js');

var interval;

chrome.contextMenus.create({
    "id": "torrent-to-transmission",
    "title": ".torrent To Transmission",
    "contexts": ["link"]
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "torrent-to-transmission") {
        torrentOnClick(info, tab);
    }
});

/*
    Initial load.
*/
const options = [
    { key: 'rpcUser', default: '' },
    { key: 'rpcPass', default: '' },
    { key: 'rpcURL', default: 'http://localhost:9091/transmission/rpc' },
    { key: 'webURL', default: 'http://localhost:9091' },
    { key: 'displayNotification', default: true },
    { key: 'notificationDuration', default: 10 },
    { key: 'refreshRate', default: 5 },
    { key: 'sendTorrentFile', default: false },
    { key: 'selected_list', default: 'all' },
    { key: 'enable-additional-paths', default: false }
];

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(options.map(o => o.key), (items) => {
        const toSet = {};
        options.forEach(configItem => {
            if (items[configItem.key] === undefined) {
                toSet[configItem.key] = configItem.default;
            }
        });
        chrome.storage.local.set(toSet);
    });
    chrome.storage.local.get('refreshRate', (items) => {
        const refreshRate = items.refreshRate || 5;
        // Convert seconds to minutes for the alarm. Minimum is 1 minute for periodInMinutes,
        // but we can use floating point values. Let's use a small value and re-create it.
        // Or, let's just use a delay and re-create it in the alarm handler to be safe.
        chrome.alarms.create('update', { delayInMinutes: refreshRate / 60 });
    });
    // reset torrents on page creation
    chrome.storage.local.set({ torrents: {} });
    update();
});


chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'update') {
        update();
        const { refreshRate } = await chrome.storage.local.get('refreshRate');
        chrome.alarms.create('update', { delayInMinutes: (refreshRate || 5) / 60 });
    }
});


chrome.runtime.onConnect.addListener(function(port) {
    if (port.name == "options") {
        port.onMessage.addListener(function(msg) {
            if (msg.method == "rpc-test") {
                rpc_request(msg.json, function(req) {
                    port.postMessage({
                        "method": "rpc-test",
                        "req": {
                            "status": req.status,
                            "responseText": req.responseText
                        }
                    });
                }, msg.url, msg.user, msg.pass);
            }
            else if (msg.method == "reset-host") {
                resetHost();
            }
        });
    }
    else if (port.name == "list") {
        port.onMessage.addListener(function(msg) {
            if (msg.method == "rpc-call") {
                msg.json.tag = TAGNO;
                rpc_request(msg.json, function(req) {
                    update();
                    port.postMessage({
                        "method": "rpc-complete",
                        "req": req
                    });
                });
            }
        });
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.refreshRate) {
        chrome.alarms.clear('update', () => {
            const refreshRate = changes.refreshRate.newValue || 5;
            chrome.alarms.create('update', { delayInMinutes: refreshRate / 60 });
        });
    }
    if (changes.rpcURL) {
        chrome.storage.local.set({ sessionId: "", torrents: {} });
    }
});
