var TAGNO = 12345;

if (localStorage.getItem("rpc_version") < 14) {
    var TR_STATUS_STOPPED = 16;
    var TR_STATUS_CHECK_WAIT = 1;
    var TR_STATUS_CHECK = 2;
    var TR_STATUS_DOWNLOAD_WAIT = 0;
    var TR_STATUS_DOWNLOAD = 4;
    var TR_STATUS_SEED_WAIT = 0;
    var TR_STATUS_SEED = 8;
}
else {
    var TR_STATUS_STOPPED = 0;
    var TR_STATUS_CHECK_WAIT = 1;
    var TR_STATUS_CHECK = 2;
    var TR_STATUS_DOWNLOAD_WAIT = 3;
    var TR_STATUS_DOWNLOAD = 4;
    var TR_STATUS_SEED_WAIT = 5;
    var TR_STATUS_SEED = 6;
}

function rpc_request(json, callback, url, user, pass) {
    var req = new XMLHttpRequest();

    if (typeof url == "undefined")
        url = localStorage.rpcURL;
    if (typeof user == "undefined")
        user = localStorage.rpcUser;
    if (typeof pass == "undefined")
        pass = localStorage.rpcPass;

    req.open("POST", url, true, user, pass);
    req.setRequestHeader("X-Transmission-Session-Id", localStorage.sessionId);
    req.setRequestHeader("Content-Type", "application/json");

    req.onreadystatechange = function() {
        if (req.readyState == 4) {
            if (req.getResponseHeader("X-Transmission-Session-Id")) {
                localStorage.sessionId = req.getResponseHeader("X-Transmission-Session-Id");
                return rpc_request(json, callback, url, user, pass);
            }
            if (typeof callback != "undefined")
                callback(req);
            localStorage.setItem("lastStatus", req.status);
        }
    };
    req.send(json);
}

function add_torrent(link_url) {
    new Promise(function(resolve, reject) {
        var isMagnet = /^magnet:/.test(link_url);
        var sendTorrentFile = JSON.parse(localStorage.sendTorrentFile);

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
            var req = new XMLHttpRequest();
            req.responseType = 'arraybuffer';
            req.open('GET', link_url, true);
            req.onreadystatechange = function () {
                if (req.readyState == 4) {
                    var base64 = base64EncArr(new Uint8Array(req.response));
                    //debugger;
                    resolve({
                        "method": "torrent-add",
                        "arguments": {
                            "metainfo": base64,
                            "paused": false
                        },
                        "tag": TAGNO
                    });
                }
            };
            req.send();
        }
    }).then(function(json) {
        rpc_request(JSON.stringify(json), function (req) {
            try {
                if (localStorage.getItem("lastStatus") == 200) {
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
                    var title = "unable to contact " + localStorage.getItem("rpcURL");
                    var text = "";
                    switch (JSON.parse(localStorage.getItem("lastStatus"))) {
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
        var torrents = JSON.parse(localStorage.getItem("torrents"));
        var remTorrents = { };
        var nDLs = 0, nULs = 0;
        var badgeText = "";

        try {
            var rv = JSON.parse(req.responseText);
            chrome.browserAction.setIcon({ "path": "../img/icon-bitty.png" })
            chrome.browserAction.setBadgeBackgroundColor({ "color": "#F00" });
        } catch (err) {
            chrome.browserAction.setBadgeText({ "text": "?" });
            chrome.browserAction.setBadgeBackgroundColor({ "color": "#7f7f7f" });
            chrome.browserAction.setIcon({ "path": "../img/icon-grey-bitty.png" })
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
            badgeText = nDLs;
        else
            badgeText = "*";

        badgeText += "/";

        if (nULs < 10)
            badgeText += nULs;
        else
            badgeText += "*";
        chrome.browserAction.setBadgeText({ "text": badgeText });

        localStorage.setItem("torrents", JSON.stringify(remTorrents));
    });
}

function update_stats() {
    var json = JSON.stringify({
        "method": "session-stats",
        "tag": TAGNO
    });
    rpc_request(json, function(req) {
        localStorage.setItem("session-stats", req.responseText);
    });
}

function update_session() {
    var json = JSON.stringify({
        "method": "session-get",
        "tag": TAGNO
    });
    rpc_request(json, function(req) {
        localStorage.setItem("session-info", req.responseText);
        try {
            localStorage.setItem("rpc_version", JSON.parse(req.response).arguments["rpc-version"]);
            if (localStorage.getItem("rpc_version") == 14) {
                TR_STATUS_STOPPED = 0;
                TR_STATUS_CHECK_WAIT = 1;
                TR_STATUS_CHECK = 2;
                TR_STATUS_DOWNLOAD_WAIT = 3;
                TR_STATUS_DOWNLOAD = 4;
                TR_STATUS_SEED_WAIT = 5;
                TR_STATUS_SEED = 6;
            }
            else {
                TR_STATUS_STOPPED = 16;
                TR_STATUS_CHECK_WAIT = 1;
                TR_STATUS_CHECK = 2;
                TR_STATUS_DOWNLOAD_WAIT = 0;
                TR_STATUS_DOWNLOAD = 4;
                TR_STATUS_SEED_WAIT = 0;
                TR_STATUS_SEED = 8;
            }
        }
        catch (err) {

        }
    });
}

function update() {
    update_session();
    update_stats();
    update_torrents();
}

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
