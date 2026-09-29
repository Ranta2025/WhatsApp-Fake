import { test, expect } from '@playwright/test';
import { openSession } from './support/session';

test('la sesión guardada de Ana abre el dashboard', async ({ browser }) => {
  const { context, page } = await openSession(browser, 'ana');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('tab', { name: 'Grupos' })).toBeVisible();
  await context.close();
});
