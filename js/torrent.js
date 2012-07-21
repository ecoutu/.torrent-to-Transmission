/*
    Show Chrome desktop notification.
    
    title: notification title
    text: notification text
*/
function showNotification(title, text) {
    // timeout stored from options
    var timeout = localStorage.notificationDuration;

    // notifications disabled    
    if (!JSON.parse(localStorage.displayNotification))
        return;
    // notifications not supported
    else if (!webkitNotifications)
        return;

    var notification = webkitNotifications.createNotification(
        "../img/icon-small.png",
        title,
        text
    );

    // destroy notification if timeout > 0
    if (timeout != 0) {
        notification.ondisplay = function() {
            setTimeout(function() {
                notification.cancel();
            }, timeout * 1000);
        };
    }
    notification.show();
}

/*
    Chrome right click context action adds sends URL to Transmission RPC.
    
    info: provides information of link clicked
    tab: unused
*/
function torrentOnClick(info, tab) {
    var json;
    
    // request
    json = JSON.stringify({
        "method": "torrent-add",
        "arguments": {
            "filename": info.linkUrl,
            "paused": false
        },
        "tag": TAGNO
    });

    rpc_request(json, function(req) {
        try {
            if (localStorage.getItem("lastStatus") == 200) {
                // received response, notify if added or not
                var rv = JSON.parse(req.responseText);
                if (rv["result"] == "success")
                    showNotification("torrent started", rv["arguments"]["torrent-added"]["name"]);
                else
                    showNotification("failed to start torrent", rv["result"]);
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
            
        }
    });
}
