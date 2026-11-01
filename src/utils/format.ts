import type { StatusConstants, Torrent, Units } from './transmission';

export const DEFAULT_UNITS: Units = {
    'size-units': ['kB', 'MB', 'GB', 'TB'],
    'size-bytes': 1000,
    'speed-units': ['kB/s', 'MB/s', 'GB/s', 'TB/s'],
    'speed-bytes': 1000
};

/*
    Format a value with the server's unit labels the way Transmission's web
    interface does: no trailing zeros, at most `maxDecimals(unit)` decimals.

    value: amount in units[0]
*/
export function scaleToUnit(value: number, units: string[], unitSize: number, maxDecimals: (unit: string) => number): string {
    let index = 0;
    for (;;) {
        const decimals = maxDecimals(units[index] ?? '');
        // move up a unit when rounding would show e.g. "1000 kB"
        const rounded = Number(value.toFixed(decimals));
        if (rounded < unitSize || index >= units.length - 1) {
            // the browser's UI language (also lets tests pin a locale)
            const locale = globalThis.navigator?.language;
            const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(rounded);
            return formatted + ' ' + (units[index] ?? '');
        }
        value /= unitSize;
        index += 1;
    }
}

// Transmission < 4 lists units from kB; 4.x starts the list at bytes.
const startsAtBytes = (units: string[]) => /^B\b/.test(units[0] ?? '');

// Sizes: whole numbers up to MB, up to two decimals from GB.
const sizeDecimals = (unit: string) => (/^[GTPE]/.test(unit) ? 2 : 0);

export function formatSize(bytes: number, units: Units = DEFAULT_UNITS): string {
    const list = units['size-units'];
    const unitSize = units['size-bytes'];
    return scaleToUnit(startsAtBytes(list) ? bytes : bytes / unitSize, list, unitSize, sizeDecimals);
}

// Speeds: never below kB/s, up to two decimals.
export function formatSpeed(bytesPerSec: number, units: Units = DEFAULT_UNITS): string {
    const list = units['speed-units'];
    const unitSize = units['speed-bytes'];
    const fromKilo = startsAtBytes(list) ? list.slice(1) : list;
    return scaleToUnit(bytesPerSec / unitSize, fromKilo, unitSize, () => 2);
}

export function formatEta(eta: number): string {
    const pair = (major: number, majorUnit: string, minor: number, minorUnit: string) =>
        major + ' ' + majorUnit + ', ' + minor + ' ' + minorUnit;

    if (eta < 0) return '';
    if (eta < 60) return eta + ' seconds';
    if (eta < 3600) return pair(Math.floor(eta / 60), 'minutes', eta % 60, 'seconds');
    if (eta < 86400) return pair(Math.floor(eta / 3600), 'hours', Math.floor((eta % 3600) / 60), 'minutes');
    if (eta < 604800) return pair(Math.floor(eta / 86400), 'days', Math.floor((eta % 86400) / 3600), 'hours');
    return pair(Math.floor(eta / 604800), 'weeks', Math.floor((eta % 604800) / 86400), 'days');
}

// Compact remaining time, e.g. "45 s", "12 min", "3 h 5 min", "2 d 4 h".
export function formatEtaShort(eta: number): string {
    if (eta < 0) return '';
    if (eta < 60) return eta + ' s';
    if (eta < 3600) return Math.floor(eta / 60) + ' min';
    if (eta < 86400) {
        const minutes = Math.floor((eta % 3600) / 60);
        return Math.floor(eta / 3600) + ' h' + (minutes ? ' ' + minutes + ' min' : '');
    }
    const hours = Math.floor((eta % 86400) / 3600);
    return Math.floor(eta / 86400) + ' d' + (hours ? ' ' + hours + ' h' : '');
}

export type TorrentState = 'download' | 'seed' | 'paused' | 'done' | 'check' | 'queued' | 'error';

export interface TorrentView {
    state: TorrentState;
    // short state label, e.g. "Downloading"
    label: string;
    // secondary details, e.g. "1.2 GB of 4.0 GB · 30% · 12 min left"
    detail: string;
    // 0..1 for the progress bar
    progress: number;
}

export function describeTorrent(torrent: Torrent, S: StatusConstants, units: Units = DEFAULT_UNITS): TorrentView {
    const size = formatSize(torrent.sizeWhenDone, units);
    const have = formatSize(torrent.sizeWhenDone - torrent.leftUntilDone, units);
    const percent = Math.floor(torrent.percentDone * 1000) / 10 + '%';
    const progress = torrent.percentDone;
    const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ');

    if (torrent.error === 3) {
        return { state: 'error', label: 'Error', detail: torrent.errorString || 'Data not found', progress };
    }

    switch (torrent.status) {
        case S.CHECK_WAIT:
            return { state: 'check', label: 'Queued to verify', detail: size, progress };
        case S.CHECK:
            return {
                state: 'check',
                label: 'Verifying',
                detail: Math.floor(torrent.recheckProgress * 100) + '%',
                progress: torrent.recheckProgress
            };
        case S.DOWNLOAD_WAIT:
            return { state: 'queued', label: 'Queued', detail: join(have + ' of ' + size, percent), progress };
        case S.SEED_WAIT:
            return { state: 'queued', label: 'Queued to seed', detail: size, progress };
        case S.DOWNLOAD:
            if (torrent.sizeWhenDone === 0) {
                return { state: 'download', label: 'Downloading', detail: 'Retrieving metadata…', progress: 0 };
            }
            return {
                state: 'download',
                label: 'Downloading',
                detail: join(have + ' of ' + size, percent, torrent.eta > 0 && formatEtaShort(torrent.eta) + ' left'),
                progress
            };
        case S.SEED:
            return {
                state: 'seed',
                label: 'Seeding',
                detail: join(size, torrent.uploadRatio >= 0 && 'ratio ' + torrent.uploadRatio.toFixed(2)),
                progress: 1
            };
        default:
            if (torrent.percentDone >= 1) {
                return { state: 'done', label: 'Finished', detail: size, progress: 1 };
            }
            return {
                state: 'paused',
                label: 'Paused',
                detail: torrent.sizeWhenDone ? join(have + ' of ' + size, percent) : 'No metadata yet',
                progress
            };
    }
}
