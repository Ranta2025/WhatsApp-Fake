import { useCallback, useSyncExternalStore } from 'react';

// Non-standard (Chromium) event fired when the app is installable.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface IosNavigator extends Navigator {
  standalone?: boolean;
}

interface InstallState {
  readonly deferred: BeforeInstallPromptEvent | null;
  readonly installed: boolean;
}

// Module-level capture: `beforeinstallprompt` fires early (often before the
// profile modal mounts) and only once, so the listeners are registered at
// import time and the event outlives any component mount.
let state: InstallState = { deferred: null, installed: false };
const listeners = new Set<() => void>();

function setState(next: InstallState): void {
  state = next;
  listeners.forEach((l) => l());
}

function onBeforeInstallPrompt(event: Event): void {
  event.preventDefault();
  setState({ ...state, deferred: event as BeforeInstallPromptEvent });
}

function onAppInstalled(): void {
  setState({ deferred: null, installed: true });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  window.addEventListener('appinstalled', onAppInstalled);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): InstallState => state;

function isStandalone(): boolean {
  const mql = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null;
  return Boolean(mql?.matches) || (navigator as IosNavigator).standalone === true;
}

function isIosDevice(): boolean {
  const { userAgent, platform, maxTouchPoints } = navigator;
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

/** Test helper: drops the captured event and the installed flag. */
export function resetInstallPromptForTests(): void {
  setState({ deferred: null, installed: false });
}

export function useInstallPrompt() {
  const { deferred, installed } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const promptInstall = useCallback(async (): Promise<void> => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch (error) {
      console.error('Install prompt failed', error);
    } finally {
      // The event is single-use: clear it whatever the outcome.
      setState({ ...state, deferred: null });
    }
  }, [deferred]);

  const isInstalled = installed || isStandalone();
  return {
    canInstall: deferred !== null,
    promptInstall,
    isInstalled,
    isIos: isIosDevice() && !isInstalled,
  };
}
