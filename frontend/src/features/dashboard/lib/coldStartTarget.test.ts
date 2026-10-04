import { describe, it, expect } from 'vitest';
import { hasColdStartParams, parseColdStartTarget, stripColdStartParams } from './coldStartTarget';

describe('parseColdStartTarget', () => {
    it('reads ?chat= as a direct target (decoded)', () => {
        expect(parseColdStartTarget('?chat=%2B34%20600')).toEqual({ kind: 'direct', telephon: '+34 600' });
    });

    it('reads ?group= as a group target', () => {
        expect(parseColdStartTarget('?group=12')).toEqual({ kind: 'group', groupID: 12 });
        expect(parseColdStartTarget('group=3&x=1')).toEqual({ kind: 'group', groupID: 3 });
    });

    it('prefers chat when both are present', () => {
        expect(parseColdStartTarget('?group=1&chat=5')).toEqual({ kind: 'direct', telephon: '5' });
    });

    it('rejects empty or malformed values', () => {
        for (const bad of ['', '?', '?chat=', '?group=', '?group=0', '?group=-1', '?group=1.5', '?group=abc', '?group=1e3', '?other=1']) {
            expect(parseColdStartTarget(bad)).toBeNull();
        }
    });
});

describe('hasColdStartParams', () => {
    it('detects either key, even with an invalid value', () => {
        expect(hasColdStartParams('?chat=1')).toBe(true);
        expect(hasColdStartParams('?group=abc')).toBe(true);
        expect(hasColdStartParams('?x=1')).toBe(false);
        expect(hasColdStartParams('')).toBe(false);
    });
});

describe('stripColdStartParams', () => {
    it('removes chat and group but keeps other params', () => {
        expect(stripColdStartParams('?chat=1&x=2&group=3')).toBe('?x=2');
    });

    it('returns an empty string when nothing is left', () => {
        expect(stripColdStartParams('?chat=%2B1')).toBe('');
        expect(stripColdStartParams('')).toBe('');
    });
});
