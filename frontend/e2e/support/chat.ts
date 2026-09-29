import { expect, type Locator, type Page } from '@playwright/test';

// PNG válido de 1x1 píxel: evita versionar binarios.
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Texto único por ejecución: el estado de la BD se comparte entre specs y ejecuciones.
export function uniqueText(label: string): string {
  return `e2e ${label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export async function openChat(page: Page, contactName: string): Promise<void> {
  await page.getByText(contactName, { exact: true }).first().click();
  await expect(page.getByPlaceholder('Escribe un mensaje...')).toBeVisible();
}

export async function openGroup(page: Page, groupName = 'Equipo demo'): Promise<void> {
  await page.getByRole('tab', { name: 'Grupos' }).click();
  await page.getByText(groupName).first().click();
  await expect(page.getByPlaceholder('Escribe un mensaje en el grupo...')).toBeVisible();
}

export async function sendChatText(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder('Escribe un mensaje...');
  await input.fill(text);
  await input.press('Enter');
}

export async function sendGroupText(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder('Escribe un mensaje en el grupo...');
  await input.fill(text);
  await input.press('Enter');
}

export async function attachImage(page: Page): Promise<void> {
  await page.getByLabel('Adjuntar archivo').click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'e2e.png', mimeType: 'image/png', buffer: PNG_1X1 });
}

export async function recordVoiceNote(page: Page): Promise<void> {
  await page.getByLabel('Grabar nota de voz').click();
  // El micrófono falso necesita un instante para producir audio.
  await page.waitForTimeout(2000);
  await page.getByLabel('Detener y enviar nota de voz').click();
}

export function storageImages(page: Page): Locator {
  return page.locator('img[src*="/storage/"]');
}

// Burbuja de mensaje con ese texto (excluye la vista previa del texto en la barra lateral).
export function messageText(page: Page, text: string): Locator {
  return page.locator('.whitespace-pre-wrap').getByText(text, { exact: true });
}
