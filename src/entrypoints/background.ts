import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
    ALL_SITES,
    DEFAULTS,
    TORRENT_FIELDS,
    arrayBufferToBase64,
    badgeText,
    describeStatus,
    diffTorrents,
    hasOrigins,
    isAddableUrl,
    rpcRequest,
    statusConstants,
    type AddTorrentResult,
    type BackgroundMessage,
    type DownloadLocation,
    type SessionInfo,
    type SessionStats,
    type Settings,
    type Torrent,
    type TorrentMap
} from '@/utils/transmission';

const MENU_ID = 'torrent-to-transmission';
// Child menu items: MENU_DEFAULT_ID, then MENU_LOCATION_PREFIX + index.
const MENU_DEFAULT_ID = 'location-default';
const MENU_LOCATION_PREFIX = 'location-';
const ALARM_NAME = 'update';
// chrome.alarms does not fire more often than every 30 seconds. The popup
// polls at the configured refresh rate while it is open.
const MIN_ALARM_MINUTES = 0.5;
const ACTION_REFRESH_DELAY_MS = 1000;
const MAGNET_SCRIPT_ID = 'magnet-click';

export default defineBackground(() => {
    /*
        Lifecycle
    */
    browser.runtime.onInstalled.addListener(async () => {
        const items = await browser.storage.local.get(Object.keys(DEFAULTS));
        const toSet: Record<string, unknown> = { torrents: {} };
        for (const [key, value] of Object.entries(DEFAULTS)) {
            if (items[key] === undefined) {
                toSet[key] = value;
            }
        }
        await browser.storage.local.set(toSet);

        await buildContextMenu();
        await scheduleAlarm();
        await syncMagnetScript();
        update();
    });

    browser.runtime.onStartup.addListener(async () => {
        await scheduleAlarm();
        await syncMagnetScript();
        update();
    });

    // Host access is granted from the options page or popup.
    browser.permissions.onAdded.addListener(() => {
        syncMagnetScript();
        update();
    });
    browser.permissions.onRemoved.addListener(() => {
        syncMagnetScript();
    });

    browser.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) {
            update();
        }
    });

    browser.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') {
            return;
        }
        if (changes.refreshRate) {
            scheduleAlarm(changes.refreshRate.newValue as number);
        }
        if (changes.clickMagnets) {
            syncMagnetScript();
        }
        if (changes['additional-paths']) {
            buildContextMenu();
        }
        if (changes.rpcURL || changes.rpcUser || changes.rpcPass) {
            browser.storage.session.remove('sessionId');
            browser.storage.local.set({ torrents: {} }).then(update);
        }
    });

    /*
        Messages from the popup.
    */
    browser.runtime.onMessage.addListener((msg: BackgroundMessage, sender, sendResponse) => {
        if (sender.id !== browser.runtime.id) {
            return false;
        }
        if (msg.method === 'update') {
            update().then(() => sendResponse({ ok: true }));
            return true;
        }
        if (msg.method === 'rpc-call') {
            rpcRequest(msg.payload).then(async (result) => {
                await update();
                sendResponse(result);
                // Transmission applies some changes (e.g. torrent-stop) on its
                // next session tick, so refresh again shortly after.
                setTimeout(update, ACTION_REFRESH_DELAY_MS);
            });
            return true;
        }
        if (msg.method === 'add-torrent') {
            // extension pages (popup, possibly opened in a tab) vs. the content script
            const fromExtensionPage = !!sender.url?.startsWith(browser.runtime.getURL('/'));
            if (!fromExtensionPage) {
                // magnet click content script: notify, no response needed
                if (/^magnet:/i.test(msg.url)) {
                    addTorrent(msg.url);
                }
                return false;
            }
            // popup: answer with the result instead of a notification
            if (!isAddableUrl(msg.url)) {
                sendResponse({ ok: false, title: 'Not a torrent link', message: 'Paste a magnet link or an http(s) .torrent URL.' });
                return false;
            }
            addTorrent(msg.url, msg.downloadDir, false).then(sendResponse);
            return true;
        }
        return false;
    });

    browser.contextMenus.onClicked.addListener(async (info: Browser.contextMenus.OnClickData) => {
        if (!info.linkUrl) {
            return;
        }
        const id = String(info.menuItemId);
        if (id === MENU_ID || id === MENU_DEFAULT_ID) {
            addTorrent(info.linkUrl);
        } else if (id.startsWith(MENU_LOCATION_PREFIX)) {
            const locations = await getLocations();
            const location = locations[Number(id.slice(MENU_LOCATION_PREFIX.length))];
            addTorrent(info.linkUrl, location?.[1]);
        }
    });
});

async function getLocations(): Promise<DownloadLocation[]> {
    const items = await browser.storage.local.get('additional-paths') as Partial<Settings>;
    return (items['additional-paths'] || []).filter(([, directory]) => directory);
}

/*
    "Send to Transmission" on links; a submenu of download locations when
    any are configured.
*/
async function buildContextMenu() {
    const locations = await getLocations();
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
        id: MENU_ID,
        title: 'Send to Transmission',
        contexts: ['link']
    });
    if (!locations.length) {
        return;
    }
    browser.contextMenus.create({ id: MENU_DEFAULT_ID, parentId: MENU_ID, title: 'Default location', contexts: ['link'] });
    locations.forEach(([label, directory], index) => {
        browser.contextMenus.create({
            id: MENU_LOCATION_PREFIX + index,
            parentId: MENU_ID,
            title: label || directory,
            contexts: ['link']
        });
    });
}

async function scheduleAlarm(refreshRate?: number) {
    if (refreshRate === undefined) {
        ({ refreshRate } = await browser.storage.local.get('refreshRate') as Partial<Settings>);
    }
    const seconds = Number(refreshRate) || DEFAULTS.refreshRate;
    await browser.alarms.create(ALARM_NAME, {
        periodInMinutes: Math.max(MIN_ALARM_MINUTES, seconds / 60)
    });
}

/*
    Register the magnet click handler only while the option is on and access
    to all sites has been granted.
*/
async function syncMagnetScript() {
    const { clickMagnets } = await browser.storage.local.get('clickMagnets') as Partial<Settings>;
    const wanted = !!clickMagnets && await hasOrigins(ALL_SITES);
    const registered = (await browser.scripting.getRegisteredContentScripts({ ids: [MAGNET_SCRIPT_ID] })).length > 0;

    if (wanted && !registered) {
        await browser.scripting.registerContentScripts([{
            id: MAGNET_SCRIPT_ID,
            js: ['content-scripts/magnet.js'],
            matches: ALL_SITES,
            runAt: 'document_start',
            allFrames: true,
            // re-registered from onStartup
            persistAcrossSessions: false
        }]);
    } else if (!wanted && registered) {
        await browser.scripting.unregisterContentScripts({ ids: [MAGNET_SCRIPT_ID] });
    }
}

/*
    Show Chrome desktop notification.
*/
async function showNotification(title: string, text: string) {
    const items = await browser.storage.local.get(['displayNotification', 'notificationDuration']) as Partial<Settings>;
    if (!items.displayNotification) {
        return;
    }

    const timeout = Number(items.notificationDuration) || 0;
    const id = await browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('/img/icon-large.png'),
        title: title,
        message: text || '',
        // 0 means "don't dismiss automatically" (not supported by Firefox)
        ...(import.meta.env.FIREFOX ? {} : { requireInteraction: timeout === 0 })
    });

    if (timeout > 0) {
        setTimeout(() => browser.notifications.clear(id), timeout * 1000);
    }
}

/*
    Add a torrent from a link (magnet or .torrent URL), optionally into a
    specific download directory. Shows a notification with the outcome
    unless notify is false.
*/
async function addTorrent(linkUrl: string, downloadDir?: string, notify = true): Promise<AddTorrentResult> {
    const result = await sendTorrent(linkUrl, downloadDir);
    if (notify) {
        showNotification(result.title, result.message);
    }
    if (result.ok) {
        update();
    }
    return result;
}

async function sendTorrent(linkUrl: string, downloadDir?: string): Promise<AddTorrentResult> {
    const { sendTorrentFile, rpcURL } = await browser.storage.local.get(['sendTorrentFile', 'rpcURL']) as Partial<Settings>;
    const isMagnet = /^magnet:/i.test(linkUrl);
    const args: Record<string, unknown> = { paused: false };
    if (downloadDir) {
        args['download-dir'] = downloadDir;
    }

    if (isMagnet || !sendTorrentFile) {
        args.filename = linkUrl;
    } else {
        try {
            // include cookies so torrents behind a login (private trackers) work
            const response = await fetch(linkUrl, { credentials: 'include' });
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            args.metainfo = arrayBufferToBase64(await response.arrayBuffer());
        } catch (err) {
            console.error('Error downloading torrent file:', err);
            return {
                ok: false,
                title: 'Couldn\'t download the .torrent file',
                message: err instanceof Error ? err.message : String(err)
            };
        }
    }

    type AddResult = { 'torrent-added'?: Torrent; 'torrent-duplicate'?: Torrent };
    const { status, data } = await rpcRequest<AddResult>({ method: 'torrent-add', arguments: args });

    if (status !== 200 || !data) {
        return {
            ok: false,
            title: 'Can\'t reach Transmission',
            message: (rpcURL || DEFAULTS.rpcURL) + ': ' + describeStatus(status)
        };
    }
    if (data.result !== 'success') {
        return { ok: false, title: 'Transmission couldn\'t add the torrent', message: data.result };
    }

    const added = data.arguments?.['torrent-added'];
    const duplicate = data.arguments?.['torrent-duplicate'];
    if (duplicate && !added) {
        return { ok: true, title: 'Already in Transmission', message: duplicate.name };
    }
    return { ok: true, title: 'Torrent added', message: added?.name ?? '' };
}

/*
    Refresh session info, stats and torrent list into storage and update the
    badge. A call made while a refresh is running queues one follow-up
    refresh (shared by all such callers) so changes made in the meantime,
    e.g. pausing a torrent, are always picked up.
*/
let inFlightUpdate: Promise<void> | null = null;
let queuedUpdate: Promise<void> | null = null;

function update(): Promise<void> {
    if (!inFlightUpdate) {
        inFlightUpdate = doUpdate()
            .catch((err) => console.error('update failed', err))
            .finally(() => {
                inFlightUpdate = null;
            });
        return inFlightUpdate;
    }
    if (!queuedUpdate) {
        queuedUpdate = inFlightUpdate.then(() => {
            queuedUpdate = null;
            return update();
        });
    }
    return queuedUpdate;
}

async function doUpdate() {
    // session-get first so a stale session id is renegotiated only once
    const session = await rpcRequest<SessionInfo['arguments']>({ method: 'session-get' });

    if (session.status !== 200 || session.data?.result !== 'success' || !session.data.arguments) {
        await browser.storage.local.set({ lastStatus: session.status === 200 ? 0 : session.status });
        setOfflineBadge();
        return;
    }

    const rpcVersion = session.data.arguments['rpc-version'];
    const [stats, torrentsResult] = await Promise.all([
        rpcRequest<SessionStats['arguments']>({ method: 'session-stats' }),
        rpcRequest<{ torrents: Torrent[] }>({ method: 'torrent-get', arguments: { fields: TORRENT_FIELDS } })
    ]);

    const toSet: Record<string, unknown> = {
        lastStatus: 200,
        'session-info': session.data,
        rpc_version: rpcVersion
    };
    if (stats.data?.result === 'success') {
        toSet['session-stats'] = stats.data;
    }

    const torrents = torrentsResult.data?.result === 'success' ? torrentsResult.data.arguments?.torrents : undefined;
    if (torrents) {
        const { torrents: previous = {} } = await browser.storage.local.get('torrents') as { torrents?: TorrentMap };
        const diff = diffTorrents(previous, torrents, statusConstants(rpcVersion));
        for (const torrent of diff.completed) {
            showNotification('Download complete', torrent.name);
        }
        toSet.torrents = diff.current;
        setOnlineBadge(diff.downloading, diff.seeding);
    } else {
        setOfflineBadge();
    }

    await browser.storage.local.set(toSet);
}

function setOnlineBadge(downloading: number, seeding: number) {
    browser.action.setIcon({ path: '/img/icon-bitty.png' });
    browser.action.setBadgeBackgroundColor({ color: '#F00' });
    browser.action.setBadgeText({ text: badgeText(downloading, seeding) });
}

function setOfflineBadge() {
    browser.action.setIcon({ path: '/img/icon-grey-bitty.png' });
    browser.action.setBadgeBackgroundColor({ color: '#7f7f7f' });
    browser.action.setBadgeText({ text: '?' });
}
