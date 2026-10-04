import { describe, it, expect } from 'vitest';
import { postLoginPath } from './loginRedirect';

describe('postLoginPath', () => {
    it('returns the protected dashboard location the user was redirected from (with its query)', () => {
        expect(postLoginPath({ from: { pathname: '/dashboard', search: '?chat=%2B34' } })).toBe('/dashboard?chat=%2B34');
        expect(postLoginPath({ from: { pathname: '/dashboard', search: '?group=7' } })).toBe('/dashboard?group=7');
        expect(postLoginPath({ from: { pathname: '/dashboard/x', search: '' } })).toBe('/dashboard/x');
        expect(postLoginPath({ from: { pathname: '/dashboard' } })).toBe('/dashboard');
    });

    it('falls back to /dashboard for anything else (no open redirects)', () => {
        for (const state of [
            undefined, null, 'x', {}, { from: null }, { from: '/dashboard?chat=1' },
            { from: { pathname: 'https://evil.com/dashboard', search: '' } },
            { from: { pathname: '//evil.com/dashboard', search: '' } },
            { from: { pathname: '/dashboardx', search: '' } },
            { from: { pathname: '/login', search: '' } },
            { from: { pathname: '/dashboard/../login', search: '' } },
            { from: { pathname: '/dashboard', search: '//evil.com' } },
            { from: { pathname: '/dashboard', search: 3 } },
            { from: { pathname: 5, search: '' } },
        ]) {
            expect(postLoginPath(state)).toBe('/dashboard');
        }
    });
});
