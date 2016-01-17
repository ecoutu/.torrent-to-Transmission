var port = chrome.extension.connect({ name: "list" });

var RPC_VERSION = localStorage.getItem("rpc_version");

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

try {
    var SESSION_INFO = JSON.parse(localStorage.getItem("session-info"));
    var SIZE_PREFIX = SESSION_INFO["arguments"]["units"]["size-units"];
    var SPEED_PREFIX = SESSION_INFO["arguments"]["units"]["speed-units"];
    var SIZE_BYTES = SESSION_INFO["arguments"]["units"]["size-bytes"];
    var SPEED_BYTES = SESSION_INFO["arguments"]["units"]["speed-bytes"];
} catch(err) {
    console.warn('Session info not available', err, err.stack);
}


/*
    Collects the IDs of all torrents currently listed in the UI. IDs are stored
    as the name attribute of elements with the CSS .list-item class.

    Returns a list of IDs.
*/
function getIds() {
    var ids = [];

    $(".list-item").each(function () {
        ids.push(JSON.parse($(this).attr("name")));
    });

    return ids;
}

function size_to_str(size, units, unit_size) {
    var size_str = size.toFixed(0);
    var unit_str = "";

    for (var i = 0; i < units.length; i++) {
        if (size < unit_size) {
            unit_str = units[i];
            break;
        }
        else {
            size = size / unit_size;
            size_str = size.toFixed(2);
        }
    }

    return size_str + " " + unit_str;
}

$(document).ready(function() {
    var selectedList;

    selectedList = localStorage.getItem("selected_list");

    $(".navitem").click(function () {
        selectedList = $(this).attr("name");
        $(".navitem.selected").removeClass("selected");
        $(this).addClass("selected");
        localStorage.setItem("selected_list", selectedList);
        buildList(selectedList);
    });

    $(".navitem[name = \"" + selectedList + "\"]").addClass("selected");

    update();

    $(".button").live("click", function() {
        var req = {
            "arguments": { }
        };
        if ($(this).hasClass("pause"))
            req.method = "torrent-stop";
        else if ($(this).hasClass("resume"))
            req.method = "torrent-start";
        else if ($(this).hasClass("remove"))
            req.method = "torrent-remove";
        else if ($(this).hasClass("queue-up"))
            req.method = "queue-move-up";
        else if ($(this).hasClass("queue-down"))
            req.method = "queue-move-down";

        if ($(this).hasClass("torrent"))
            req.arguments.ids = JSON.parse($(this).closest(".list-item").attr("name"));
        else if ($(this).hasClass("all"))
            req.arguments.ids = getIds();

        port.postMessage({
            "method": "rpc-call",
            "json": JSON.stringify(req)
        });
    });

    $(".turtle").click(function(event) {
        var req = {
            "method": "session-set",
            "arguments": { }
        };
        var turtle_status = $(".turtle").hasClass("on");

        req.arguments["alt-speed-enabled"] = !turtle_status;

        port.postMessage({
            "method": "rpc-call",
            "json": JSON.stringify(req)
        });
    });

    $(".webui").html('<a href="' + localStorage.getItem("webURL") + '" target="_blank">WebUI</a>');
});

/*
    Generate the HTML for a list item.
*/
function createListItem(torrent) {
    var rv = '';
    var percent = new Number(torrent.percentDone * 100).toFixed(2);
    var recheckProgress = new Number(torrent.recheckProgress * 100).toFixed(2);
    var dlSpeed = new Number(torrent.rateDownload / SPEED_BYTES);
    var ulSpeed = new Number(torrent.rateUpload / SPEED_BYTES);
    var classes = '';

    rv += '<div class="list-item" name="' + torrent.id +'">';
    rv += '<div class="name">' + torrent.name + '</div>';
    rv += '<div class="clear"></div>';

    // queue buttons if RPC supports it
    if (RPC_VERSION == 14)
        rv += '<div class="button queue-up torrent"></div><div class="button queue-down torrent"></div>';

    // progress bar
    classes = 'progress-bar';
    if (torrent.error == 3)
        classes += ' error';
    else if (torrent.status == TR_STATUS_DOWNLOAD)
        classes += ' downloading';
    else if (torrent.status == TR_STATUS_SEED)
        classes += ' seeding';
    else if (torrent.status == TR_STATUS_CHECK || torrent.status == TR_STATUS_CHECK_WAIT)
        classes += ' verifying';
    else
        classes += ' paused';

    // add custom class for progress bar if RPC supports queue
    if (RPC_VERSION == 14)
        classes += ' v14';

    rv += '<div class="' + classes + '">';

    rv += '<hr style="width: ' + Math.round(torrent.percentDone * 100) + '%;"></hr>';
    rv += '</div>';

    // build pause/resume button
    if (torrent.status == TR_STATUS_STOPPED)
        rv += '<div class="button resume torrent"></div>';
    else
        rv += '<div class="button pause torrent"></div>';
    rv += '<div class="button remove torrent"></div>';
    rv += '<div class="clear"></div>';

    // build status info bar
    if (torrent.error == 3) {
        rv += '<div>' + "Data not found" + '</div>';
    }
    else if (torrent.status == TR_STATUS_CHECK_WAIT) {
        rv += '<div>Verifying local data (queued)</div>';
    }
    else if (torrent.status == TR_STATUS_CHECK) {
        rv += '<div>Verifying local data (' + recheckProgress + '%)</div>';
    }
    else if (torrent.status == TR_STATUS_DOWNLOAD_WAIT) {
        // TODO: Add completion information for queued downloads.
        rv += '<div>Queued for download</div>';
    }
    else if (torrent.status == TR_STATUS_SEED_WAIT) {
        rv += '<div>Queued for seed</div>';
    }
    else {
        var size_bytes = torrent.sizeWhenDone;
        var finished_bytes = size_bytes - torrent.leftUntilDone;
        var eta = torrent.eta;
        var percent_done = new Number(torrent.percentDone * 100).toFixed(2);
        var size_str = '', finish_str = '';
        var eta_str = '';

        size_bytes = size_bytes / SIZE_BYTES;
        finished_bytes = finished_bytes / SIZE_BYTES;

        size_str = size_to_str(size_bytes, SIZE_PREFIX, SIZE_BYTES);
        finish_str = size_to_str(finished_bytes, SIZE_PREFIX, SIZE_BYTES);

        if (eta < 0) {
            eta_str = '';
        }
        else if (eta < 60) {
            eta_str = new Number(eta) + ' seconds';
        }
        else if (eta < 3600) {
            eta_str = Math.floor(eta/60) + ' minutes, ' + new Number(eta % 60).toFixed(0) + ' seconds';
        }
        else if (eta < 86400) {
            eta_str = Math.floor(eta/3600) + ' hours, ' + new Number((eta % 3600) / 60).toFixed(0) + ' minutes';
        }
        else if (eta < 604800) {
            eta_str = Math.floor(eta/86400) + ' days, ' + new Number((eta % 86400) / 3600).toFixed(0) + ' hours';
        }
        else {
            eta_str = Math.floor(eta/604800) + ' weeks, ' + new Number((eta % 604800) / 86400).toFixed(0) + ' days';
        }

        rv += '<div class="status-wrapper">';

        if (torrent.status == TR_STATUS_DOWNLOAD) {
            rv += finish_str + ' of ' + size_str + ' (' + percent_done + '%)';
            if (eta > 0)
                rv += ' - ' + eta_str;
        }
        if (torrent.status == TR_STATUS_SEED)
            rv += size_str;
        rv += '</div><div class="speed-wrapper">';

        if (torrent.status == TR_STATUS_DOWNLOAD)
            rv += " " + size_to_str(dlSpeed, SPEED_PREFIX, SPEED_BYTES) + " &#8595;";

        if (torrent.status == TR_STATUS_DOWNLOAD || torrent.status == TR_STATUS_SEED)
            rv += " " + size_to_str(ulSpeed, SPEED_PREFIX, SPEED_BYTES) + " &#8593;";

        rv += '</div>';
        rv += '<div class="clear"></div>';
    }
    rv += '</div>';

    return rv;
}

function buildList() {
    var list = localStorage.getItem("selected_list");
    var torrents = JSON.parse(localStorage.getItem("torrents"));
    var sortable = [];

    for (var id in torrents) {
        var torrent = torrents[id];
        if ((list == "all") ||
                (list == "download" && torrent.status == TR_STATUS_DOWNLOAD) ||
                (list == "download" && torrent.status == TR_STATUS_DOWNLOAD_WAIT) ||
                (list == "seed" && torrent.status == TR_STATUS_SEED) ||
                (list == "seed" && torrent.status == TR_STATUS_SEED_WAIT) ||
                (list == "pause" && torrent.status == TR_STATUS_STOPPED)) {
            sortable.push(torrent);
        }
    }
    sortable.sort(function(a, b) {
        return a.queuePosition - b.queuePosition;
    });

    $(".list-wrapper").empty();

    for (var i in sortable) {
        $(".list-wrapper").append(createListItem(sortable[i]));
    }
}

function updateSpeed() {
    var stats = JSON.parse(localStorage.getItem("session-stats"));
    var downSpeed = new Number(stats.arguments.downloadSpeed / SPEED_BYTES);
    var upSpeed = new Number(stats.arguments.uploadSpeed / SPEED_BYTES);

    $(".stats-wrapper").html(size_to_str(downSpeed, SPEED_PREFIX, SPEED_BYTES) + " &#8595; " + size_to_str(upSpeed, SPEED_PREFIX, SPEED_BYTES) + " &#8593;");
}

function updateTurtle() {
    var session_info = JSON.parse(localStorage.getItem("session-info"));
    var turtle = session_info.arguments["alt-speed-enabled"];
    if (turtle)
        $("img.turtle").removeClass("off").addClass("on");
    else
        $("img.turtle").removeClass("on").addClass("off");
}

function update(event) {
    if (localStorage.getItem("lastStatus") != 200) {
        var msg = '';
        msg += '<div class="transmission-error">Unable to contact Transmission server ';
        msg += localStorage.getItem("rpcURL");
        msg += '<br /><a href="' + chrome.extension.getURL("../html/options.html") +'" target="_blank">';
        msg += 'go to the options page</a></div>';
        $("body").html(msg);
    }
    // fired without event argument by document.ready
    else if (typeof event == "undefined") {
        buildList();
        updateSpeed();
        updateTurtle();
    }
    else if (event.key == "torrents") {
        buildList();
    }
    else if (event.key == "session-stats") {
        updateSpeed();
    }
    else if (event.key == "session-info") {
        updateTurtle();
    }
}

window.addEventListener("storage", update, false);

