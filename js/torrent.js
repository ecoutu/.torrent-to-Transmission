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
    add_torrent(info.linkUrl);
}
