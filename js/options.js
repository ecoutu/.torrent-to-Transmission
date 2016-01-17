var port = chrome.extension.connect({ name: "options" });
var saveButton;
var cancelButton;
var rpc_version = "";

function init() {
    document.getElementById("rpc-url").value = localStorage.rpcURL || "";
    document.getElementById("web-url").value = localStorage.webURL || "";
    document.getElementById("rpc-user").value = localStorage.rpcUser || "";
    document.getElementById("rpc-pass").value = localStorage.rpcPass || "";
    document.getElementById("notification-display").checked = JSON.parse(localStorage.displayNotification);
    document.getElementById("notification-duration").value = localStorage.notificationDuration || "";
    document.getElementById("refresh-rate").value = localStorage.refreshRate || "";
    document.getElementById("enable-additional-paths").checked = JSON.parse(localStorage.getItem("enable-additional-paths"));
    document.getElementById("use-metainfo").checked = JSON.parse(localStorage.useMetainfo);
    
    var paths = JSON.parse(localStorage.getItem("additional-paths"));
    var paths_table = $("#paths-table");
    
    for (path in paths) {
        var new_row = $('\
<tr class="path-row">\
    <td><input type="text" class="path-label" /></td>\
    <td><input type="text" class="path-directory" /></td>\
    <td><input type="button" value="x" /></td>\
</tr>'
        );
        $(new_row).find(".path-label").val(paths[path][0]);
        $(new_row).find(".path-directory").val(paths[path][1]);
        $(paths_table).append(new_row);
        
    }

    rpcTest();
    toggleNotification();
    togglePaths();
    markClean();
}

$(document).ready(function() {
    
    saveButton = $('input[type="submit"]');
    
    $('input[type="submit"]').click(save);
    $('input[type="reset"]').click(init);
    $('input[type="checkbox"]').live('click', markDirty);
    $('input[type="text"]').live('keydown', markDirty);

    document.getElementById("rpc-url").onchange = rpcTest;
    document.getElementById("rpc-user").onchange = rpcTest;
    document.getElementById("rpc-pass").onchange = rpcTest;
    document.getElementById("notification-display").onclick = toggleNotification;
    document.getElementById("enable-additional-paths").onclick = togglePaths;

    $('.path-row input[value="x"]').live('click', function() {
        $(this).parent().parent().remove();
    });

    $('.path-row:first').find('.path-label').keypress(function() {
        if ($('.path-row:first').find('.path-directory').val())
            $('input#add-path').attr('disabled', '');
        else
            $('input#add-path').attr('disabled', 'disabled');
    });
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

    localStorage.setItem("rpcURL", document.getElementById("rpc-url").value);
    localStorage.setItem("webURL", document.getElementById("web-url").value);
    localStorage.setItem("rpcUser", document.getElementById("rpc-user").value);
    localStorage.setItem("rpcPass", document.getElementById("rpc-pass").value);
    localStorage.setItem("displayNotification", document.getElementById("notification-display").checked);
    localStorage.setItem("notificationDuration", document.getElementById("notification-duration").value);
    localStorage.setItem("refreshRate", document.getElementById("refresh-rate").value);
    localStorage.setItem("rpc_version", rpc_version);
    localStorage.setItem("enable-additional-paths", document.getElementById("enable-additional-paths").checked);
    localStorage.setItem("useMetainfo", document.getElementById("use-metainfo").checked);
    
    var rows = $(".path-row").not(":first");
    
    $(rows).each(function() {
        var label = $(this).find('.path-label').val();
        var dir = $(this).find('.path-directory').val();
        
        paths.push([label, dir]);
    });

    localStorage.setItem('additional-paths', JSON.stringify(paths));
    
    markClean();
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
