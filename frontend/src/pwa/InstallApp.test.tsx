// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import InstallApp from './InstallApp';
import { resetInstallPromptForTests } from './useInstallPrompt';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const stubMatchMedia = (standalone: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

const stubNav = (userAgent: string, platform: string, maxTouchPoints = 0) =>
  vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints });

const install = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Instalar app');

beforeEach(() => {
  resetInstallPromptForTests();
  stubMatchMedia(false);
  stubNav('Mozilla/5.0 (X11; Linux)', 'Linux x86_64');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('InstallApp', () => {
  it('renders nothing on desktop before the install event', () => {
    act(() => root.render(<InstallApp />));
    expect(container.textContent).toBe('');
  });

  it('shows "Instalar app" once installable and prompts on click', async () => {
    act(() => root.render(<InstallApp />));
    const event = new Event('beforeinstallprompt', { cancelable: true });
    const prompt = vi.fn().mockResolvedValue(undefined);
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }) });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(install()).toBeDefined();
    await act(async () => {
      install()!.click();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(install()).toBeUndefined();
  });

  it('shows static instructions on iOS when not installed', () => {
    stubNav('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5);
    act(() => root.render(<InstallApp />));
    expect(container.textContent).toContain('Para instalar: tocá Compartir y luego "Añadir a pantalla de inicio".');
    expect(install()).toBeUndefined();
  });

  it('renders nothing when already installed', () => {
    stubMatchMedia(true);
    stubNav('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5);
    act(() => root.render(<InstallApp />));
    expect(container.textContent).toBe('');
  });
});
