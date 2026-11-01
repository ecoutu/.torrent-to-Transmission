/*
    Moving a torrent (torrent-set-location with move) is acknowledged right
    away but runs in the background on the server, and a failure only shows
    up later as a local error on the torrent. moveTorrent requests the move
    and then watches the torrent until it lands, fails or takes too long.
    Progress is kept in `moves`, keyed by torrent id, for the popup to show.
*/
import { browser } from 'wxt/browser';
import { rpcRequest, samePath, type BackgroundMessage, type RpcResult, type Torrent } from '@/utils/transmission';

export interface MoveStatus {
    target: string;
    // location name to show, e.g. "Movies" or "default location"
    label: string;
    state: 'moving' | 'moved' | 'failed';
    message?: string;
}

const POLL_MS = 500;
const TIMEOUT_MS = 20_000;
const CLEAR_AFTER_MS = 5_000;
// Transmission's error code for local data errors (including failed moves)
const LOCAL_ERROR = 3;

export const moves = $state<Record<number, MoveStatus>>({});

// Bumped per move so an older move's cleanup can't remove a newer status.
const tokens: Record<number, number> = {};

type MoveFields = Pick<Torrent, 'downloadDir' | 'error' | 'errorString'>;

async function getTorrent(id: number): Promise<MoveFields | undefined> {
    const { data } = await rpcRequest<{ torrents: MoveFields[] }>({
        method: 'torrent-get',
        arguments: { ids: [id], fields: ['downloadDir', 'error', 'errorString'] }
    });
    return data?.arguments?.torrents[0];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function watch(id: number, target: string, label: string, previousError: string): Promise<MoveStatus> {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
        await sleep(POLL_MS);
        const torrent = await getTorrent(id);
        if (!torrent) {
            return { target, label, state: 'failed', message: 'The torrent is no longer in Transmission.' };
        }
        // ignore an error the torrent already had before this move
        if (torrent.error === LOCAL_ERROR && torrent.errorString !== previousError) {
            return { target, label, state: 'failed', message: torrent.errorString };
        }
        if (samePath(torrent.downloadDir, target) && torrent.error !== LOCAL_ERROR) {
            return { target, label, state: 'moved' };
        }
    }
    return { target, label, state: 'moving', message: 'Still moving. Large files can take a while.' };
}

export async function moveTorrent(id: number, target: string, label: string): Promise<MoveStatus> {
    const token = (tokens[id] ?? 0) + 1;
    tokens[id] = token;
    moves[id] = { target, label, state: 'moving' };

    const before = await getTorrent(id);
    const msg: BackgroundMessage = {
        method: 'rpc-call',
        payload: { method: 'torrent-set-location', arguments: { ids: [id], location: target, move: true } }
    };
    const reply = await browser.runtime.sendMessage(msg).catch(() => null) as RpcResult | null;

    const status: MoveStatus = reply?.status === 200 && reply.data?.result === 'success'
        ? await watch(id, target, label, before?.error === LOCAL_ERROR ? before.errorString : '')
        : { target, label, state: 'failed', message: reply?.data?.result ?? 'Transmission didn\'t respond.' };

    if (tokens[id] === token) {
        moves[id] = status;
        if (status.state !== 'moving') {
            setTimeout(() => {
                if (tokens[id] === token) delete moves[id];
            }, CLEAR_AFTER_MS);
        }
    }
    return status;
}
