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
    rpcTest();
    toggleNotification();
    markClean();
}

window.onload = function() {
    for (var i = 0, inputs = document.getElementsByTagName("input"); i < inputs.length; i++) {
        if (inputs[i].type == "checkbox") {
            
        }
        else if (inputs[i].type == "submit") {
            saveButton = inputs[i];
            saveButton.onclick = save;
        }
        else if (inputs[i].type == "reset") {
            inputs[i].onclick = init;
        }
        else {
            inputs[i].onkeydown = markDirty;
        }
    }
    document.getElementById("rpc-url").onchange = rpcTest;
    document.getElementById("rpc-user").onchange = rpcTest;
    document.getElementById("rpc-pass").onchange = rpcTest;
    document.getElementById("notification-display").onclick = toggleNotification;
    init();
};

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
    localStorage.setItem("rpcURL", document.getElementById("rpc-url").value);
    localStorage.setItem("webURL", document.getElementById("web-url").value);
    localStorage.setItem("rpcUser", document.getElementById("rpc-user").value);
    localStorage.setItem("rpcPass", document.getElementById("rpc-pass").value);
    localStorage.setItem("displayNotification", document.getElementById("notification-display").checked);
    localStorage.setItem("notificationDuration", document.getElementById("notification-duration").value);
    localStorage.setItem("refreshRate", document.getElementById("refresh-rate").value);
    localStorage.setItem("rpc_version", rpc_version);
    markClean();
}

function markDirty() {
    saveButton.disabled = false;
}

function markClean() {
    saveButton.disabled = true;
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
