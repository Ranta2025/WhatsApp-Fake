// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import UpdatePrompt from './UpdatePrompt';
import { markNeedRefresh, resetUpdateStore, setUpdater } from './updateStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetUpdateStore();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (label: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);

describe('UpdatePrompt', () => {
  it('renders nothing while no update is pending', () => {
    act(() => root.render(<UpdatePrompt />));
    expect(container.textContent).toBe('');
  });

  it('shows the prompt when the store flips to needRefresh', () => {
    act(() => root.render(<UpdatePrompt />));
    act(() => markNeedRefresh());
    expect(container.textContent).toContain('Nueva versión disponible');
  });

  it('"Actualizar" calls updateSW(true)', async () => {
    const updateSW = vi.fn().mockResolvedValue(undefined);
    setUpdater(updateSW);
    act(() => root.render(<UpdatePrompt />));
    act(() => markNeedRefresh());
    await act(async () => {
      button('Actualizar')!.click();
    });
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('"Más tarde" hides the prompt without updating', () => {
    const updateSW = vi.fn().mockResolvedValue(undefined);
    setUpdater(updateSW);
    act(() => root.render(<UpdatePrompt />));
    act(() => markNeedRefresh());
    act(() => button('Más tarde')!.click());
    expect(container.textContent).toBe('');
    expect(updateSW).not.toHaveBeenCalled();
  });
});
