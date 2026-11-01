import type { Units } from './transmission';

export const DEFAULT_UNITS: Units = {
    'size-units': ['kB', 'MB', 'GB', 'TB'],
    'size-bytes': 1000,
    'speed-units': ['kB/s', 'MB/s', 'GB/s', 'TB/s'],
    'speed-bytes': 1000
};

/*
    size: value already divided by unitSize once (i.e. in units[0])
*/
export function sizeToStr(size: number, units: string[], unitSize: number): string {
    let sizeStr = size.toFixed(0);
    let unitStr = '';

    for (let i = 0; i < units.length; i++) {
        if (size < unitSize || i === units.length - 1) {
            unitStr = units[i] ?? '';
            break;
        }
        size = size / unitSize;
        sizeStr = size.toFixed(2);
    }

    return sizeStr + ' ' + unitStr;
}

export function formatSize(bytes: number, units: Units = DEFAULT_UNITS): string {
    return sizeToStr(bytes / units['size-bytes'], units['size-units'], units['size-bytes']);
}

export function formatSpeed(bytesPerSec: number, units: Units = DEFAULT_UNITS): string {
    return sizeToStr(bytesPerSec / units['speed-bytes'], units['speed-units'], units['speed-bytes']);
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
