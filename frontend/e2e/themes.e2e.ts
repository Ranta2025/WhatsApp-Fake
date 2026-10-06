import { expect, test, type Page } from '@playwright/test';
import { openSession } from './support/session';

const THEME_KEY = 'whatsapp-fake:theme';

const html = (page: Page) => page.locator('html');

async function openThemePicker(page: Page) {
  await page.getByRole('button', { name: 'Abrir ajustes de perfil' }).click();
  const group = page.getByRole('radiogroup', { name: 'Tema' });
  await expect(group).toBeVisible();
  return group;
}

test.describe('Temas', () => {
  test('picking Rosa applies, persists and survives a reload', async ({ browser }) => {
    const { context, page } = await openSession(browser, 'ana');
    try {
      const group = await openThemePicker(page);
      const rosa = group.getByRole('radio', { name: 'Rosa' });
      await rosa.click();

      await expect(html(page)).toHaveAttribute('data-theme', 'rosa');
      await expect(rosa).toHaveAttribute('aria-checked', 'true');
      expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('rosa');

      await page.reload({ waitUntil: 'domcontentloaded' });
      // The bootstrap script in index.html applies it before React mounts.
      await expect(html(page)).toHaveAttribute('data-theme', 'rosa');

      const reopened = await openThemePicker(page);
      await expect(reopened.getByRole('radio', { name: 'Rosa' })).toHaveAttribute('aria-checked', 'true');
    } finally {
      await page.evaluate((k) => localStorage.removeItem(k), THEME_KEY).catch(() => undefined);
      await context.close();
    }
  });

  test('the login page keeps the chosen theme', async ({ browser }) => {
    const { context, page } = await openSession(browser, 'ana');
    let stored: string | null = null;
    try {
      const group = await openThemePicker(page);
      await group.getByRole('radio', { name: 'Rosa' }).click();
      await expect(html(page)).toHaveAttribute('data-theme', 'rosa');
      stored = await page.evaluate((k) => localStorage.getItem(k), THEME_KEY);
      expect(stored).toBe('rosa');
      await page.evaluate((k) => localStorage.removeItem(k), THEME_KEY);
    } finally {
      await context.close();
    }

    // Logged-out visitor on the same device: only the stored preference carries over.
    const guest = await browser.newContext();
    try {
      await guest.addInitScript(
        ([k, v]) => {
          if (v) localStorage.setItem(k as string, v);
        },
        [THEME_KEY, stored] as const,
      );
      const login = await guest.newPage();
      await login.goto('/login', { waitUntil: 'domcontentloaded' });
      await expect(html(login)).toHaveAttribute('data-theme', 'rosa');
    } finally {
      await guest.close();
    }
  });

  test('Automático follows the OS color scheme live', async ({ browser }) => {
    const { context, page } = await openSession(browser, 'ana');
    try {
      const group = await openThemePicker(page);
      await page.emulateMedia({ colorScheme: 'light' });
      await group.getByRole('radio', { name: 'Automático' }).click();
      await expect(html(page)).toHaveAttribute('data-theme', 'light');
      expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('auto');

      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(html(page)).toHaveAttribute('data-theme', 'dark');

      await page.emulateMedia({ colorScheme: 'light' });
      await expect(html(page)).toHaveAttribute('data-theme', 'light');
    } finally {
      await page.evaluate((k) => localStorage.removeItem(k), THEME_KEY).catch(() => undefined);
      await context.close();
    }
  });

  test('a fresh context defaults to dark', async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    } finally {
      await context.close();
    }
  });
});
