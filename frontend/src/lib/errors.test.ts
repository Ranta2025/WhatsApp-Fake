import { describe, it, expect } from 'vitest';
import { getErrorName, getErrorMessage } from './errors';

// These helpers restore the pre-TypeScript structural reads (`err.name`,
// `err.response?.data?.error`, `err.message`) that typing had narrowed to
// `instanceof DOMException` / `axios.isAxiosError`. getUserMedia and fetch/axios
// rejections are not guaranteed to be real DOMException/AxiosError instances
// (test doubles, polyfills, wrapped errors), so the checks must run on any object.

describe('getErrorName', () => {
    it('reads .name from a real DOMException', () => {
        expect(getErrorName(new DOMException('denied', 'NotAllowedError'))).toBe('NotAllowedError');
    });

    it('reads .name from a plain object (the narrowing regression)', () => {
        expect(getErrorName({ name: 'NotFoundError', message: 'no cam' })).toBe('NotFoundError');
    });

    it('reads .name from an Error instance', () => {
        expect(getErrorName(new TypeError('bad'))).toBe('TypeError');
    });

    it('returns undefined when there is no structural name', () => {
        expect(getErrorName(null)).toBeUndefined();
        expect(getErrorName(undefined)).toBeUndefined();
        expect(getErrorName('NotAllowedError')).toBeUndefined();
        expect(getErrorName(42)).toBeUndefined();
        expect(getErrorName({})).toBeUndefined();
        expect(getErrorName({ name: 123 })).toBeUndefined();
    });
});

describe('getErrorMessage', () => {
    it('reads a plain object axios-style response.data.error (the narrowing regression)', () => {
        expect(getErrorMessage({ response: { data: { error: 'boom' } } }, 'fallback')).toBe('boom');
    });

    it('reads response.data.message when there is no error field', () => {
        expect(getErrorMessage({ response: { data: { message: 'hola' } } }, 'fallback')).toBe('hola');
    });

    it('prefers response.data.error over response.data.message', () => {
        expect(getErrorMessage({ response: { data: { error: 'err', message: 'msg' } } }, 'fallback')).toBe('err');
    });

    it('reads a plain string response body', () => {
        expect(getErrorMessage({ response: { data: 'plain body' } }, 'fallback')).toBe('plain body');
    });

    it('reads .message from an Error instance', () => {
        expect(getErrorMessage(new Error('native'), 'fallback')).toBe('native');
    });

    it('reads .message from a plain object', () => {
        expect(getErrorMessage({ message: 'plain message' }, 'fallback')).toBe('plain message');
    });

    it('prefers response data over the top-level message', () => {
        expect(getErrorMessage({ message: 'top', response: { data: { error: 'body' } } }, 'fallback')).toBe('body');
    });

    it('falls back for empty or missing fields', () => {
        expect(getErrorMessage(null, 'fallback')).toBe('fallback');
        expect(getErrorMessage(undefined, 'fallback')).toBe('fallback');
        expect(getErrorMessage(42, 'fallback')).toBe('fallback');
        expect(getErrorMessage({}, 'fallback')).toBe('fallback');
        expect(getErrorMessage({ response: { data: {} } }, 'fallback')).toBe('fallback');
        expect(getErrorMessage({ response: { data: { error: '' } } }, 'fallback')).toBe('fallback');
        expect(getErrorMessage({ response: { data: '' } }, 'fallback')).toBe('fallback');
        expect(getErrorMessage({ message: '' }, 'fallback')).toBe('fallback');
    });

    it('ignores non-string structural fields', () => {
        expect(getErrorMessage({ response: { data: { error: { nested: true } } }, message: 'm' }, 'fallback')).toBe('m');
        expect(getErrorMessage({ message: 7 }, 'fallback')).toBe('fallback');
    });
});
