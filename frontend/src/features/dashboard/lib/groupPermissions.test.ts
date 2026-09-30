import { describe, it, expect } from 'vitest';
import {
    canSend, canEditInfo, canAddMembers, canManageMembers, canChangeSettings,
    type GroupPermissionRole, type GroupPermissionSettings,
} from './groupPermissions';

// Mirror of the backend matrix (GA1): admin always; member only when the matching
// setting is off; `left`/non-member deny everything. Absent settings default open.

const open: GroupPermissionSettings = {};
const allRestricted: GroupPermissionSettings = {
    OnlyAdminsCanSend: true, OnlyAdminsCanEditInfo: true, OnlyAdminsCanAddMembers: true,
};

describe('groupPermissions matrix', () => {
    it('canSend: admin always, member only when send is open, left/unknown never', () => {
        const cases: Array<{ role: GroupPermissionRole; settings: GroupPermissionSettings; want: boolean }> = [
            { role: 'admin', settings: open, want: true },
            { role: 'admin', settings: allRestricted, want: true },
            { role: 'member', settings: open, want: true },
            { role: 'member', settings: { OnlyAdminsCanSend: true }, want: false },
            { role: 'member', settings: { OnlyAdminsCanEditInfo: true }, want: true },
            { role: 'left', settings: open, want: false },
            { role: 'left', settings: allRestricted, want: false },
            { role: undefined, settings: open, want: false },
            { role: null, settings: open, want: false },
        ];
        for (const c of cases) expect(canSend(c.role, c.settings), `${c.role} ${JSON.stringify(c.settings)}`).toBe(c.want);
    });

    it('canEditInfo: admin always, member only when edit info is open', () => {
        expect(canEditInfo('admin', allRestricted)).toBe(true);
        expect(canEditInfo('member', open)).toBe(true);
        expect(canEditInfo('member', { OnlyAdminsCanEditInfo: true })).toBe(false);
        expect(canEditInfo('member', { OnlyAdminsCanSend: true })).toBe(true);
        expect(canEditInfo('left', open)).toBe(false);
        expect(canEditInfo(undefined, open)).toBe(false);
    });

    it('canAddMembers: admin always, member only when add members is open', () => {
        expect(canAddMembers('admin', allRestricted)).toBe(true);
        expect(canAddMembers('member', open)).toBe(true);
        expect(canAddMembers('member', { OnlyAdminsCanAddMembers: true })).toBe(false);
        expect(canAddMembers('member', { OnlyAdminsCanSend: true })).toBe(true);
        expect(canAddMembers('left', open)).toBe(false);
        expect(canAddMembers(undefined, open)).toBe(false);
    });

    it('canManageMembers / canChangeSettings: admin only, never configurable', () => {
        expect(canManageMembers('admin')).toBe(true);
        expect(canChangeSettings('admin')).toBe(true);
        expect(canManageMembers('member')).toBe(false);
        expect(canChangeSettings('member')).toBe(false);
        expect(canManageMembers('left')).toBe(false);
        expect(canChangeSettings('left')).toBe(false);
        expect(canManageMembers(undefined)).toBe(false);
        expect(canChangeSettings(null)).toBe(false);
    });

    it('a `left` role denies every permission regardless of settings', () => {
        const perms = [
            canSend('left', open), canEditInfo('left', open), canAddMembers('left', open),
            canManageMembers('left'), canChangeSettings('left'),
        ];
        expect(perms).toEqual([false, false, false, false, false]);
    });
});
