var port = chrome.runtime.connect({ name: "options" });
var saveButton;
var cancelButton;
var rpc_version = "";

function init() {
    chrome.storage.local.get([
        "rpcURL", "webURL", "rpcUser", "rpcPass", "displayNotification",
        "notificationDuration", "refreshRate", "sendTorrentFile",
        "enable-additional-paths", "additional-paths"
    ], function(items) {
        document.getElementById("rpc-url").value = items.rpcURL || "";
        document.getElementById("web-url").value = items.webURL || "";
        document.getElementById("rpc-user").value = items.rpcUser || "";
        document.getElementById("rpc-pass").value = items.rpcPass || "";
        document.getElementById("notification-display").checked = items.displayNotification;
        document.getElementById("notification-duration").value = items.notificationDuration || "";
        document.getElementById("refresh-rate").value = items.refreshRate || "";
        document.getElementById("send-torrent-file").checked = items.sendTorrentFile;
        document.getElementById("enable-additional-paths").checked = items["enable-additional-paths"];

        var paths = items["additional-paths"] || [];
        var paths_table = $("#paths-table");

        // Clear existing dynamic rows
        paths_table.find(".path-row").not(":first").remove();

        for (var i in paths) {
            var path = paths[i];
            var new_row = $('\
<tr class="path-row">\
    <td><input type="text" class="path-label" /></td>\
    <td><input type="text" class="path-directory" /></td>\
    <td><input type="button" value="x" /></td>\
</tr>'
            );
            $(new_row).find(".path-label").val(path[0]);
            $(new_row).find(".path-directory").val(path[1]);
            $(paths_table).append(new_row);
        }

        rpcTest();
        toggleNotification();
        togglePaths();
        markClean();
    });
}

$(document).ready(function () {

    saveButton = $('input[type="submit"]');
    cancelButton = $('input[type="reset"]');

    cancelButton.click(() => window.close())

    $('input[type="submit"]').click(save);
    $('input[type="reset"]').click(init);
    $('input[type="checkbox"]').live('click', markDirty);
    $('input[type="text"]').live('keydown', markDirty);

    document.getElementById("rpc-url").onchange = rpcTest;
    document.getElementById("rpc-user").onchange = rpcTest;
    document.getElementById("rpc-pass").onchange = rpcTest;
    document.getElementById("notification-display").onclick = toggleNotification;
    document.getElementById("enable-additional-paths").onclick = togglePaths;

    $('.path-row input[value="x"]').live('click', function () {
        $(this).parent().parent().remove();
        markDirty();
    });

    function checkAddPathButton() {
        if ($('.path-row:first').find('.path-directory').val())
            $('input#add-path').attr('disabled', false);
        else
            $('input#add-path').attr('disabled', 'disabled');
    };
    $('.path-row:first').find('.path-directory').keyup(function() {
        if ($('.path-row:first').find('.path-directory').val())
            $('input#add-path').attr('disabled', '');
        else
            $('input#add-path').attr('disabled', 'disabled');
    });

    $("#add-path").click(function() {

        var new_row = $('\
<tr class="path-row">\
    <td><input type="text" class="path-label" /></td>\
    <td><input type="text" class="path-directory" /></td>\
    <td><input type="button" value="x" /></td>\
</tr>'
        );
        var parent_row = $(this).parent().parent();
        var new_label = "";
        var new_dir = "";

        new_label = parent_row.find(".path-label").val();
        new_dir = parent_row.find(".path-directory").val();

        if (!new_label && !new_dir)
            return;
        else if (!new_dir)
            return;

        $(new_row).find(".path-label").val(new_label);
        $(new_row).find(".path-directory").val(new_dir);

        $(parent_row).find(".path-label").val("");
        $(parent_row).find(".path-directory").val("");

        $(this).parent().parent().after(new_row);
        checkAddPathButton();
        markDirty();
    });
    init();
    $('input#add-path').attr('disabled', 'disabled');
});

function rpcTest() {
    var json = JSON.stringify({ "method": "session-get" });
    var rvElem = document.getElementById("rpc-test-result");

    port.postMessage({
        "method": "rpc-test",
        "json": json,
        "url": document.getElementById("rpc-url").value,
        "user": document.getElementById("rpc-user").value,
        "pass": document.getElementById("rpc-pass").value
    });
}

function save() {
    var paths = [];
    var toSet = {
        "rpcURL": document.getElementById("rpc-url").value,
        "webURL": document.getElementById("web-url").value,
        "rpcUser": document.getElementById("rpc-user").value,
        "rpcPass": document.getElementById("rpc-pass").value,
        "displayNotification": document.getElementById("notification-display").checked,
        "notificationDuration": document.getElementById("notification-duration").value,
        "refreshRate": document.getElementById("refresh-rate").value,
        "sendTorrentFile": document.getElementById("send-torrent-file").checked,
        "rpc_version": rpc_version,
        "enable-additional-paths": document.getElementById("enable-additional-paths").checked
    };

    var rows = $(".path-row").not(":first");

    $(rows).each(function() {
        var label = $(this).find('.path-label').val();
        var dir = $(this).find('.path-directory').val();

        paths.push([label, dir]);
    });

    toSet['additional-paths'] = paths;

    chrome.storage.local.set(toSet, function() {
        markClean();
    });
}

function markDirty() {
    saveButton.attr("disabled", false);
}

function markClean() {
    saveButton.attr("disabled", true);
}

function togglePaths() {
    var inputs = document.getElementById("paths-table").getElementsByTagName("input");
    var ths = document.getElementById("paths-table").getElementsByTagName("th");

    for (var i = 0; i < inputs.length; i++)
        inputs[i].disabled = !document.getElementById("enable-additional-paths").checked;

    for (var i = 0; i < ths.length; i++) {
        if (document.getElementById("enable-additional-paths").checked)
            ths[i].className = "";
        else
            ths[i].className = "text-disabled";
    }

    markDirty();
}

function toggleNotification() {
    var inputs = document.getElementById("notification-table").getElementsByTagName("input");

    for (var i = 0; i < inputs.length; i++)
        inputs[i].disabled = !document.getElementById("notification-display").checked;
    markDirty();
}

port.onMessage.addListener(function(msg) {
    if (msg.method == "rpc-test") {
        document.getElementById("rpc-test-url").innerHTML = "";
        document.getElementById("rpc-test-user").innerHTML = "";
        console.log(msg);
        switch (msg.req.status) {
            case 200:
                var rv = JSON.parse(msg.req.responseText);
                rpc_version = rv.arguments["rpc-version"];
                document.getElementById("rpc-test-url").innerHTML = "Success! RPC version " + rpc_version;
                document.getElementById("rpc-test-url").className = "result";
                break;
            case 401:
                document.getElementById("rpc-test-user").innerHTML = "Error: invalid username/password";
                document.getElementById("rpc-test-user").className = "result error";
                break;
            case 0:
                document.getElementById("rpc-test-url").innerHTML = "Error: no response";
                document.getElementById("rpc-test-url").className = "result error";
                break;
            default:
                document.getElementById("rpc-test-url").innerHTML = "Error: " + msg.req.status;
                document.getElementById("rpc-test-url").className = "result error";
                break;
        }
    }
});
