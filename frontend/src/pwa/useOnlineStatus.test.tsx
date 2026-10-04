// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useOnlineStatus } from './useOnlineStatus';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let online: boolean | undefined;
function Probe() {
  const value = useOnlineStatus();
  useEffect(() => {
    online = value;
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

const setOnLine = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('useOnlineStatus', () => {
  it('reads the initial navigator.onLine value', () => {
    setOnLine(false);
    act(() => root.render(<Probe />));
    expect(online).toBe(false);
  });

  it('follows offline and online events', () => {
    const spy = setOnLine(true);
    act(() => root.render(<Probe />));
    expect(online).toBe(true);
    spy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(online).toBe(false);
    spy.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(online).toBe(true);
  });
});
