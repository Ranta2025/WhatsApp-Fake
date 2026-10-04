import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { openSession } from './support/session';

// Web Push: Playwright no puede recibir un push real (Chromium headless no tiene
// ruta a FCM), así que se cubre el contrato REST y la visibilidad de los ajustes.
// El stack local no trae claves VAPID: por defecto `enabled` es false y corre la
// rama "deshabilitado"; con claves en `.env` corre la rama "habilitado".

const CONFIG = '/api/v1/push/config';
const SUBSCRIBE = '/api/v1/push/subscribe';
const PREVIEW = '/api/v1/push/preview';

interface PushConfig {
  enabled: boolean;
  publicKey: string;
  preview: boolean;
}

function isPushConfig(value: unknown): value is PushConfig {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as { enabled?: unknown; publicKey?: unknown; preview?: unknown };
  return typeof c.enabled === 'boolean' && typeof c.publicKey === 'string' && typeof c.preview === 'boolean';
}

async function readPushConfig(request: APIRequestContext): Promise<PushConfig> {
  const res = await request.get(CONFIG);
  expect(res.status(), `GET ${CONFIG}`).toBe(200);
  const body: unknown = await res.json();
  if (!isPushConfig(body)) throw new Error(`GET ${CONFIG} sin {enabled, publicKey, preview}`);
  return body;
}

// Bytes en base64url sin relleno (formato de PushSubscription.toJSON()).
function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

// Suscripción bien formada con un endpoint ficticio de FCM (pasa la allowlist SSRF).
const FAKE_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-fake';
const p256dh = new Uint8Array(65).fill(7);
p256dh[0] = 0x04; // punto P-256 sin comprimir
const FAKE_SUBSCRIPTION = {
  endpoint: FAKE_ENDPOINT,
  keys: { p256dh: base64url(p256dh), auth: base64url(new Uint8Array(16).fill(9)) },
};

// Abre "Editar Perfil" y espera a que PushSettings haya consultado push/config.
async function openProfileModal(page: Page): Promise<void> {
  const configLoaded = page.waitForResponse((res) => new URL(res.url()).pathname === CONFIG);
  await page.getByRole('button', { name: 'Abrir ajustes de perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Editar Perfil' })).toBeVisible();
  expect((await configLoaded).status()).toBe(200);
}

test.describe('Web Push', () => {
  test('push/config cumple el contrato y las rutas push exigen sesión', async ({ browser, request }) => {
    const ana = await openSession(browser, 'ana');
    try {
      const cfg = await readPushConfig(ana.page.request);
      if (cfg.enabled) expect(cfg.publicKey.length).toBeGreaterThan(0);
      else expect(cfg.publicKey).toBe('');
    } finally {
      await ana.context.close();
    }

    // `request` no lleva storageState: peticiones sin cookie de sesión.
    expect((await request.get(CONFIG)).status()).toBe(401);
    expect((await request.post(SUBSCRIBE, { data: FAKE_SUBSCRIPTION })).status()).toBe(401);
    expect((await request.delete(SUBSCRIBE, { data: { endpoint: FAKE_ENDPOINT } })).status()).toBe(401);
    expect((await request.put(PREVIEW, { data: { preview: false } })).status()).toBe(401);
  });

  test('sin claves VAPID no hay ajustes push y subscribe responde 404', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    try {
      const cfg = await readPushConfig(ana.page.request);
      test.skip(cfg.enabled, 'push habilitado (hay claves VAPID): se cubre en la rama "habilitado"');

      await openProfileModal(ana.page);
      await expect(ana.page.getByRole('switch', { name: 'Notificaciones push' })).toHaveCount(0);
      await expect(ana.page.getByRole('switch', { name: 'Mostrar vista previa' })).toHaveCount(0);

      expect((await ana.page.request.post(SUBSCRIBE, { data: FAKE_SUBSCRIPTION })).status()).toBe(404);
      // La baja es idempotente incluso con el push deshabilitado.
      expect((await ana.page.request.delete(SUBSCRIBE, { data: { endpoint: FAKE_ENDPOINT } })).status()).toBe(204);
    } finally {
      await ana.context.close();
    }
  });

  test('con claves VAPID se muestran los ajustes y el ciclo de suscripción funciona', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const api = ana.page.request;
    try {
      const cfg = await readPushConfig(api);
      test.skip(!cfg.enabled, 'push deshabilitado (sin claves VAPID en el stack local)');

      await ana.context.grantPermissions(['notifications']);
      await openProfileModal(ana.page);
      await expect(ana.page.getByRole('switch', { name: 'Notificaciones push' })).toBeVisible();
      await expect(ana.page.getByRole('switch', { name: 'Mostrar vista previa' })).toBeVisible();

      expect((await api.post(SUBSCRIBE, { data: FAKE_SUBSCRIPTION })).status()).toBe(201);
      expect((await api.post(SUBSCRIBE, { data: FAKE_SUBSCRIPTION })).status()).toBe(200);

      expect((await api.put(PREVIEW, { data: { preview: false } })).status()).toBe(204);
      expect((await readPushConfig(api)).preview).toBe(false);
      expect((await api.put(PREVIEW, { data: { preview: true } })).status()).toBe(204);
      expect((await readPushConfig(api)).preview).toBe(true);

      expect((await api.delete(SUBSCRIBE, { data: { endpoint: FAKE_ENDPOINT } })).status()).toBe(204);
      expect((await api.delete(SUBSCRIBE, { data: { endpoint: FAKE_ENDPOINT } })).status()).toBe(204);
    } finally {
      // Limpieza best-effort: no dejar el endpoint ficticio ni la vista previa desactivada.
      await api.delete(SUBSCRIBE, { data: { endpoint: FAKE_ENDPOINT } }).catch(() => undefined);
      await api.put(PREVIEW, { data: { preview: true } }).catch(() => undefined);
      await ana.context.close();
    }
  });
});
