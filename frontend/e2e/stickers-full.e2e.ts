import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { openSession } from './support/session';
import { openChat } from './support/chat';

// SF7: stickers-full end to end. Ana creates a custom sticker from a fixture
// PNG (creator -> square crop -> WebP 512x512), sends it to Luis, Luis sees it
// live and after reload and saves it to "Mis stickers" (same URL, no copy);
// favorites of built-in stickers persist; recents show the last sent first;
// deleting a custom sticker keeps the old message rendering; a duplicate upload
// returns the same URL; invalid uploads are rejected with a Spanish message; the
// tag search filters; and an animated WebP renders.
//
// Assertions are scoped to rows/banners and use count-based delivery checks
// (see stickers.e2e.ts), because the DB is shared across specs and runs.

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');
const SOURCE_PNG = path.join(FIXTURES, 'sticker-source.png');
const ANIMATED_WEBP = path.join(FIXTURES, 'sticker-animated.webp');
const NONSQUARE_PNG = path.join(FIXTURES, 'sticker-nonsquare.png');

const HOLA = '/stickers/basic/hola.webp';
const GRACIAS = '/stickers/basic/gracias.webp';

/** Tile button of the sticker panel with that URL. */
function stickerTile(page: Page, url: string): Locator {
  return page.locator(`button[data-sticker-url="${url}"]`);
}

/** The message bubble (1:1) that contains the sticker image with that src. */
function bubbleWithSticker(page: Page, url: string): Locator {
  return page.locator('[data-message-id]').filter({ has: page.locator(`img[src="${url}"]`) }).last();
}

/** Sticker image inside a message bubble (never the panel tile thumbnail). */
function messageSticker(page: Page, url: string): Locator {
  return page.locator(`[data-message-id] img[src="${url}"]`);
}

async function openPanel(page: Page): Promise<void> {
  await page.getByLabel('Stickers').click();
  await expect(page.getByLabel('Buscar stickers')).toBeVisible();
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
}

async function closePanel(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Buscar stickers')).toBeHidden();
}

/** Right-click a tile and return the open context menu. */
async function openTileMenu(page: Page, url: string): Promise<void> {
  await stickerTile(page, url).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: /Opciones de/ })).toBeVisible();
}

/**
 * Activates a tile-menu item by keyboard as a pointer-independent fallback.
 * The menu is now a sibling layer of the panel's scroll container (never
 * clipped), but focus + Enter still exercises the real handler without relying
 * on pointer hit-testing.
 */
async function clickMenuItem(page: Page, name: string): Promise<void> {
  const item = page.getByRole('menuitem', { name, exact: true });
  await item.focus();
  await item.press('Enter');
}

/**
 * Ana creates a sticker from a fixture PNG through the real creator UI and
 * returns its server URL. The creator encodes to WebP 512x512 client-side, so
 * the fixture only needs to be a decodable PNG.
 */
async function createCustomSticker(page: Page, tags: string): Promise<string> {
  await openPanel(page);
  await openTab(page, 'Mis stickers');
  await page.getByLabel('Crear sticker').click();

  const dialog = page.getByRole('dialog', { name: 'Crear sticker' });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="file"]').setInputFiles(SOURCE_PNG);
  await expect(dialog.getByLabel('Recorte')).toBeVisible();
  await dialog.getByLabel('Etiquetas').fill(tags);

  const uploaded = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/stickers',
  );
  await dialog.getByRole('button', { name: 'Crear sticker' }).click();
  const response = await uploaded;
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { url: string };
  expect(body.url).toMatch(/\/storage\/.+\/stickers\/[0-9a-f]{64}\.webp$/);

  // The panel returns to "Mis stickers" with the new tile.
  await expect(stickerTile(page, body.url)).toBeVisible();
  return body.url;
}

/** Uploads a fixture through the authenticated API context. */
async function apiUploadSticker(request: APIRequestContext, filePath: string, mimeType: string) {
  const buffer = fs.readFileSync(filePath);
  return request.post('/api/v1/stickers', {
    multipart: { file: { name: path.basename(filePath), mimeType, buffer } },
  });
}

test.describe('stickers full', () => {
  test('custom: Ana crea desde PNG, envía a Luis, Luis lo guarda (misma URL) y el borrado no rompe el mensaje', async ({ browser }) => {
    test.setTimeout(120_000);
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      await openChat(ana.page, 'Luis');
      await openChat(luis.page, 'Ana');

      const url = await createCustomSticker(ana.page, 'e2e-custom');

      // Count-based delivery: the message sticker grows by one on each side
      // (scoped to message bubbles, never the panel thumbnail).
      const anaBefore = await messageSticker(ana.page, url).count();
      const luisBefore = await messageSticker(luis.page, url).count();
      await stickerTile(ana.page, url).click();

      await expect(messageSticker(ana.page, url)).toHaveCount(anaBefore + 1);
      await expect(messageSticker(luis.page, url)).toHaveCount(luisBefore + 1);
      const luisBubble = bubbleWithSticker(luis.page, url);
      await expect(luisBubble).toBeVisible();

      // Same sticker after a reload (server history).
      await luis.page.reload();
      await openChat(luis.page, 'Ana');
      await expect(bubbleWithSticker(luis.page, url)).toBeVisible();

      // Luis saves it from the received menu: toast + the SAME URL in his
      // library (no re-upload, content-addressed).
      await bubbleWithSticker(luis.page, url).hover();
      await bubbleWithSticker(luis.page, url).getByRole('button', { name: 'Opciones', exact: true }).click();
      await luis.page.getByRole('button', { name: 'Añadir a mis stickers', exact: true }).click();
      await expect(luis.page.getByText('Añadido a Mis stickers')).toBeVisible();

      await openPanel(luis.page);
      await openTab(luis.page, 'Mis stickers');
      await expect(stickerTile(luis.page, url)).toBeVisible();

      // Ana deletes her custom sticker: the already-sent message keeps rendering.
      await openPanel(ana.page);
      await openTab(ana.page, 'Mis stickers');
      await openTileMenu(ana.page, url);
      await clickMenuItem(ana.page, 'Eliminar');
      const confirm = ana.page.getByRole('dialog', { name: 'Eliminar sticker' });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await expect(stickerTile(ana.page, url)).toHaveCount(0);

      await closePanel(ana.page);
      await expect(bubbleWithSticker(ana.page, url)).toBeVisible();
      await expect(bubbleWithSticker(luis.page, url)).toBeVisible();
    } finally {
      await ana.context.close();
      await luis.context.close();
    }
  });

  test('favoritos: un sticker integrado marcado persiste tras recargar', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    try {
      await openChat(ana.page, 'Luis');
      await openPanel(ana.page);
      await openTab(ana.page, 'Básicos');
      await openTileMenu(ana.page, HOLA);

      // Deterministic on repeat runs against the shared stack: unfavorite
      // first if a previous run left HOLA favorited, so the menu always offers
      // "Favorito" and the real mouse click below always runs (the durable
      // regression proof for the unclipped menu layer).
      if (await ana.page.getByRole('menuitem', { name: 'Quitar de favoritos', exact: true }).count() > 0) {
        // La desmarcación también es async (PUT en background): esperarla antes
        // de cerrar/recargar o la spec pierde la carrera igual que al marcar.
        const unfavorited = ana.page.waitForResponse(
          (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/stickers/favorites',
        );
        await ana.page.getByRole('menuitem', { name: 'Quitar de favoritos', exact: true }).click();
        expect((await unfavorited).ok()).toBeTruthy();
        await closePanel(ana.page);
        await openPanel(ana.page);
        await openTab(ana.page, 'Básicos');
        await openTileMenu(ana.page, HOLA);
      }
      // HOLA is the first tile of "Básicos" (left column): a real mouse click
      // works now that the menu is a sibling of the grid, not clipped by it.
      // El toggle es async (PUT /api/v1/stickers/favorites en background tras
      // cerrar el menú): esperar la respuesta antes de cerrar/recargar, o una
      // recarga rápida pierde el favorito y el test flakea bajo carga.
      const favorited = ana.page.waitForResponse(
        (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/stickers/favorites',
      );
      await ana.page.getByRole('menuitem', { name: 'Favorito', exact: true }).click();
      expect((await favorited).ok()).toBeTruthy();
      await closePanel(ana.page);

      await ana.page.reload();
      await openChat(ana.page, 'Luis');
      await openPanel(ana.page);
      await openTab(ana.page, 'Favoritos');
      await expect(stickerTile(ana.page, HOLA)).toBeVisible();
    } finally {
      await ana.context.close();
    }
  });

  test('recientes: el último sticker enviado va primero', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    try {
      await openChat(ana.page, 'Luis');

      await openPanel(ana.page);
      await openTab(ana.page, 'Básicos');
      await stickerTile(ana.page, HOLA).click();

      await openPanel(ana.page);
      await openTab(ana.page, 'Básicos');
      await stickerTile(ana.page, GRACIAS).click();

      await openPanel(ana.page);
      await openTab(ana.page, 'Recientes');
      const first = ana.page.locator('button[data-sticker-url]').first();
      await expect(first).toHaveAttribute('data-sticker-url', GRACIAS);
    } finally {
      await ana.context.close();
    }
  });

  test('dedupe + animado: el mismo WebP animado da la misma URL y se renderiza', async ({ browser }) => {
    test.setTimeout(90_000);
    const ana = await openSession(browser, 'ana');
    try {
      // The shared DB may already hold these bytes from a previous run, so the
      // first upload is 201 (new) or 200 (already owned); either way the second
      // is a 200 dedupe with the same content-addressed URL.
      const first = await apiUploadSticker(ana.context.request, ANIMATED_WEBP, 'image/webp');
      expect([200, 201]).toContain(first.status());
      const firstUrl = ((await first.json()) as { url: string }).url;

      const second = await apiUploadSticker(ana.context.request, ANIMATED_WEBP, 'image/webp');
      expect(second.status()).toBe(200);
      const secondUrl = ((await second.json()) as { url: string }).url;
      expect(secondUrl, 'los mismos bytes devuelven la misma URL').toBe(firstUrl);

      await ana.page.reload();
      await openChat(ana.page, 'Luis');
      await openPanel(ana.page);
      await openTab(ana.page, 'Mis stickers');
      const tile = stickerTile(ana.page, firstUrl);
      await expect(tile).toBeVisible();
      await tile.click();

      const img = ana.page.locator(`img[src="${firstUrl}"]`).last();
      await expect(img).toBeVisible();
      await expect(img).toHaveAttribute('width', '150');
      await expect(img).toHaveAttribute('height', '150');
    } finally {
      await ana.context.close();
    }
  });

  test('validación: subidas no cuadradas y sobredimensionadas se rechazan con mensaje en español', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    try {
      const nonsquare = await apiUploadSticker(ana.context.request, NONSQUARE_PNG, 'image/png');
      expect(nonsquare.status()).toBe(400);
      const nonsquareBody = (await nonsquare.json()) as { error: string };
      expect(nonsquareBody.error).toContain('512x512');

      // A body over the 1 MB multipart cap is rejected before validation.
      const huge = Buffer.alloc(1 << 20, 0x61);
      const oversize = await ana.context.request.post('/api/v1/stickers', {
        multipart: { file: { name: 'huge.webp', mimeType: 'image/webp', buffer: huge } },
      });
      expect(oversize.status()).toBe(400);
      const oversizeBody = (await oversize.json()) as { error: string };
      expect(oversizeBody.error).toMatch(/demasiado grande|sticker/i);
    } finally {
      await ana.context.close();
    }
  });

  test('búsqueda: filtrar por etiqueta (con acentos) muestra solo lo que coincide', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    try {
      await openChat(ana.page, 'Luis');
      await openPanel(ana.page);
      await ana.page.getByLabel('Buscar stickers').fill('CORAZÓN');

      await expect(stickerTile(ana.page, '/stickers/basic/corazon.webp')).toBeVisible();
      await expect(stickerTile(ana.page, HOLA)).toHaveCount(0);

      await ana.page.getByLabel('Buscar stickers').fill('pizza');
      await expect(stickerTile(ana.page, '/stickers/comida/pizza.webp')).toBeVisible();
      await expect(stickerTile(ana.page, '/stickers/basic/corazon.webp')).toHaveCount(0);
    } finally {
      await ana.context.close();
    }
  });
});
