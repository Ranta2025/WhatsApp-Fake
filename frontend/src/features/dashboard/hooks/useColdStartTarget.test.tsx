// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useColdStartTarget } from './useColdStartTarget';
import type { NotificationTarget } from '../lib/notificationClick';

// Cold start: with no window open, the Service Worker opens
// `/dashboard?chat=<telephon>` or `/dashboard?group=<id>`. The dashboard
// reads that once at boot, selects the target once its data is loaded and
// drops the query so a reload does not re-open it.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ ready, onTarget }: { ready: boolean; onTarget: (target: NotificationTarget) => void }) {
    useColdStartTarget(ready, onTarget);
    return null;
}

describe('useColdStartTarget', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        window.history.replaceState(null, '', '/');
    });

    it('waits until ready, then selects the chat once and strips the query', () => {
        window.history.replaceState({ key: 'k' }, '', '/dashboard?chat=%2B34&x=1#h');
        const onTarget = vi.fn();
        act(() => { root.render(<Harness ready={false} onTarget={onTarget} />); });
        expect(onTarget).not.toHaveBeenCalled();
        expect(window.location.search).toBe('?chat=%2B34&x=1');

        act(() => { root.render(<Harness ready onTarget={onTarget} />); });
        expect(onTarget).toHaveBeenCalledTimes(1);
        expect(onTarget).toHaveBeenCalledWith({ kind: 'direct', telephon: '+34' });
        expect(window.location.pathname).toBe('/dashboard');
        expect(window.location.search).toBe('?x=1');
        expect(window.location.hash).toBe('#h');
        expect(window.history.state).toEqual({ key: 'k' });

        // A new handler identity (contacts/groups changed) must not re-trigger it.
        const next = vi.fn();
        act(() => { root.render(<Harness ready onTarget={next} />); });
        expect(next).not.toHaveBeenCalled();
    });

    it('selects a group target', () => {
        window.history.replaceState(null, '', '/dashboard?group=12');
        const onTarget = vi.fn();
        act(() => { root.render(<Harness ready onTarget={onTarget} />); });
        expect(onTarget).toHaveBeenCalledWith({ kind: 'group', groupID: 12 });
        expect(window.location.search).toBe('');
    });

    it('strips an invalid query without selecting anything', () => {
        window.history.replaceState(null, '', '/dashboard?group=abc');
        const onTarget = vi.fn();
        act(() => { root.render(<Harness ready onTarget={onTarget} />); });
        expect(onTarget).not.toHaveBeenCalled();
        expect(window.location.search).toBe('');
    });

    it('does nothing (and keeps the URL) without cold-start params', () => {
        window.history.replaceState(null, '', '/dashboard?x=1');
        const replace = vi.spyOn(window.history, 'replaceState');
        const onTarget = vi.fn();
        act(() => { root.render(<Harness ready onTarget={onTarget} />); });
        expect(onTarget).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
        replace.mockRestore();
    });

    it('reads the query only at boot, not on later URL changes', () => {
        window.history.replaceState(null, '', '/dashboard');
        const onTarget = vi.fn();
        act(() => { root.render(<Harness ready={false} onTarget={onTarget} />); });
        window.history.replaceState(null, '', '/dashboard?chat=9');
        act(() => { root.render(<Harness ready onTarget={onTarget} />); });
        expect(onTarget).not.toHaveBeenCalled();
    });
});
