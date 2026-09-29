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
  // Espera al estado observable de grabación (aparece el botón de detener) y deja una
  // duración mínima para que el micrófono falso produzca un blob no vacío.
  const stop = page.getByLabel('Detener y enviar nota de voz');
  await expect(stop).toBeVisible();
  await page.waitForTimeout(500);
  await stop.click();
}

interface UploadResponse {
  url: string;
}

function isUploadResponse(value: unknown): value is UploadResponse {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string';
}

// Ejecuta la acción y devuelve la URL de la subida (POST /api/v1/upload) que provocó.
export async function uploadedUrlFrom(page: Page, action: () => Promise<void>): Promise<string> {
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/upload',
  );
  await action();
  const res = await response;
  expect(res.ok()).toBeTruthy();
  const body: unknown = await res.json();
  if (!isUploadResponse(body)) throw new Error('POST /api/v1/upload sin "url"');
  return body.url;
}

// Burbuja de mensaje con ese texto (excluye la vista previa del texto en la barra lateral).
export function messageText(page: Page, text: string): Locator {
  return messageBubbles(page).getByText(text, { exact: true });
}

export function messageBubbles(page: Page): Locator {
  return page.locator('.whitespace-pre-wrap');
}

// Burbuja de mensaje de grupo con ese texto (el grupo usa otro marcado que el chat 1:1).
export function groupMessageText(page: Page, text: string): Locator {
  return page.locator('div.rounded-2xl.shadow-sm').getByText(text, { exact: true });
}

// Burbuja completa de un mensaje de grupo (contiene texto, hora, ticks y botón de opciones).
export function groupBubble(page: Page, text: string): Locator {
  return page.locator('div.rounded-2xl.shadow-sm').filter({ has: page.getByText(text, { exact: true }) });
}

export type TickLabel = 'Enviado' | 'Entregado' | 'Visto';

// Tick de estado de un mensaje propio de grupo (svg con role="img" y aria-label del estado).
export function groupTick(page: Page, text: string, label: TickLabel): Locator {
  return groupBubble(page, text).getByRole('img', { name: label, exact: true });
}

// Abre el diálogo "Info" (quién lo leyó / recibió) de un mensaje propio de grupo.
export async function openGroupMessageInfo(page: Page, text: string): Promise<Locator> {
  const bubble = groupBubble(page, text);
  await bubble.hover();
  await bubble.getByRole('button', { name: 'Opciones' }).click();
  await page.getByRole('button', { name: 'Info', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Info del mensaje' });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Sección ("Leído por", "Entregado a", ...) del diálogo Info.
export function infoSection(dialog: Locator, heading: string): Locator {
  return dialog.locator('section').filter({ has: dialog.page().getByRole('heading', { name: heading, exact: true }) });
}

// Burbuja (1:1 o grupo) que contiene ese texto; con la búsqueda abierta el texto se parte en <mark>,
// por eso se filtra por el texto concatenado de la burbuja (que lleva data-message-id).
export function bubbleWithText(page: Page, text: string | RegExp): Locator {
  return page.locator('[data-message-id]').filter({ hasText: text });
}

export async function openChatSearch(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Buscar en el chat' }).click();
  const input = page.getByPlaceholder('Buscar', { exact: true });
  await expect(input).toBeFocused();
  return input;
}

export const RETURN_TO_LATEST = 'Ir a los mensajes recientes';
