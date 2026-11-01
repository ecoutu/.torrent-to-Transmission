/*
    A tiny Transmission RPC stand-in with demo data, so store screenshots
    show the real extension UI with a realistic, varied torrent list.
*/
import http from 'node:http';

const GB = 1e9;
const MB = 1e6;
const DEFAULT_DIR = '/srv/torrents';

function torrent(id, name, overrides) {
    return {
        id,
        name,
        status: 4,
        sizeWhenDone: 1 * GB,
        leftUntilDone: 0,
        percentDone: 1,
        rateDownload: 0,
        rateUpload: 0,
        peersConnected: 0,
        peersGettingFromUs: 0,
        peersSendingToUs: 0,
        recheckProgress: 0,
        queuePosition: id,
        error: 0,
        errorString: '',
        eta: -1,
        uploadRatio: 0,
        downloadDir: DEFAULT_DIR,
        ...overrides
    };
}

function partial(size, done) {
    return { sizeWhenDone: size, leftUntilDone: Math.round(size * (1 - done)), percentDone: done };
}

// Open-source releases and Blender open movies only.
export const TORRENTS = [
    torrent(1, 'ubuntu-26.04.1-desktop-amd64.iso', {
        ...partial(6.48 * GB, 0.62), rateDownload: 8.4 * MB, rateUpload: 312e3, eta: 296, peersConnected: 48
    }),
    torrent(2, 'Sintel (2010) [4K]', {
        ...partial(5.2 * GB, 0.18), rateDownload: 3.1 * MB, rateUpload: 96e3, eta: 1380, peersConnected: 21,
        downloadDir: '/srv/media/movies'
    }),
    torrent(3, 'Big Buck Bunny (2008) [1080p]', {
        status: 6, sizeWhenDone: 0.88 * GB, rateUpload: 410e3, uploadRatio: 2.41, downloadDir: '/srv/media/movies'
    }),
    torrent(4, 'debian-13.2.0-amd64-netinst.iso', {
        status: 6, sizeWhenDone: 0.78 * GB, rateUpload: 126e3, uploadRatio: 1.07
    }),
    torrent(5, 'archlinux-2026.11.01-x86_64.iso', {
        status: 2, sizeWhenDone: 1.29 * GB, recheckProgress: 0.64
    }),
    torrent(6, 'Fedora-Workstation-Live-43-1.6.x86_64.iso', {
        status: 0, ...partial(2.42 * GB, 0.45)
    }),
    torrent(7, 'Tears of Steel (2012) [1080p]', {
        status: 0, sizeWhenDone: 1.12 * GB, uploadRatio: 1.85, downloadDir: '/srv/media/movies'
    })
];

const SESSION = {
    'rpc-version': 19,
    'rpc-version-minimum': 14,
    version: '4.1.4 (a6d907d9ea)',
    'download-dir': DEFAULT_DIR,
    'alt-speed-enabled': false,
    units: {
        'size-bytes': 1000,
        'size-units': ['B', 'kB', 'MB', 'GB', 'TB'],
        'speed-bytes': 1000,
        'speed-units': ['B/s', 'kB/s', 'MB/s', 'GB/s', 'TB/s'],
        'memory-bytes': 1024,
        'memory-units': ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    }
};

function handle(method, args) {
    switch (method) {
        case 'session-get':
            return SESSION;
        case 'session-stats':
            return {
                downloadSpeed: TORRENTS.reduce((sum, t) => sum + t.rateDownload, 0),
                uploadSpeed: TORRENTS.reduce((sum, t) => sum + t.rateUpload, 0)
            };
        case 'torrent-get': {
            const ids = Array.isArray(args?.ids) ? args.ids : null;
            return { torrents: ids ? TORRENTS.filter((t) => ids.includes(t.id)) : TORRENTS };
        }
        case 'torrent-add':
            return { 'torrent-added': { id: 99, name: 'Cosmos Laundromat (2015) [1080p]', hashString: '0'.repeat(40) } };
        default:
            return {};
    }
}

export function startDemoServer() {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            let payload = {};
            try {
                payload = JSON.parse(body || '{}');
            } catch {
                // ignore
            }
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('X-Transmission-Session-Id', 'demo');
            res.end(JSON.stringify({ result: 'success', arguments: handle(payload.method, payload.arguments) }));
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ url: `http://127.0.0.1:${port}/transmission/rpc`, close: () => server.close() });
        });
    });
}
