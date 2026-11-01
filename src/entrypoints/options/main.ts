import './style.css';
import { browser } from 'wxt/browser';
import { DEFAULTS, describeStatus, rpcRequest, type SessionInfo, type Settings } from '@/utils/transmission';

const byId = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const saveButton = document.querySelector<HTMLInputElement>('input[type="submit"]')!;
const closeButton = document.querySelector<HTMLInputElement>('input[type="reset"]')!;
const addPathButton = byId('add-path');
const pathsTable = byId<HTMLTableElement>('paths-table');

// Discard results of stale connection tests when settings change quickly.
let rpcTestSeq = 0;

function createPathRow(label: string, directory: string): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = 'path-row';
    row.innerHTML =
        '<td><input type="text" class="path-label" /></td>' +
        '<td><input type="text" class="path-directory" /></td>' +
        '<td><input type="button" value="x" /></td>';
    row.querySelector<HTMLInputElement>('.path-label')!.value = label || '';
    row.querySelector<HTMLInputElement>('.path-directory')!.value = directory || '';
    return row;
}

// The first .path-row is the "new path" entry row; the rest are saved paths.
function savedPathRows(): HTMLTableRowElement[] {
    return Array.from(pathsTable.querySelectorAll<HTMLTableRowElement>('.path-row')).slice(1);
}

function entryRow(): HTMLTableRowElement {
    return pathsTable.querySelector<HTMLTableRowElement>('.path-row')!;
}

function rowInput(row: HTMLElement, className: string): HTMLInputElement {
    return row.querySelector<HTMLInputElement>('.' + className)!;
}

type OptionsStorage = Partial<Settings> & { 'additional-paths'?: [string, string][] };

async function init() {
    const items = await browser.storage.local.get([
        'rpcURL', 'webURL', 'rpcUser', 'rpcPass', 'displayNotification',
        'notificationDuration', 'refreshRate', 'sendTorrentFile',
        'enable-additional-paths', 'additional-paths'
    ]) as OptionsStorage;

    byId('rpc-url').value = items.rpcURL ?? DEFAULTS.rpcURL;
    byId('web-url').value = items.webURL ?? DEFAULTS.webURL;
    byId('rpc-user').value = items.rpcUser || '';
    byId('rpc-pass').value = items.rpcPass || '';
    byId('notification-display').checked = items.displayNotification ?? DEFAULTS.displayNotification;
    byId('notification-duration').value = String(items.notificationDuration ?? DEFAULTS.notificationDuration);
    byId('refresh-rate').value = String(items.refreshRate ?? DEFAULTS.refreshRate);
    byId('send-torrent-file').checked = !!items.sendTorrentFile;
    byId('enable-additional-paths').checked = !!items['enable-additional-paths'];

    savedPathRows().forEach((row) => row.remove());
    const entry = entryRow();
    rowInput(entry, 'path-label').value = '';
    rowInput(entry, 'path-directory').value = '';
    for (const [label, directory] of items['additional-paths'] || []) {
        pathsTable.append(createPathRow(label, directory));
    }

    rpcTest();
    toggleNotification();
    togglePaths();
    checkAddPathButton();
    markClean();
}

async function rpcTest() {
    const seq = ++rpcTestSeq;
    const urlResult = byId<HTMLElement>('rpc-test-url');
    const userResult = byId<HTMLElement>('rpc-test-user');

    urlResult.textContent = 'Testing…';
    urlResult.className = 'result';
    userResult.textContent = '';

    const { status, data } = await rpcRequest<SessionInfo['arguments']>({ method: 'session-get' }, {
        url: byId('rpc-url').value,
        user: byId('rpc-user').value,
        pass: byId('rpc-pass').value
    });

    if (seq !== rpcTestSeq) {
        return;
    }

    urlResult.textContent = '';
    if (status === 200 && data?.result === 'success' && data.arguments) {
        urlResult.textContent = 'Success! RPC version ' + data.arguments['rpc-version'];
        urlResult.className = 'result';
    } else if (status === 401) {
        userResult.textContent = 'Error: ' + describeStatus(status);
        userResult.className = 'result error';
    } else {
        urlResult.textContent = 'Error: ' + (status === 200
            ? 'unexpected response - is this a Transmission RPC address?'
            : describeStatus(status));
        urlResult.className = 'result error';
    }
}

function readNumber(id: string, fallback: number, min: number): number {
    const value = Number.parseInt(byId(id).value, 10);
    return Number.isFinite(value) && value >= min ? value : fallback;
}

async function save(event: Event) {
    event.preventDefault();

    const toSet: OptionsStorage = {
        rpcURL: byId('rpc-url').value.trim(),
        webURL: byId('web-url').value.trim(),
        rpcUser: byId('rpc-user').value,
        rpcPass: byId('rpc-pass').value,
        displayNotification: byId('notification-display').checked,
        notificationDuration: readNumber('notification-duration', DEFAULTS.notificationDuration, 0),
        refreshRate: readNumber('refresh-rate', DEFAULTS.refreshRate, 1),
        sendTorrentFile: byId('send-torrent-file').checked,
        'enable-additional-paths': byId('enable-additional-paths').checked,
        'additional-paths': savedPathRows().map((row): [string, string] => [
            rowInput(row, 'path-label').value,
            rowInput(row, 'path-directory').value
        ])
    };

    byId('notification-duration').value = String(toSet.notificationDuration);
    byId('refresh-rate').value = String(toSet.refreshRate);

    await browser.storage.local.set(toSet);
    markClean();
}

function markDirty() {
    saveButton.disabled = false;
}

function markClean() {
    saveButton.disabled = true;
}

function togglePaths() {
    const enabled = byId('enable-additional-paths').checked;
    for (const input of pathsTable.querySelectorAll('input')) {
        input.disabled = !enabled;
    }
    for (const th of pathsTable.querySelectorAll('th')) {
        th.className = enabled ? '' : 'text-disabled';
    }
    if (enabled) {
        checkAddPathButton();
    }
}

function toggleNotification() {
    const enabled = byId('notification-display').checked;
    for (const input of byId<HTMLTableElement>('notification-table').querySelectorAll('input')) {
        input.disabled = !enabled;
    }
}

function checkAddPathButton() {
    addPathButton.disabled = !rowInput(entryRow(), 'path-directory').value;
}

function addPath() {
    const entry = entryRow();
    const label = rowInput(entry, 'path-label');
    const directory = rowInput(entry, 'path-directory');

    if (!directory.value) {
        return;
    }

    entry.after(createPathRow(label.value, directory.value));
    label.value = '';
    directory.value = '';
    checkAddPathButton();
    markDirty();
}

document.addEventListener('input', markDirty);
document.addEventListener('change', markDirty);

saveButton.addEventListener('click', save);
closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    window.close();
});

byId('rpc-url').addEventListener('change', rpcTest);
byId('rpc-user').addEventListener('change', rpcTest);
byId('rpc-pass').addEventListener('change', rpcTest);
byId('notification-display').addEventListener('change', toggleNotification);
byId('enable-additional-paths').addEventListener('change', togglePaths);

rowInput(entryRow(), 'path-directory').addEventListener('input', checkAddPathButton);
addPathButton.addEventListener('click', addPath);
pathsTable.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.matches('.path-row input[value="x"]')) {
        target.closest('.path-row')!.remove();
        markDirty();
    }
});

init();
