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
            if (localStorage.getItem("lastStatus") == 200) {
                var rv = JSON.parse(req.responseText);
                if (rv["result"] == "success")
                    showNotification("torrent started", rv["arguments"]["torrent-added"]["name"]);
                else
                    showNotification("failed to start torrent", rv["result"]);
            }
            else {
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
            
        }
    });
}
