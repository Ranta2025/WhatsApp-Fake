// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import OfflineBanner from './OfflineBanner';
import { useAuth } from '../context/AuthContext';
import wsManager, { type WsConnectionState } from '../api/websocket';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

let wsHandler: ((state: WsConnectionState) => void) | null = null;
vi.mock('../api/websocket', () => ({
  default: {
    onConnectionState: vi.fn((h: (state: WsConnectionState) => void) => {
      wsHandler = h;
      return () => {
        wsHandler = null;
      };
    }),
  },
}));

const mockUseAuth = vi.mocked(useAuth);
let container: HTMLDivElement;
let root: Root;
let onLine: ReturnType<typeof vi.spyOn>;

const setUser = (loggedIn: boolean) =>
  mockUseAuth.mockReturnValue({ user: loggedIn ? { username: 'u' } : null } as unknown as ReturnType<typeof useAuth>);

const render = () => act(() => root.render(<OfflineBanner />));

beforeEach(() => {
  wsHandler = null;
  setUser(false);
  onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('OfflineBanner', () => {
  it('renders nothing while online', () => {
    render();
    expect(container.textContent).toBe('');
    expect(vi.mocked(wsManager.onConnectionState)).toHaveBeenCalled();
  });

  it('shows "Sin conexión" as a polite status when the browser goes offline, even logged out', () => {
    render();
    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    const banner = container.querySelector('[role="status"]');
    expect(banner?.textContent).toBe('Sin conexión');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
  });

  it('hides again when the browser comes back online', () => {
    onLine.mockReturnValue(false);
    render();
    expect(container.textContent).toBe('Sin conexión');
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(container.textContent).toBe('');
  });

  it('shows when an established session loses its websocket', () => {
    setUser(true);
    render();
    act(() => wsHandler!('connected'));
    expect(container.textContent).toBe('');
    act(() => wsHandler!('disconnected'));
    expect(container.textContent).toBe('Sin conexión');
    act(() => wsHandler!('connected'));
    expect(container.textContent).toBe('');
  });

  it('does not show for a websocket drop without a logged-in user', () => {
    setUser(false);
    render();
    act(() => wsHandler!('disconnected'));
    expect(container.textContent).toBe('');
  });

  it('does not treat unauthorized as offline', () => {
    setUser(true);
    render();
    act(() => wsHandler!('connected'));
    act(() => wsHandler!('unauthorized'));
    expect(container.textContent).toBe('');
  });
});
