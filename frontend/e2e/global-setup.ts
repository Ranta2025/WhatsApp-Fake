import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import { AUTH_DIR, DEMO_PASSWORD, USERS, storageStatePath, type UserKey } from './support/users';

// Inicia sesión una sola vez por usuario demo y guarda el storageState:
// el login está limitado a 20 intentos por minuto y por IP.
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost';
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const key of Object.keys(USERS) as UserKey[]) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.goto('/login');
      await page.locator('input[type="text"]').fill(USERS[key].username);
      await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await page.waitForURL('**/dashboard');
      await context.storageState({ path: storageStatePath(key) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
