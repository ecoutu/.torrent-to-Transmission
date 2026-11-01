import './style.css';
import { browser } from 'wxt/browser';
import {
    DEFAULTS,
    hasOrigins,
    originPattern,
    describeStatus,
    type BackgroundMessage,
    statusConstants,
    type ListName,
    type RpcPayload,
    type SessionInfo,
    type SessionStats,
    type Settings,
    type Torrent,
    type TorrentMap
} from '@/utils/transmission';
import { DEFAULT_UNITS, formatEta, formatSize, formatSpeed } from '@/utils/format';

const state = {
    rpcVersion: undefined as number | undefined,
    S: statusConstants(),
    units: DEFAULT_UNITS,
    selectedList: 'all' as ListName,
    altSpeedEnabled: false
};

function $<T extends HTMLElement = HTMLElement>(selector: string): T {
    return document.querySelector<T>(selector)!;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function applySession(sessionInfo: SessionInfo | undefined, rpcVersion: number | undefined) {
    state.rpcVersion = rpcVersion;
    state.S = statusConstants(rpcVersion);
    const args = sessionInfo?.arguments;
    state.units = { ...DEFAULT_UNITS, ...(args?.units || {}) };
    state.altSpeedEnabled = !!args?.['alt-speed-enabled'];

    const turtle = $('img.turtle');
    turtle.classList.toggle('on', state.altSpeedEnabled);
    turtle.classList.toggle('off', !state.altSpeedEnabled);
}

/*
    Generate the DOM for a list item.
*/
function createListItem(torrent: Torrent): HTMLElement {
    const S = state.S;
    const supportsQueue = (state.rpcVersion ?? 0) >= 14;
    const item = el('div', 'list-item');
    item.dataset.id = String(torrent.id);

    item.append(el('div', 'name', torrent.name), el('div', 'clear'));

    if (supportsQueue) {
        item.append(
            el('div', 'button queue-up torrent'),
            el('div', 'button queue-down torrent')
        );
    }

    // progress bar
    let classes = 'progress-bar';
    if (torrent.error === 3)
        classes += ' error';
    else if (torrent.status === S.DOWNLOAD)
        classes += ' downloading';
    else if (torrent.status === S.SEED)
        classes += ' seeding';
    else if (torrent.status === S.CHECK || torrent.status === S.CHECK_WAIT)
        classes += ' verifying';
    else
        classes += ' paused';
    if (supportsQueue)
        classes += ' v14';

    const bar = el('div', classes);
    const fill = el('hr');
    fill.style.width = Math.round(torrent.percentDone * 100) + '%';
    bar.append(fill);
    item.append(bar);

    // pause/resume and remove buttons
    const stopped = torrent.status === S.STOPPED;
    const toggle = el('div', 'button torrent ' + (stopped ? 'resume' : 'pause'));
    toggle.title = stopped ? 'Resume' : 'Pause';
    const remove = el('div', 'button remove torrent');
    remove.title = 'Remove (keeps downloaded data)';
    item.append(toggle, remove, el('div', 'clear'));

    // status info bar
    if (torrent.error === 3) {
        item.append(el('div', 'status-wrapper', torrent.errorString || 'Data not found'));
    } else if (torrent.status === S.CHECK_WAIT) {
        item.append(el('div', 'status-wrapper', 'Verifying local data (queued)'));
    } else if (torrent.status === S.CHECK) {
        item.append(el('div', 'status-wrapper',
            'Verifying local data (' + (torrent.recheckProgress * 100).toFixed(2) + '%)'));
    } else if (torrent.status === S.DOWNLOAD_WAIT) {
        item.append(el('div', 'status-wrapper', 'Queued for download'));
    } else if (torrent.status === S.SEED_WAIT) {
        item.append(el('div', 'status-wrapper', 'Queued for seed'));
    } else {
        const sizeStr = formatSize(torrent.sizeWhenDone, state.units);
        const finishStr = formatSize(torrent.sizeWhenDone - torrent.leftUntilDone, state.units);
        const percentDone = (torrent.percentDone * 100).toFixed(2);

        let status = '';
        if (torrent.status === S.DOWNLOAD) {
            status = finishStr + ' of ' + sizeStr + ' (' + percentDone + '%)';
            if (torrent.eta > 0)
                status += ' - ' + formatEta(torrent.eta);
        } else if (torrent.status === S.SEED) {
            status = sizeStr;
        }

        let speed = '';
        if (torrent.status === S.DOWNLOAD)
            speed += ' ' + formatSpeed(torrent.rateDownload, state.units) + ' ↓';
        if (torrent.status === S.DOWNLOAD || torrent.status === S.SEED)
            speed += ' ' + formatSpeed(torrent.rateUpload, state.units) + ' ↑';

        item.append(el('div', 'status-wrapper', status), el('div', 'speed-wrapper', speed));
    }
    item.append(el('div', 'clear'));

    return item;
}

function matchesList(torrent: Torrent, list: ListName): boolean {
    const S = state.S;
    switch (list) {
        case 'download':
            return torrent.status === S.DOWNLOAD || torrent.status === S.DOWNLOAD_WAIT;
        case 'seed':
            return torrent.status === S.SEED || torrent.status === S.SEED_WAIT;
        case 'pause':
            return torrent.status === S.STOPPED;
        default:
            return true;
    }
}

function buildList(torrents: TorrentMap | undefined) {
    const sorted = Object.values(torrents || {})
        .filter((t) => matchesList(t, state.selectedList))
        .sort((a, b) => a.queuePosition - b.queuePosition);

    const wrapper = $('.list-wrapper');
    // keep scroll position across refreshes
    const scrollTop = wrapper.scrollTop;
    wrapper.replaceChildren(...sorted.map(createListItem));
    wrapper.scrollTop = scrollTop;
}

function updateSpeed(stats: SessionStats | undefined) {
    if (!stats?.arguments) return;
    $('.stats-wrapper').textContent =
        formatSpeed(stats.arguments.downloadSpeed, state.units) + ' ↓ ' +
        formatSpeed(stats.arguments.uploadSpeed, state.units) + ' ↑';
}

function selectList(list: ListName) {
    state.selectedList = list;
    for (const nav of document.querySelectorAll<HTMLElement>('.navitem')) {
        nav.classList.toggle('selected', nav.dataset.list === list);
    }
}

async function showConnection(lastStatus: number | undefined, rpcURL: string | undefined) {
    const ok = lastStatus === 200;
    $('.transmission-error').hidden = ok;
    $('.main').hidden = !ok;
    if (ok) return;

    const url = rpcURL || DEFAULTS.rpcURL;
    const pattern = originPattern(url);
    const permitted = !pattern || await hasOrigins([pattern]);
    $('.transmission-error .rpc-url').textContent = url;
    $('.transmission-error .error-reason').textContent =
        !permitted ? 'access not granted' :
        lastStatus === undefined ? 'connecting…' : describeStatus(lastStatus);

    const grant = $<HTMLButtonElement>('.grant-access');
    grant.hidden = permitted;
    grant.dataset.origin = pattern || '';
    $('.grant-host').textContent = pattern ? new URL(url).hostname : '';
}

function sendMessage(msg: BackgroundMessage) {
    return browser.runtime.sendMessage(msg).catch(() => {});
}

function rpcCall(payload: RpcPayload) {
    return sendMessage({ method: 'rpc-call', payload });
}

interface PopupStorage extends Partial<Settings> {
    lastStatus?: number;
    rpc_version?: number;
    'session-info'?: SessionInfo;
    'session-stats'?: SessionStats;
    torrents?: TorrentMap;
}

async function render() {
    const items = await browser.storage.local.get([
        'lastStatus', 'rpcURL', 'webURL', 'rpc_version', 'session-info',
        'session-stats', 'selected_list', 'torrents'
    ]) as PopupStorage;
    applySession(items['session-info'], items.rpc_version);
    selectList(items.selected_list || 'all');
    $<HTMLAnchorElement>('.webui').href = items.webURL || DEFAULTS.webURL;
    await showConnection(items.lastStatus, items.rpcURL);
    buildList(items.torrents);
    updateSpeed(items['session-stats']);
}

function bindEvents() {
    for (const nav of document.querySelectorAll<HTMLElement>('.navitem')) {
        nav.addEventListener('click', async () => {
            const list = nav.dataset.list as ListName;
            selectList(list);
            browser.storage.local.set({ selected_list: list });
            const { torrents } = await browser.storage.local.get('torrents') as PopupStorage;
            buildList(torrents);
        });
    }

    document.body.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('.button');
        if (!button || button.classList.contains('webui')) return;

        const req: RpcPayload & { arguments: Record<string, unknown> } = { method: '', arguments: {} };
        if (button.classList.contains('pause'))
            req.method = 'torrent-stop';
        else if (button.classList.contains('resume'))
            req.method = 'torrent-start';
        else if (button.classList.contains('remove'))
            req.method = 'torrent-remove';
        else if (button.classList.contains('queue-up'))
            req.method = 'queue-move-up';
        else if (button.classList.contains('queue-down'))
            req.method = 'queue-move-down';
        else
            return;

        if (button.classList.contains('torrent')) {
            req.arguments.ids = [Number(button.closest<HTMLElement>('.list-item')!.dataset.id)];
        }
        // "all" buttons omit ids, which Transmission applies to every torrent

        rpcCall(req);
    });

    $('img.turtle').addEventListener('click', () => {
        rpcCall({
            method: 'session-set',
            arguments: { 'alt-speed-enabled': !state.altSpeedEnabled }
        });
    });

    $('.grant-access').addEventListener('click', (event) => {
        const origin = (event.currentTarget as HTMLElement).dataset.origin;
        // the background refreshes when the permission is added
        if (origin) browser.permissions.request({ origins: [origin] });
    });

    $('.open-options').addEventListener('click', (event) => {
        event.preventDefault();
        browser.runtime.openOptionsPage();
    });
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const relevant = ['lastStatus', 'torrents', 'session-stats', 'session-info', 'rpc_version', 'webURL', 'rpcURL'];
    if (relevant.some((key) => key in changes)) {
        render();
    }
});

async function main() {
    bindEvents();
    await render();

    const requestUpdate = () => sendMessage({ method: 'update' });
    requestUpdate();

    const { refreshRate } = await browser.storage.local.get('refreshRate') as Partial<Settings>;
    const seconds = Math.max(1, Number(refreshRate) || DEFAULTS.refreshRate);
    setInterval(requestUpdate, seconds * 1000);
}

main();
