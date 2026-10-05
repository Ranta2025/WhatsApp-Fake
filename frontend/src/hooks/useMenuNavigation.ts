import { useCallback, useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

const ITEM_SELECTOR = '[role="menuitem"]';

const isEnabled = (el: HTMLElement): boolean => (
    !(el instanceof HTMLButtonElement && el.disabled) && el.getAttribute('aria-disabled') !== 'true'
);

const menuItems = (menu: HTMLElement | null): HTMLElement[] => (
    menu ? Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter(isEnabled) : []
);

/**
 * Keyboard model of a `role="menu"` (WAI-ARIA menu pattern): when `active` turns true the
 * first enabled menuitem gets focus; the returned handler (put it on the menu's `onKeyDown`)
 * roves ArrowDown/ArrowUp (wrapping) and Home/End between the enabled menuitems. Items are
 * read on every key press, so an item that expands more items in place (e.g. the mute
 * durations) is covered. Escape and focus return stay with the owner (useEscapeToClose).
 */
export function useMenuNavigation(
    menuRef: RefObject<HTMLElement | null>, active: boolean,
): (e: ReactKeyboardEvent<HTMLElement>) => void {
    useEffect(() => {
        if (!active) return;
        menuItems(menuRef.current)[0]?.focus({ preventScroll: true });
    }, [active, menuRef]);

    return useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
        const items = menuItems(menuRef.current);
        if (items.length === 0) return;
        const current = document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1;
        let next: number;
        switch (e.key) {
            case 'ArrowDown': next = current < 0 ? 0 : (current + 1) % items.length; break;
            case 'ArrowUp': next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length; break;
            case 'Home': next = 0; break;
            case 'End': next = items.length - 1; break;
            default: return;
        }
        e.preventDefault();
        items[next]?.focus({ preventScroll: true });
    }, [menuRef]);
}

export default useMenuNavigation;
