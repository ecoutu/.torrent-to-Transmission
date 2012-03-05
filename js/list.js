var port = chrome.extension.connect({ name: "list" });

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
    var dlSpeed = new Number(torrent.rateDownload / 1024).toFixed(2);
    var ulSpeed = new Number(torrent.rateUpload / 1024).toFixed(2);
    rv += '<div class="list-item" name="' + torrent.id +'">';
    rv += '<div class="name">' + torrent.name + '</div>';
    rv += '<div class="percent"> ' + percent + '%</div>';
    rv += '<div class="clear"></div>';
    rv += '<div class="progress-wrapper">';
    if (torrent.status == 4)
        rv += '<div class="progress-bar downloading">';
    else if (torrent.status == 8)
        rv += '<div class="progress-bar seeding">';
    else if (torrent.status == 1 || torrent.status == 2)
            rv += '<div class="progress-bar verifying">'; 
    else
        rv += '<div class="progress-bar paused">';
    rv += '<hr style="width: ' + Math.round(torrent.percentDone * 100) + '%;"></hr>';
    rv += '</div>';
    if (torrent.status == 16)
        rv += '<div class="button resume torrent"></div>';
    else
        rv += '<div class="button pause torrent"></div>';
    rv += '<div class="button remove torrent"></div>';
    rv += '</div>';
    
    rv += '<div class="clear"></div>';
    if (torrent.status == 1) {
        rv += '<div>Verifying local data (queued)</div>';
    }
    else if (torrent.status == 2) {
        rv += '<div>Verifying local data (' + recheckProgress + '%)</div>';
    }
    else {
        rv += '<div class="peer-wrapper">';
        if (torrent.status == 4)
            rv += torrent.peersSendingToUs + '&#8595;';
        if (torrent.status == 4 || torrent.status == 8)
            rv += ' ' + torrent.peersGettingFromUs + '&#8593;';
        if (torrent.status != 16)
            rv += ' of ' + torrent.peersConnected + " peers";
        rv += '</div><div class="speed-wrapper">';
        if (torrent.status == 4)
            rv +=  ' ' + dlSpeed + ' KB/s &#8595;';
        if (torrent.status == 4 || torrent.status == 8)
            rv += ' ' + ulSpeed + ' KB/s &#8593;';
        rv += '</div>';
        rv += '<div class="clear"></div>';
    }
    rv += '</div>';
    
    return rv;
}

function buildList() {
    var list = localStorage.getItem("selected_list");
    var torrents = JSON.parse(localStorage.getItem("torrents"));      
    var elems = {};
    var names = [];
    
    for (var id in torrents) {
        var torrent = torrents[id];
        var lName = torrent.name.toLowerCase();
        if ((list == "all") ||
                (list == "download" && torrent.status == 4) ||
                (list == "seed" && torrent.status == 8) ||
                (list == "pause" && torrent.status == 16)) {
            elems[lName] = createListItem(torrent);
            names.push(lName);
        }
    }
    names.sort();
    
    $(".list-wrapper").empty();
    
    for (var i in names) {
        $(".list-wrapper").append(elems[names[i]]);
    }
}

function updateSpeed() {
    var stats = JSON.parse(localStorage.getItem("session-stats"));
    var downSpeed = new Number(stats.arguments.downloadSpeed / 1024).toFixed(2);
    var upSpeed = new Number(stats.arguments.uploadSpeed / 1024).toFixed(2);
    var speed = "";
    
    speed += downSpeed + " KB/s &#8595; ";
    speed += upSpeed + " KB/s &#8593;";
    
    $(".stats-wrapper").html(speed);
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
        msg += '<div class="error">Unable to contact Transmission server ';
        msg += localStorage.getItem("rpcURL");
        msg += '<br /><a href="' + chrome.extension.getURL("../html/options.html") +'" target="_blank">';
        msg += 'go to the options page</a></div>';
        $("body").html(msg);
    }
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

