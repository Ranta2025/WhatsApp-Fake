// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useInstallPrompt, resetInstallPromptForTests } from './useInstallPrompt';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Result = ReturnType<typeof useInstallPrompt>;
let result: Result;

function Probe() {
  const value = useInstallPrompt();
  useEffect(() => {
    result = value;
  });
  return null;
}

function stubMatchMedia(standalone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function fakePromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  return { event, prompt };
}

let container: HTMLDivElement;
let root: Root;

const mount = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Probe />));
};

beforeEach(() => {
  resetInstallPromptForTests();
  stubMatchMedia(false);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('useInstallPrompt', () => {
  it('cannot install before the browser fires beforeinstallprompt', () => {
    mount();
    expect(result.canInstall).toBe(false);
    expect(result.isInstalled).toBe(false);
  });

  it('captures beforeinstallprompt, prevents the default and enables install', () => {
    mount();
    const { event } = fakePromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(result.canInstall).toBe(true);
  });

  it('keeps the event captured before the component mounted', () => {
    const { event } = fakePromptEvent();
    window.dispatchEvent(event);
    mount();
    expect(result.canInstall).toBe(true);
  });

  it('promptInstall calls prompt(), awaits the choice and clears the event', async () => {
    mount();
    const { event, prompt } = fakePromptEvent();
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      await result.promptInstall();
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(result.canInstall).toBe(false);
  });

  it('promptInstall resolves and clears the event when prompt() rejects', async () => {
    mount();
    const { event, prompt } = fakePromptEvent();
    prompt.mockRejectedValue(new DOMException('already prompted', 'InvalidStateError'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      window.dispatchEvent(event);
    });
    await act(async () => {
      await expect(result.promptInstall()).resolves.toBeUndefined();
    });
    expect(result.canInstall).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('is installed when running standalone', () => {
    stubMatchMedia(true);
    mount();
    expect(result.isInstalled).toBe(true);
  });

  it('is installed when navigator.standalone is true (iOS)', () => {
    vi.stubGlobal('navigator', { ...navigator, standalone: true, userAgent: 'x', maxTouchPoints: 0 });
    mount();
    expect(result.isInstalled).toBe(true);
  });

  it('becomes installed after appinstalled and drops the stored event', () => {
    mount();
    act(() => {
      window.dispatchEvent(fakePromptEvent().event);
    });
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.isInstalled).toBe(true);
    expect(result.canInstall).toBe(false);
  });

  it('detects iOS Safari from the iPhone user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 });
    mount();
    expect(result.isIos).toBe(true);
  });

  it('detects iPadOS (MacIntel with touch)', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 });
    mount();
    expect(result.isIos).toBe(true);
  });

  it('is not iOS on desktop and not iOS when already standalone', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux)', platform: 'Linux x86_64', maxTouchPoints: 0 });
    mount();
    expect(result.isIos).toBe(false);
    act(() => root.unmount());
    container.remove();
    vi.stubGlobal('navigator', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5, standalone: true });
    mount();
    expect(result.isIos).toBe(false);
  });

  it('removes its subscription on unmount', () => {
    mount();
    act(() => root.unmount());
    const { event } = fakePromptEvent();
    expect(() => window.dispatchEvent(event)).not.toThrow();
    root = createRoot(container);
  });
});
