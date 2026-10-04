// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { NotificationPermissionState } from '../../../utils/notifications';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockSync = vi.fn();
vi.mock('../../../utils/push', () => ({ syncPushSubscription: (...a: unknown[]) => mockSync(...a) }));

import { usePushSync } from './usePushSync';

function Harness({ userKey, permission }: { userKey: string | null; permission: NotificationPermissionState }) {
    usePushSync(userKey, permission);
    return null;
}

describe('usePushSync', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSync.mockResolvedValue(true);
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('syncs on dashboard boot when the user is logged in and permission is granted', async () => {
        await act(async () => { root.render(<Harness userKey="111" permission="granted" />); });
        expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it('does nothing without permission or without a user', async () => {
        await act(async () => { root.render(<Harness userKey="111" permission="default" />); });
        await act(async () => { root.render(<Harness userKey="111" permission="denied" />); });
        await act(async () => { root.render(<Harness userKey={null} permission="granted" />); });
        expect(mockSync).not.toHaveBeenCalled();
    });

    it('syncs right after the user grants permission (banner), once per change', async () => {
        await act(async () => { root.render(<Harness userKey="111" permission="default" />); });
        await act(async () => { root.render(<Harness userKey="111" permission="granted" />); });
        await act(async () => { root.render(<Harness userKey="111" permission="granted" />); });
        expect(mockSync).toHaveBeenCalledTimes(1);
    });

    it('re-syncs when a different user logs in on the same tab', async () => {
        await act(async () => { root.render(<Harness userKey="111" permission="granted" />); });
        await act(async () => { root.render(<Harness userKey="222" permission="granted" />); });
        expect(mockSync).toHaveBeenCalledTimes(2);
    });
});
