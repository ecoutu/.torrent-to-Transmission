import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
    SESSION_HEADER,
    arrayBufferToBase64,
    badgeText,
    diffTorrents,
    originPattern,
    rpcRequest,
    statusConstants,
    type Torrent
} from '@/utils/transmission';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers });
}

describe('rpcRequest', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(async () => {
        fakeBrowser.reset();
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
        await fakeBrowser.storage.local.set({ rpcURL: 'http://nas:9091/transmission/rpc' });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('retries exactly once on 409 with the new session id', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('', { status: 409, headers: { [SESSION_HEADER]: 'abc' } }))
            .mockResolvedValueOnce(jsonResponse(200, { result: 'success' }, { [SESSION_HEADER]: 'abc' }));

        const result = await rpcRequest({ method: 'session-get' });

        expect(result).toEqual({ status: 200, data: { result: 'success' } });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const retryHeaders = fetchMock.mock.calls[1]![1]!.headers as Record<string, string>;
        expect(retryHeaders[SESSION_HEADER]).toBe('abc');
        expect(await fakeBrowser.storage.session.get('sessionId')).toEqual({ sessionId: 'abc' });
    });

    it('does not retry a successful response that carries the session header', async () => {
        await fakeBrowser.storage.session.set({ sessionId: 'abc' });
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { result: 'success' }, { [SESSION_HEADER]: 'abc' }));

        await rpcRequest({ method: 'session-get' });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('gives up after a second 409', async () => {
        fetchMock.mockImplementation(async () =>
            new Response('', { status: 409, headers: { [SESSION_HEADER]: 'xyz' } }));

        const result = await rpcRequest({ method: 'session-get' });

        expect(result.status).toBe(409);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('resolves with status 0 on network failure', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

        expect(await rpcRequest({ method: 'session-get' })).toEqual({ status: 0, data: null });
    });

    it('uses overrides and sends basic auth', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(200, { result: 'success' }));

        await rpcRequest({ method: 'session-get' }, { url: 'http://other/rpc', user: 'usér', pass: 'p' });

        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe('http://other/rpc');
        const auth = (init!.headers as Record<string, string>)['Authorization']!;
        const decoded = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), (c) => c.charCodeAt(0)));
        expect(decoded).toBe('usér:p');
    });
});

describe('statusConstants', () => {
    it('uses the modern codes when the RPC version is unknown', () => {
        expect(statusConstants().STOPPED).toBe(0);
        expect(statusConstants(undefined).SEED).toBe(6);
    });

    it('uses the legacy bitfield before RPC version 14', () => {
        expect(statusConstants(13).STOPPED).toBe(16);
        expect(statusConstants(13).SEED).toBe(8);
    });
});

describe('diffTorrents', () => {
    const S = statusConstants(17);
    const torrent = (overrides: Partial<Torrent>): Torrent => ({
        id: 1, name: 't', status: S.DOWNLOAD, sizeWhenDone: 100, leftUntilDone: 50, percentDone: 0.5,
        rateDownload: 0, rateUpload: 0, peersConnected: 0, peersGettingFromUs: 0, peersSendingToUs: 0,
        recheckProgress: 0, queuePosition: 0, error: 0, errorString: '', eta: 10,
        ...overrides
    });

    it('reports torrents that finished downloading', () => {
        const previous = { 1: torrent({}) };
        const diff = diffTorrents(previous, [torrent({ status: S.SEED, leftUntilDone: 0, percentDone: 1 })], S);
        expect(diff.completed.map((t) => t.id)).toEqual([1]);
        expect(diff.seeding).toBe(1);
    });

    it('does not report torrents seen for the first time', () => {
        const diff = diffTorrents({}, [torrent({ status: S.SEED, leftUntilDone: 0 })], S);
        expect(diff.completed).toEqual([]);
    });

    it('counts downloading torrents', () => {
        const diff = diffTorrents({}, [torrent({ id: 1 }), torrent({ id: 2 }), torrent({ id: 3, status: S.STOPPED })], S);
        expect(diff.downloading).toBe(2);
        expect(Object.keys(diff.current)).toEqual(['1', '2', '3']);
    });
});

describe('badgeText', () => {
    it('caps counts at 9', () => {
        expect(badgeText(3, 12)).toBe('3/*');
    });
});

describe('arrayBufferToBase64', () => {
    it('encodes without line breaks', () => {
        const bytes = new Uint8Array(200).map((_, i) => i);
        const encoded = arrayBufferToBase64(bytes.buffer);
        expect(encoded).not.toMatch(/\s/);
        expect(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))).toEqual(bytes);
    });
});

describe('originPattern', () => {
    it('builds a host match pattern without the port', () => {
        expect(originPattern('http://192.168.1.5:9091/transmission/rpc')).toBe('http://192.168.1.5/*');
        expect(originPattern('https://nas.local/transmission/rpc')).toBe('https://nas.local/*');
    });

    it('rejects invalid and non-http URLs', () => {
        expect(originPattern('not a url')).toBeNull();
        expect(originPattern('ftp://nas/rpc')).toBeNull();
    });
});
