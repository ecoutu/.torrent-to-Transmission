/*
    Show Chrome desktop notification.

    title: notification title
    text: notification text
*/
function showNotification(title, text) {
    // timeout stored from options
    var timeout = localStorage.notificationDuration;

    // notifications disabled
    if (!JSON.parse(localStorage.displayNotification)) {
        console.log('notifications disabled');
        return;
    }

    chrome.notifications.create(
        new Date().getTime().toString(),
        {
            type: "basic",
            iconUrl: "../img/icon-large.png",
            title: title,
            message: text
        }, function(id) {
            console.log(id);
        }
    );
}

/*
    Chrome right click context action adds sends URL to Transmission RPC.

    info: provides information of link clicked
    tab: unused
*/
function torrentOnClick(info, tab) {
    add_torrent(info.linkUrl);
}
