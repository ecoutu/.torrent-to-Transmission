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

describe('context menu: add torrent', () => {
    const fetchMock = vi.fn<typeof fetch>();
    const notifications: { title: string; message: string }[] = [];
    let onMenuClick: ClickListener;

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
        // contextMenus isn't implemented by fake-browser
        vi.spyOn(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation((listener) => {
            onMenuClick = listener as ClickListener;
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
        expect(notifications).toEqual([{ title: 'torrent started', message: 'Debian ISO' }]);
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
