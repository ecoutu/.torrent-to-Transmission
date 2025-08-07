/*
    Show Chrome desktop notification.

    title: notification title
    text: notification text
*/
function showNotification(title, text) {
    chrome.storage.local.get(['displayNotification', 'notificationDuration'], function(items) {
        // notifications disabled
        if (!items.displayNotification) {
            console.log('notifications disabled');
            return;
        }

        var notID = new Date().getTime().toString();
        chrome.notifications.create(
            notID,
            {
                type: "basic",
                iconUrl: chrome.runtime.getURL("img/icon-large.png"),
                title: title,
                message: text
            }, function(id) {
                console.log(id);
            }
        );

        // timeout stored from options
        var timeout = items.notificationDuration;
        if (timeout) {
            setTimeout(function() {
                chrome.notifications.clear(notID);
            }, timeout * 1000);
        }
    });
}

/*
    Chrome right click context action adds sends URL to Transmission RPC.

    info: provides information of link clicked
    tab: unused
*/
function torrentOnClick(info, tab) {
    add_torrent(info.linkUrl);
}
