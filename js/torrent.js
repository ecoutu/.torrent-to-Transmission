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

    rpc_request(json, function(req) {
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
