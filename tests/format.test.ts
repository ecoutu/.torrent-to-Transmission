import { describe, expect, it } from 'vitest';
import { formatEta, formatSize, formatSpeed } from '@/utils/format';

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
