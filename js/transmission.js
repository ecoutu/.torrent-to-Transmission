var TAGNO = 12345;

var TR_STATUS_STOPPED;
var TR_STATUS_CHECK_WAIT;
var TR_STATUS_CHECK;
var TR_STATUS_DOWNLOAD_WAIT;
var TR_STATUS_DOWNLOAD;
var TR_STATUS_SEED_WAIT;
var TR_STATUS_SEED;

function set_constants(rpc_version) {
    if (rpc_version < 14) {
        TR_STATUS_STOPPED = 16;
        TR_STATUS_CHECK_WAIT = 1;
        TR_STATUS_CHECK = 2;
        TR_STATUS_DOWNLOAD_WAIT = 0;
        TR_STATUS_DOWNLOAD = 4;
        TR_STATUS_SEED_WAIT = 0;
        TR_STATUS_SEED = 8;
    }
    else {
        TR_STATUS_STOPPED = 0;
        TR_STATUS_CHECK_WAIT = 1;
        TR_STATUS_CHECK = 2;
        TR_STATUS_DOWNLOAD_WAIT = 3;
        TR_STATUS_DOWNLOAD = 4;
        TR_STATUS_SEED_WAIT = 5;
        TR_STATUS_SEED = 6;
    }
}

function rpc_request(json, callback, url, user, pass) {
    const do_request = (items) => {
        const rpcUrl = url === undefined ? items.rpcURL : url;
        const rpcUser = user === undefined ? items.rpcUser : user;
        const rpcPass = pass === undefined ? items.rpcPass : pass;

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Transmission-Session-Id': items.sessionId || ''
        };

        if (rpcUser || rpcPass) {
            headers['Authorization'] = 'Basic ' + btoa(rpcUser + ':' + rpcPass);
        }

        return fetch(rpcUrl, {
            method: 'POST',
            headers: headers,
            body: json
        })
        .then(response => {
            if (response.headers.has('X-Transmission-Session-Id')) {
                const newSessionId = response.headers.get('X-Transmission-Session-Id');
                chrome.storage.local.set({ "sessionId": newSessionId }, () => {
                    // Retry the request with the new session ID.
                    rpc_request(json, callback, url, user, pass);
                });
                // return Promise.reject(null); // Prevent further processing of this response
            }
            return response;
        })
        .then(async response => {
            chrome.storage.local.set({ "lastStatus": response.status });
            if (callback) {
                const responseText = await response.text();
                callback({
                    status: response.status,
                    responseText: responseText
                });
            }
        })
        .catch(error => {
            if (error !== null) { // This is a real error, not our retry signal
                console.log('Fetch error:', error);
                chrome.storage.local.set({ "lastStatus": 0 });
                 if (callback) {
                    callback({ status: 0, responseText: '' });
                }
            }
        });
    };

    if (typeof url !== "undefined") {
        chrome.storage.local.get("sessionId", do_request);
    } else {
        chrome.storage.local.get(["rpcURL", "rpcUser", "rpcPass", "sessionId"], do_request);
    }
}

function add_torrent(link_url) {
    chrome.storage.local.get("sendTorrentFile", function(items) {
        new Promise(function(resolve, reject) {
            var isMagnet = /^magnet:/.test(link_url);
            var sendTorrentFile = items.sendTorrentFile;

            if (isMagnet || !sendTorrentFile) {
                resolve({
                    "method": "torrent-add",
                    "arguments": {
                        "filename": link_url,
                        "paused": false
                    },
                    "tag": TAGNO
                });
            } else {
                fetch(link_url)
                    .then(response => response.arrayBuffer())
                    .then(arrayBuffer => {
                        var base64 = base64EncArr(new Uint8Array(arrayBuffer));
                        resolve({
                            "method": "torrent-add",
                            "arguments": {
                                "metainfo": base64,
                                "paused": false
                            },
                            "tag": TAGNO
                        });
                    })
                    .catch(error => {
                        console.error('Error downloading torrent file:', error);
                        reject(error);
                    });
            }
        }).then(function(json) {
            rpc_request(JSON.stringify(json), function (req) {
                chrome.storage.local.get(["lastStatus", "rpcURL"], function(items) {
                    try {
                        if (items.lastStatus == 200) {
                            // received response, notify if added or not
                            var rv = JSON.parse(req.responseText);
                            if (rv["result"] == "success") {
                                showNotification("torrent started", rv["arguments"]["torrent-added"]["name"]);
                            }
                            else {
                                showNotification("failed to start torrent", rv["result"]);
                            }
                        }
                        else {
                            // unable to contact server
                            var title = "unable to contact " + items.rpcURL;
                            var text = "";
                            switch (items.lastStatus) {
                                case 0:
                                    text = "no response";
                                    break;
                                case 401:
                                    text = "invalid username/password";
                                    break;
                                default:
                                    text = "unrecognized response";
                                    break;
                            }
                            showNotification(title, text);
                        }
                    } catch (err) {
                        console.error(err, err.stack);
                    }
                });
            });
        });
    });
}

function update_torrents() {
    var json = JSON.stringify({
        "method": "torrent-get",
        "arguments": {
            "fields": [
                "id",
                "name",
                "status",
                "sizeWhenDone",
                "leftUntilDone",
                "percentDone",
                "rateDownload",
                "rateUpload",
                "peersConnected",
                "peersGettingFromUs",
                "peersSendingToUs",
                "recheckProgress",
                "queuePosition",
                "error",
                "errorString",
                "eta"
            ]
        },
        "tag": TAGNO
    });

    rpc_request(json, function(req) {
        chrome.storage.local.get("torrents", function(items) {
            var torrents = items.torrents || {};
            var remTorrents = { };
            var nDLs = 0, nULs = 0;
            var badgeText = "";

            try {
                var rv = JSON.parse(req.responseText);
                chrome.action.setIcon({ "path": chrome.runtime.getURL("img/icon-bitty.png") });
                chrome.action.setBadgeBackgroundColor({ "color": "#F00" });
            } catch (err) {
                chrome.action.setBadgeText({ "text": "?" });
                chrome.action.setBadgeBackgroundColor({ "color": "#7f7f7f" });
                chrome.action.setIcon({ "path": chrome.runtime.getURL("img/icon-grey-bitty.png") });
                return;
            }

            for (var i = 0; i < rv.arguments.torrents.length; i++) {
                var torrent = rv.arguments.torrents[i];
                var lastStatus = torrent.status;

                if (torrent.id in torrents)
                    lastStatus = torrents[torrent.id].status;

                if (torrent.status != lastStatus && lastStatus == TR_STATUS_DOWNLOAD && torrent.leftUntilDone == 0)
                    showNotification("torrent complete", torrent.name);

                if (torrent.status == TR_STATUS_DOWNLOAD) {
                    nDLs += 1;
                }
                else if (torrent.status == TR_STATUS_SEED) {
                    nULs += 1;
                }

                remTorrents[torrent.id] = torrent;
            }

            if (nDLs < 10)
                badgeText = nDLs.toString();
            else
                badgeText = "*";

            badgeText += "/";

            if (nULs < 10)
                badgeText += nULs.toString();
            else
                badgeText += "*";
            chrome.action.setBadgeText({ "text": badgeText });

            chrome.storage.local.set({ "torrents": remTorrents });
        });
    });
}

function update_stats() {
    var json = JSON.stringify({
        "method": "session-stats",
        "tag": TAGNO
    });
    rpc_request(json, function(req) {
        try {
            var stats = JSON.parse(req.responseText);
            chrome.storage.local.set({ "session-stats": stats });
        } catch(e) {
            // ignore
        }
    });
}

function update_session() {
    var json = JSON.stringify({
        "method": "session-get",
        "tag": TAGNO
    });
    rpc_request(json, function(req) {
        try {
            var session_info = JSON.parse(req.responseText);
            var rpc_version = session_info.arguments["rpc-version"];
            chrome.storage.local.set({ "session-info": session_info, "rpc_version": rpc_version });
            set_constants(rpc_version);
        }
        catch (err) {
            // ignore
        }
    });
}

function update() {
    update_session();
    update_stats();
    update_torrents();
}

chrome.storage.local.get("rpc_version", function(items) {
    set_constants(items.rpc_version);
});

/* Base64 string to array encoding */

function uint6ToB64(nUint6) {

    return nUint6 < 26 ? nUint6 + 65 : nUint6 < 52 ? nUint6 + 71 : nUint6 < 62 ? nUint6 - 4 : nUint6 === 62 ? 43
      : nUint6 === 63 ? 47 : 65;

}

function base64EncArr(aBytes) {

    var nMod3 = 2, sB64Enc = "";

    for (var nLen = aBytes.length, nUint24 = 0, nIdx = 0; nIdx < nLen; nIdx++) {
        nMod3 = nIdx % 3;
        if (nIdx > 0 && (nIdx * 4 / 3) % 76 === 0) {
            sB64Enc += "\r\n";
        }
        nUint24 |= aBytes[nIdx] << (16 >>> nMod3 & 24);
        if (nMod3 === 2 || aBytes.length - nIdx === 1) {
            sB64Enc += String.fromCharCode(uint6ToB64(nUint24 >>> 18 & 63), uint6ToB64(nUint24 >>> 12 & 63),
              uint6ToB64(nUint24 >>> 6 & 63), uint6ToB64(nUint24 & 63));
            nUint24 = 0;
        }
    }

    return sB64Enc.substr(0, sB64Enc.length - 2 + nMod3) + (nMod3 === 2 ? '' : nMod3 === 1 ? '=' : '==');

}
