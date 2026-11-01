/*
    Shared Transmission RPC helpers. Imported by the background service
    worker, the popup and the options page.
*/
import { browser } from 'wxt/browser';

export const SESSION_HEADER = 'X-Transmission-Session-Id';
const REQUEST_TIMEOUT_MS = 15000;

export interface Settings {
    rpcUser: string;
    rpcPass: string;
    rpcURL: string;
    webURL: string;
    displayNotification: boolean;
    notificationDuration: number;
    refreshRate: number;
    sendTorrentFile: boolean;
    clickMagnets: boolean;
    selected_list: ListName;
    // Extra download directories offered in the context menu and popup.
    'additional-paths': DownloadLocation[];
}

export type DownloadLocation = [label: string, directory: string];

export type ListName = 'all' | 'download' | 'seed' | 'pause';

export const DEFAULTS: Settings = {
    rpcUser: '',
    rpcPass: '',
    rpcURL: 'http://localhost:9091/transmission/rpc',
    webURL: 'http://localhost:9091',
    displayNotification: true,
    notificationDuration: 10,
    refreshRate: 5,
    sendTorrentFile: false,
    clickMagnets: false,
    selected_list: 'all',
    'additional-paths': []
};

// Host access is optional and requested at runtime. Every site is needed for
// downloading .torrent files and for handling magnet link clicks.
export const ALL_SITES = ['http://*/*', 'https://*/*'];

/*
    Match pattern granting access to the host of an http(s) URL, or null if
    the URL is invalid. Match patterns ignore the port.
*/
export function originPattern(url: string): string | null {
    try {
        const { protocol, hostname } = new URL(url);
        if (protocol !== 'http:' && protocol !== 'https:') {
            return null;
        }
        return protocol + '//' + hostname + '/*';
    } catch {
        return null;
    }
}

// Web interface address to use when none is configured.
export function webInterfaceURL(webURL: string | undefined, rpcURL: string | undefined): string {
    if (webURL) {
        return webURL;
    }
    try {
        return new URL(rpcURL || DEFAULTS.rpcURL).origin + '/transmission/web/';
    } catch {
        return DEFAULTS.webURL;
    }
}

export function hasOrigins(origins: string[]): Promise<boolean> {
    return browser.permissions.contains({ origins });
}

export interface Torrent {
    id: number;
    name: string;
    status: number;
    sizeWhenDone: number;
    leftUntilDone: number;
    percentDone: number;
    rateDownload: number;
    rateUpload: number;
    peersConnected: number;
    peersGettingFromUs: number;
    peersSendingToUs: number;
    recheckProgress: number;
    queuePosition: number;
    error: number;
    errorString: string;
    eta: number;
    uploadRatio: number;
}

export const TORRENT_FIELDS: (keyof Torrent)[] = [
    'id',
    'name',
    'status',
    'sizeWhenDone',
    'leftUntilDone',
    'percentDone',
    'rateDownload',
    'rateUpload',
    'peersConnected',
    'peersGettingFromUs',
    'peersSendingToUs',
    'recheckProgress',
    'queuePosition',
    'error',
    'errorString',
    'eta',
    'uploadRatio'
];

export interface Units {
    'size-units': string[];
    'size-bytes': number;
    'speed-units': string[];
    'speed-bytes': number;
}

export interface SessionInfo {
    result: string;
    arguments: {
        'rpc-version': number;
        'alt-speed-enabled'?: boolean;
        units?: Units;
        [key: string]: unknown;
    };
}

export interface SessionStats {
    result: string;
    arguments: {
        downloadSpeed: number;
        uploadSpeed: number;
        [key: string]: unknown;
    };
}

// Torrents keyed by id, as kept in storage.
export type TorrentMap = Record<string, Torrent>;

export interface RpcPayload {
    method: string;
    arguments?: Record<string, unknown>;
}

// Messages handled by the background service worker.
export type BackgroundMessage =
    | { method: 'update' }
    | { method: 'rpc-call'; payload: RpcPayload }
    | { method: 'add-torrent'; url: string; downloadDir?: string };

// Response to an add-torrent message.
export interface AddTorrentResult {
    ok: boolean;
    title: string;
    message: string;
}

// Links that can be sent to Transmission: magnet links and http(s) URLs.
export function isAddableUrl(url: string): boolean {
    if (/^magnet:\?/i.test(url)) {
        return true;
    }
    try {
        const { protocol } = new URL(url);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

export interface RpcResponse<T = any> {
    result: string;
    arguments?: T;
}

export interface RpcResult<T = any> {
    // HTTP status, or 0 when the server could not be reached
    status: number;
    // parsed JSON body, or null
    data: RpcResponse<T> | null;
}

export interface RpcOverrides {
    url?: string;
    user?: string;
    pass?: string;
}

export interface StatusConstants {
    STOPPED: number;
    CHECK_WAIT: number;
    CHECK: number;
    DOWNLOAD_WAIT: number;
    DOWNLOAD: number;
    SEED_WAIT: number;
    SEED: number;
}

// Torrent status codes. RPC versions before 14 used a bitfield.
export function statusConstants(rpcVersion?: number | null): StatusConstants {
    if (typeof rpcVersion === 'number' && rpcVersion < 14) {
        return {
            STOPPED: 16,
            CHECK_WAIT: 1,
            CHECK: 2,
            DOWNLOAD_WAIT: -1,
            DOWNLOAD: 4,
            SEED_WAIT: -1,
            SEED: 8
        };
    }
    return {
        STOPPED: 0,
        CHECK_WAIT: 1,
        CHECK: 2,
        DOWNLOAD_WAIT: 3,
        DOWNLOAD: 4,
        SEED_WAIT: 5,
        SEED: 6
    };
}

function basicAuth(user: string, pass: string): string {
    const bytes = new TextEncoder().encode(user + ':' + pass);
    return 'Basic ' + btoa(String.fromCharCode(...bytes));
}

/*
    Send an RPC request to Transmission.

    overrides: optional { url, user, pass } used instead of the saved settings
               (e.g. to test unsaved values on the options page)

    Never rejects; network failures resolve with status 0.
*/
export async function rpcRequest<T = any>(payload: RpcPayload, overrides: RpcOverrides = {}): Promise<RpcResult<T>> {
    const settings = await browser.storage.local.get(['rpcURL', 'rpcUser', 'rpcPass']) as Partial<Settings>;
    const url = overrides.url ?? settings.rpcURL ?? DEFAULTS.rpcURL;
    const user = overrides.user ?? settings.rpcUser ?? '';
    const pass = overrides.pass ?? settings.rpcPass ?? '';
    const body = JSON.stringify(payload);

    const post = (sessionId: string | undefined) => {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            [SESSION_HEADER]: sessionId || ''
        };
        if (user || pass) {
            headers['Authorization'] = basicAuth(user, pass);
        }
        return fetch(url, {
            method: 'POST',
            headers,
            body,
            credentials: 'omit',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    };

    try {
        const { sessionId } = await browser.storage.session.get('sessionId') as { sessionId?: string };
        let response = await post(sessionId);

        // Transmission's CSRF protection: a 409 carries the session id to use.
        // Retry exactly once with it.
        const newSessionId = response.headers.get(SESSION_HEADER);
        if (response.status === 409 && newSessionId) {
            await browser.storage.session.set({ sessionId: newSessionId });
            response = await post(newSessionId);
        }

        let data: RpcResponse<T> | null = null;
        try {
            data = await response.json();
        } catch {
            // non-JSON body (e.g. an HTML error page)
        }
        return { status: response.status, data };
    } catch (err) {
        console.warn('Transmission RPC request failed:', err);
        return { status: 0, data: null };
    }
}

// Human readable description of a failed RPC status code.
export function describeStatus(status: number): string {
    switch (status) {
        case 0:
            return 'No response. Check that Transmission is running and remote access is enabled.';
        case 401:
            return 'Wrong username or password.';
        case 403:
            return 'Access denied. Add this computer to rpc-whitelist (or the hostname to rpc-host-whitelist) in Transmission\'s settings.';
        case 404:
            return 'Not found. Check the RPC address.';
        case 409:
            return 'Session negotiation failed.';
        default:
            return 'Unexpected response (HTTP ' + status + ').';
    }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

export interface TorrentDiff {
    current: TorrentMap;
    completed: Torrent[];
    downloading: number;
    seeding: number;
}

/*
    Compare a fresh torrent-get result to the previously stored torrents.
    A torrent is "completed" when it was downloading and has nothing left.
*/
export function diffTorrents(previous: TorrentMap, torrents: Torrent[], S: StatusConstants): TorrentDiff {
    const diff: TorrentDiff = { current: {}, completed: [], downloading: 0, seeding: 0 };

    for (const torrent of torrents) {
        const prev = previous[torrent.id];
        if (prev &&
                (prev.status === S.DOWNLOAD || prev.status === S.DOWNLOAD_WAIT) &&
                prev.leftUntilDone > 0 &&
                torrent.leftUntilDone === 0) {
            diff.completed.push(torrent);
        }

        if (torrent.status === S.DOWNLOAD) {
            diff.downloading += 1;
        } else if (torrent.status === S.SEED) {
            diff.seeding += 1;
        }
        diff.current[torrent.id] = torrent;
    }

    return diff;
}

export function badgeText(downloading: number, seeding: number): string {
    const fmt = (n: number) => (n < 10 ? n.toString() : '*');
    return fmt(downloading) + '/' + fmt(seeding);
}
