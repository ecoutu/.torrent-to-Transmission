import { describe, expect, it } from 'vitest';
import { describeTorrent, formatEta, formatEtaShort, formatSize, formatSpeed } from '@/utils/format';
import { statusConstants, type Torrent } from '@/utils/transmission';

describe('formatSize', () => {
    it('formats using Transmission-style units', () => {
        expect(formatSize(500)).toBe('1 kB');
        expect(formatSize(1_500_000)).toBe('1.50 MB');
        expect(formatSize(2_000_000_000)).toBe('2.00 GB');
    });

    it('stays on the largest unit for huge values', () => {
        expect(formatSize(5e15)).toBe('5000.00 TB');
    });
});

describe('Transmission 4 units (starting at bytes)', () => {
    const units = {
        'size-units': ['B', 'kB', 'MB', 'GB', 'TB'],
        'size-bytes': 1000,
        'speed-units': ['B/s', 'kB/s', 'MB/s', 'GB/s', 'TB/s'],
        'speed-bytes': 1000
    };

    it('formats sizes and speeds without shifting a unit', () => {
        expect(formatSize(734_003_200, units)).toBe('734.00 MB');
        expect(formatSize(512, units)).toBe('512 B');
        expect(formatSpeed(2_500_000, units)).toBe('2.50 MB/s');
        expect(formatSpeed(0, units)).toBe('0 B/s');
    });
});

describe('formatSpeed', () => {
    it('formats bytes per second', () => {
        expect(formatSpeed(0)).toBe('0 kB/s');
        expect(formatSpeed(2_500_000)).toBe('2.50 MB/s');
    });
});

describe('formatEta', () => {
    it('formats each range without rounding up to 60', () => {
        expect(formatEta(-1)).toBe('');
        expect(formatEta(45)).toBe('45 seconds');
        expect(formatEta(119)).toBe('1 minutes, 59 seconds');
        expect(formatEta(3599 + 3600)).toBe('1 hours, 59 minutes');
        expect(formatEta(86400 * 2 + 3600 * 23 + 3599)).toBe('2 days, 23 hours');
    });
});

describe('formatEtaShort', () => {
    it('uses compact units', () => {
        expect(formatEtaShort(-1)).toBe('');
        expect(formatEtaShort(45)).toBe('45 s');
        expect(formatEtaShort(750)).toBe('12 min');
        expect(formatEtaShort(3600 * 3 + 300)).toBe('3 h 5 min');
        expect(formatEtaShort(7200)).toBe('2 h');
        expect(formatEtaShort(86400 * 2 + 3600 * 4)).toBe('2 d 4 h');
    });
});

describe('describeTorrent', () => {
    const S = statusConstants(17);
    const torrent = (overrides: Partial<Torrent>): Torrent => ({
        id: 1, name: 't', status: S.DOWNLOAD, sizeWhenDone: 4_000_000_000, leftUntilDone: 2_800_000_000,
        percentDone: 0.3, rateDownload: 0, rateUpload: 0, peersConnected: 0, peersGettingFromUs: 0,
        peersSendingToUs: 0, recheckProgress: 0, queuePosition: 0, error: 0, errorString: '', eta: 750,
        uploadRatio: 1.234, downloadDir: '/downloads',
        ...overrides
    });

    it('describes a download with progress and time left', () => {
        expect(describeTorrent(torrent({}), S)).toEqual({
            state: 'download',
            label: 'Downloading',
            detail: '1.20 GB of 4.00 GB · 30% · 12 min left',
            progress: 0.3
        });
    });

    it('describes a magnet still fetching metadata', () => {
        expect(describeTorrent(torrent({ sizeWhenDone: 0, leftUntilDone: 0, percentDone: 0 }), S).detail)
            .toBe('Retrieving metadata…');
    });

    it('describes seeding with ratio', () => {
        const view = describeTorrent(torrent({ status: S.SEED, leftUntilDone: 0, percentDone: 1 }), S);
        expect([view.state, view.detail]).toEqual(['seed', '4.00 GB · ratio 1.23']);
    });

    it('distinguishes paused from finished', () => {
        expect(describeTorrent(torrent({ status: S.STOPPED }), S).state).toBe('paused');
        expect(describeTorrent(torrent({ status: S.STOPPED, percentDone: 1, leftUntilDone: 0 }), S).label).toBe('Finished');
    });

    it('shows verification progress', () => {
        const view = describeTorrent(torrent({ status: S.CHECK, recheckProgress: 0.456 }), S);
        expect([view.label, view.detail, view.progress]).toEqual(['Verifying', '45%', 0.456]);
    });

    it('surfaces local data errors', () => {
        const view = describeTorrent(torrent({ error: 3, errorString: 'No data found! Ensure your drives are connected' }), S);
        expect([view.state, view.detail]).toEqual(['error', 'No data found! Ensure your drives are connected']);
    });
});
