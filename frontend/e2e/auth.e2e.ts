import { test, expect } from '@playwright/test';
import { DEMO_PASSWORD, USERS } from './support/users';

// Estos specs prueban el formulario de login, así que no usan el storageState.
test.describe('login', () => {
  test('credenciales válidas llevan al dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"]').fill(USERS.ana.username);
    await page.locator('input[type="password"]').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('tab', { name: 'Grupos' })).toBeVisible();
  });

  test('contraseña incorrecta muestra un error y no entra', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="text"]').fill(USERS.ana.username);
    await page.locator('input[type="password"]').fill('Incorrecta123!');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
