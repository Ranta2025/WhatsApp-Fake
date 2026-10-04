import { test, expect, type APIRequestContext, type Browser, type Locator, type Page, type Response } from '@playwright/test';
import { openSession, type Session } from './support/session';
import { storageStatePath, type UserKey } from './support/users';
import { createGroup, phoneOf } from './support/api';
import { openChat, openGroup, sendChatText, uniqueText } from './support/chat';

// Silenciar chats (WP9). La notificación interna de un mensaje nuevo es la notificación nativa
// (showNativeNotification; su sonido es el del sistema). Para observarla, el navegador del
// receptor bloquea el Service Worker (la app cae al `new Notification(...)` directo) y un init
// script sustituye `window.Notification` por un doble con permiso concedido que registra cada
// notificación construida.

interface ShownNotification {
  title: string;
  body: string;
  tag: string;
}

declare global {
  interface Window {
    __e2eNotifications?: ShownNotification[];
  }
}

// Se serializa y se ejecuta en el navegador antes de cualquier script de la página.
function stubNotifications(): void {
  const shown: ShownNotification[] = [];
  window.__e2eNotifications = shown;
  class FakeNotification extends EventTarget {
    static readonly permission: NotificationPermission = 'granted';
    static requestPermission(): Promise<NotificationPermission> {
      return Promise.resolve('granted');
    }
    onclick: ((event: Event) => void) | null = null;
    constructor(title: string, options?: NotificationOptions) {
      super();
      shown.push({ title, body: options?.body ?? '', tag: options?.tag ?? '' });
    }
    close(): void {}
  }
  Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: FakeNotification });
}

// Como openSession (sesión guardada, sin login), pero con las notificaciones observables.
async function openObservedSession(browser: Browser, user: UserKey): Promise<Session> {
  const context = await browser.newContext({
    storageState: storageStatePath(user),
    permissions: ['microphone'],
    serviceWorkers: 'block',
  });
  await context.addInitScript(stubNotifications);
  const page = await context.newPage();
  await page.goto('/dashboard');
  return { context, page };
}

async function notificationBodies(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__e2eNotifications ?? []).map((n) => n.body));
}

// Fila de la barra lateral (la cabecera del chat también contiene el nombre).
function sidebarRow(page: Page, name: string): Locator {
  return page.locator('aside').getByRole('button').filter({ has: page.getByText(name, { exact: true }) });
}

// 🔇 de la fila (role="img" dentro de un <button>: se busca por atributo, no por rol).
function mutedIcon(row: Locator): Locator {
  return row.locator('[aria-label="Silenciado"]');
}

function isMuteCall(method: string): (res: Response) => boolean {
  return (res) => res.request().method() === method && new URL(res.url()).pathname.endsWith('/mute');
}

// "Más opciones" → "Silenciar notificaciones" → duración, en la cabecera del chat o grupo abierto.
async function muteFromMenu(page: Page, duration: '8 horas' | '1 semana' | 'Siempre'): Promise<void> {
  await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Silenciar notificaciones', exact: true }).click();
  const put = page.waitForResponse(isMuteCall('PUT'));
  await page.getByRole('menuitem', { name: duration, exact: true }).click();
  expect((await put).status()).toBe(200);
}

async function unmuteFromMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Más opciones', exact: true }).click();
  const del = page.waitForResponse(isMuteCall('DELETE'));
  await page.getByRole('menuitem', { name: 'Activar notificaciones', exact: true }).click();
  expect((await del).status()).toBe(204);
}

// El silencio persiste entre ejecuciones: cada test empieza y termina sin él (DELETE es idempotente).
async function clearChatMute(request: APIRequestContext, contact: string): Promise<void> {
  const res = await request.delete(`/api/v1/chat/${encodeURIComponent(contact)}/mute`);
  expect(res.status(), `DELETE chat ${contact} mute`).toBe(204);
}

test.describe('silenciar chats', () => {
  test('1:1: silenciado 8 h no notifica pero cuenta no leídos; al activar vuelve a notificar', async ({ browser }) => {
    test.setTimeout(120_000);
    const ana = await openObservedSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    const luisPhone = await phoneOf(luis.context.request);
    try {
      await clearChatMute(ana.context.request, luisPhone);
      await ana.page.reload();
      await openChat(luis.page, 'Ana');

      // Ana silencia el chat con Luis durante 8 horas: aparece el 🔇 en su barra lateral.
      await openChat(ana.page, 'Luis');
      const row = sidebarRow(ana.page, 'Luis');
      await expect(mutedIcon(row)).toHaveCount(0);
      await muteFromMenu(ana.page, '8 horas');
      await expect(mutedIcon(row)).toBeVisible();

      // Con otro chat abierto, el mensaje de Luis queda sin leer: el contador sube igual.
      await openChat(ana.page, 'Marta');
      const silent = uniqueText('silenciado');
      await sendChatText(luis.page, silent);
      await expect(row).toContainText(silent);
      await expect(row.locator('[aria-label="1 mensaje no leído"]')).toHaveText('1');

      // Activar notificaciones: el icono desaparece.
      await openChat(ana.page, 'Luis');
      await unmuteFromMenu(ana.page);
      await expect(mutedIcon(row)).toHaveCount(0);

      // El siguiente mensaje sí notifica. Los mensajes se procesan en orden, así que cuando llega
      // esta notificación la del mensaje silenciado ya habría llegado: nunca se mostró.
      await openChat(ana.page, 'Marta');
      const loud = uniqueText('con aviso');
      await sendChatText(luis.page, loud);
      await expect(row.locator('[aria-label="1 mensaje no leído"]')).toHaveText('1');
      await expect.poll(() => notificationBodies(ana.page)).toContain(loud);
      expect(await notificationBodies(ana.page)).not.toContain(silent);
    } finally {
      try {
        await clearChatMute(ana.context.request, luisPhone);
      } catch (err) {
        // Do not let a cleanup failure replace the original test failure.
        console.warn('mute cleanup failed:', err);
      } finally {
        await ana.context.close();
        await luis.context.close();
      }
    }
  });

  test('grupo: silenciar "Siempre" marca el grupo (también tras recargar) y activar lo desmarca', async ({ browser }) => {
    test.setTimeout(90_000);
    const ana = await openSession(browser, 'ana');
    const marta = await openSession(browser, 'marta');
    try {
      const martaPhone = await phoneOf(marta.context.request);
      const name = uniqueText('silencio grupo');
      await createGroup(ana.context.request, name, [martaPhone]);
      await ana.page.reload();
      await openGroup(ana.page, name);

      const row = sidebarRow(ana.page, name);
      await expect(mutedIcon(row)).toHaveCount(0);
      await muteFromMenu(ana.page, 'Siempre');
      await expect(mutedIcon(row)).toBeVisible();

      // Lo informa el servidor en GET /api/v1/group (Muted sin MutedUntil = "Siempre").
      await ana.page.reload();
      await openGroup(ana.page, name);
      await expect(mutedIcon(row)).toBeVisible();

      await unmuteFromMenu(ana.page);
      await expect(mutedIcon(row)).toHaveCount(0);
      await ana.page.reload();
      await openGroup(ana.page, name);
      await expect(mutedIcon(row)).toHaveCount(0);
    } finally {
      await ana.context.close();
      await marta.context.close();
    }
  });
});
