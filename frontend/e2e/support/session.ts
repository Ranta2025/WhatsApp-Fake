import type { Browser, BrowserContext, Page } from '@playwright/test';
import { storageStatePath, type UserKey } from './users';

export interface Session {
  context: BrowserContext;
  page: Page;
}

// Abre el dashboard con la sesión guardada en el global setup.
export async function openSession(browser: Browser, user: UserKey): Promise<Session> {
  const context = await browser.newContext({
    storageState: storageStatePath(user),
    permissions: ['microphone'],
  });
  const page = await context.newPage();
  await page.goto('/dashboard');
  return { context, page };
}
