var TAGNO = 12345;

function rpcRequest(json, callback, url, user, pass) {
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
                return rpcRequest(json, callback, url, user, pass);
            }
            if (typeof callback != "undefined")
                callback(req);
            localStorage.setItem("lastStatus", req.status);
        }
    };
    req.send(json);
}

function showNotification(title, text) {
    var timeout = localStorage.notificationDuration;
    
    if (!JSON.parse(localStorage.displayNotification))
        return;
    else if (!webkitNotifications)
        return;

    var notification = webkitNotifications.createNotification(
        "../img/icon-small.png",
        title,
        text
    );

    if (timeout != 0) {
        notification.ondisplay = function() {
            setTimeout(function() {
                notification.cancel();
            }, timeout * 1000);
        };
    }
    notification.show();
}

function torrentOnClick(info, tab) {
    var json = JSON.stringify({
        "method": "torrent-add",
        "arguments": {
            "filename": info.linkUrl,
            "paused": false
        },
        "tag": TAGNO
    });

    if (!JSON.parse(localStorage.displayNotification))
        return;

    rpcRequest(json, function(req) {
        try {
            var rv = JSON.parse(req.responseText);
            if (rv["result"] == "success")
                showNotification("torrent started", rv["arguments"]["torrent-added"]["name"]);
            else
                showNotification("failed to start torrent", rv["result"]);
        } catch (err) {
            
        }
    });
}

function updateTorrents() {
    var json = JSON.stringify({
        "method": "torrent-get",
        "arguments": {
            "fields": [
                "id",
                "name",
                "status",
                "leftUntilDone",
                "percentDone",
                "rateDownload",
                "rateUpload",
                "peersConnected",
                "peersGettingFromUs",
                "peersSendingToUs",
                "recheckProgress"
            ]
        },
        "tag": TAGNO
    });

    rpcRequest(json, function(req) {
        var torrents = JSON.parse(localStorage.getItem("torrents"));
        var remTorrents = { };
        
        try {
            var rv = JSON.parse(req.responseText);
        } catch (err) {
            return;
        }        
        
        for (var i = 0; i < rv.arguments.torrents.length; i++) {
            var torrent = rv.arguments.torrents[i];
            var lastStatus = torrent.status;

            if (torrent.id in torrents)
                lastStatus = torrents[torrent.id].status;

            if (torrent.status != lastStatus) {
                switch (torrent.status) {
                    case 1:  // queued to check files
                        break;
                    case 2:  // checking files
                        break;
                    case 4:  // downloading
                        break;
                    case 8:  // seeding
                    case 16: // stopped
                        if (lastStatus == 4 && torrent.leftUntilDone == 0)
                            showNotification("torrent complete", torrent.name);
                        break;
                    default:
                        break;
                }
            }
            remTorrents[torrent.id] = torrent;
        }
        localStorage.setItem("torrents", JSON.stringify(remTorrents));
    });   
}

function updateSessionStats() {
    var json = JSON.stringify({
        "method": "session-stats",
        "tag": TAGNO
    });
    rpcRequest(json, function(req) {
        localStorage.setItem("session-stats", req.responseText);
    });
}

function update() {
    updateSessionStats();
    updateTorrents();
}
