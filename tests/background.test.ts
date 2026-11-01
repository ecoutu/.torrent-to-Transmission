import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { Browser } from 'wxt/browser';
import background from '@/entrypoints/background';
import { SESSION_HEADER } from '@/utils/transmission';

const RPC_URL = 'http://nas:9091/transmission/rpc';

type ClickListener = (info: Browser.contextMenus.OnClickData) => void;

function rpcBody(init: RequestInit | undefined) {
    return JSON.parse(String(init?.body));
}

const scripting = {
    registered: [] as string[],
    allSites: false
};

function stubPermissionsAndScripting() {
    scripting.registered = [];
    scripting.allSites = false;
    vi.spyOn(fakeBrowser.contextMenus, 'removeAll').mockResolvedValue(undefined as never);
    vi.spyOn(fakeBrowser.contextMenus, 'create').mockReturnValue('' as never);
    vi.spyOn(fakeBrowser.permissions.onAdded, 'addListener').mockImplementation(() => {});
    vi.spyOn(fakeBrowser.permissions.onRemoved, 'addListener').mockImplementation(() => {});
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation(async () => scripting.allSites);
    vi.spyOn(fakeBrowser.scripting, 'getRegisteredContentScripts').mockImplementation(
        async () => scripting.registered.map((id) => ({ id })) as never);
    vi.spyOn(fakeBrowser.scripting, 'registerContentScripts').mockImplementation(async (scripts) => {
        scripting.registered.push(...scripts.map((s) => s.id));
    });
    vi.spyOn(fakeBrowser.scripting, 'unregisterContentScripts').mockImplementation(async () => {
        scripting.registered = [];
    });
}

describe('context menu: add torrent', () => {
    const fetchMock = vi.fn<typeof fetch>();
    const notifications: { title: string; message: string }[] = [];
    let onMenuClick: ClickListener;
    let onMessage: (msg: unknown, sender: { id?: string; url?: string; tab?: unknown }, sendResponse: (r: unknown) => void) => unknown;
    const popupSender = () => ({ id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/popup.html'), tab: { id: 1 } });

    beforeEach(async () => {
        fakeBrowser.reset();
        notifications.length = 0;
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        // Answer every RPC; torrent-add is preceded by a 409 handshake.
        fetchMock.mockImplementation(async (url, init) => {
            if (url !== RPC_URL) {
                return new Response(new Uint8Array([100, 56, 58]), { status: 200 });
            }
            const headers = init?.headers as Record<string, string>;
            if (!headers[SESSION_HEADER]) {
                return new Response('', { status: 409, headers: { [SESSION_HEADER]: 'sid' } });
            }
            const { method } = rpcBody(init);
            if (method === 'torrent-add') {
                return Response.json({ result: 'success', arguments: { 'torrent-added': { id: 1, name: 'Debian ISO' } } });
            }
            return Response.json({ result: 'error' });
        });

        vi.spyOn(fakeBrowser.notifications, 'create').mockImplementation(async (...args: unknown[]) => {
            const options = args.find((a) => typeof a === 'object') as { title: string; message: string };
            notifications.push({ title: options.title, message: options.message });
            return 'id';
        });
        for (const method of ['setIcon', 'setBadgeText', 'setBadgeBackgroundColor'] as const) {
            vi.spyOn(fakeBrowser.action, method).mockResolvedValue(undefined as never);
        }

        await fakeBrowser.storage.local.set({
            rpcURL: RPC_URL,
            displayNotification: true,
            notificationDuration: 0,
            sendTorrentFile: false
        });
        // contextMenus, permissions and scripting aren't implemented by fake-browser
        vi.spyOn(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation((listener) => {
            onMenuClick = listener as ClickListener;
        });
        stubPermissionsAndScripting();
        vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener').mockImplementation((listener) => {
            onMessage = listener as typeof onMessage;
        });
        background.main();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    async function click(linkUrl: string) {
        onMenuClick({ menuItemId: 'torrent-to-transmission', linkUrl, editable: false, pageUrl: 'https://example.com' });
        await vi.waitFor(() => expect(notifications.length).toBeGreaterThan(0));
    }

    it('adds a magnet link and notifies once', async () => {
        const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567';
        await click(magnet);

        const adds = fetchMock.mock.calls.filter(([, init]) => rpcBody(init).method === 'torrent-add');
        // 409 handshake + one retry, no duplicate add
        expect(adds).toHaveLength(2);
        expect(rpcBody(adds[1]![1]).arguments).toEqual({ paused: false, filename: magnet });
        expect(notifications).toEqual([{ title: 'Torrent added', message: 'Debian ISO' }]);
    });

    it('sends to the chosen download location from the submenu', async () => {
        await fakeBrowser.storage.local.set({ 'additional-paths': [['Movies', '/data/movies'], ['TV', '/data/tv']] });
        onMenuClick({ menuItemId: 'location-1', linkUrl: 'magnet:?xt=urn:btih:abc', editable: false, pageUrl: 'https://example.com' });
        await vi.waitFor(() => expect(notifications.length).toBeGreaterThan(0));

        const add = fetchMock.mock.calls.filter(([, init]) => rpcBody(init).method === 'torrent-add').at(-1)!;
        expect(rpcBody(add[1]).arguments).toMatchObject({ filename: 'magnet:?xt=urn:btih:abc', 'download-dir': '/data/tv' });
    });

    it('answers popup add requests without a notification', async () => {
        const reply = await new Promise((resolve) => {
            onMessage({ method: 'add-torrent', url: 'magnet:?xt=urn:btih:abc', downloadDir: '/data/movies' }, popupSender(), resolve);
        });
        expect(reply).toEqual({ ok: true, title: 'Torrent added', message: 'Debian ISO' });
        expect(notifications).toEqual([]);
    });

    it('only accepts magnet links from web pages (magnet click script)', async () => {
        const sender = { id: fakeBrowser.runtime.id, url: 'https://example.com/', tab: { id: 2 } };
        expect(onMessage({ method: 'add-torrent', url: 'https://evil.example/x.torrent' }, sender, () => {})).toBe(false);
        onMessage({ method: 'add-torrent', url: 'magnet:?xt=urn:btih:abc' }, sender, () => {});
        await vi.waitFor(() => expect(notifications).toEqual([{ title: 'Torrent added', message: 'Debian ISO' }]));
        const adds = fetchMock.mock.calls.filter(([, init]) => rpcBody(init).method === 'torrent-add');
        expect(adds.every(([, init]) => rpcBody(init).arguments.filename === 'magnet:?xt=urn:btih:abc')).toBe(true);
    });

    it('rejects popup input that is not a torrent link', async () => {
        const reply = await new Promise((resolve) => {
            onMessage({ method: 'add-torrent', url: 'javascript:alert(1)' }, popupSender(), resolve);
        });
        expect(reply).toMatchObject({ ok: false });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('downloads and sends the .torrent file with cookies when enabled', async () => {
        await fakeBrowser.storage.local.set({ sendTorrentFile: true });
        await click('https://tracker.example/file.torrent');

        const download = fetchMock.mock.calls.find(([url]) => url === 'https://tracker.example/file.torrent');
        expect(download![1]).toMatchObject({ credentials: 'include' });
        const add = fetchMock.mock.calls.filter(([, init]) => init?.body && rpcBody(init).method === 'torrent-add').at(-1)!;
        expect(rpcBody(add[1]).arguments).toEqual({ paused: false, metainfo: btoa('d8:') });
    });
});

describe('magnet click content script', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.stubGlobal('fetch', vi.fn(async () => Response.json({ result: 'error' })));
        stubPermissionsAndScripting();
        vi.spyOn(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation(() => {});
        background.main();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('registers only when enabled and all-sites access is granted', async () => {
        await fakeBrowser.storage.local.set({ clickMagnets: true });
        await vi.waitFor(() => expect(fakeBrowser.permissions.contains).toHaveBeenCalled());
        expect(scripting.registered).toEqual([]);

        scripting.allSites = true;
        await fakeBrowser.storage.local.set({ clickMagnets: false });
        await fakeBrowser.storage.local.set({ clickMagnets: true });
        await vi.waitFor(() => expect(scripting.registered).toEqual(['magnet-click']));

        await fakeBrowser.storage.local.set({ clickMagnets: false });
        await vi.waitFor(() => expect(scripting.registered).toEqual([]));
    });
});
