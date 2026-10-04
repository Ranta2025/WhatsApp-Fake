import { test, expect, type Page } from '@playwright/test';
import { openSession } from './support/session';
import { psql } from './support/db';
import {
  groupMessageText,
  messageText,
  openChat,
  openGroup,
  sendChatText,
  sendGroupText,
  uniqueText,
} from './support/chat';

const GROUP = 'Equipo demo';

function pending(page: Page, text: string) {
  return page.locator('[data-outbox-client-id]').filter({ hasText: text });
}

function banner(page: Page) {
  return page.getByRole('status').filter({ hasText: 'Sin conexión' });
}

async function outboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('whatsapp-fake-outbox');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('entries')) {
            db.close();
            resolve(0);
            return;
          }
          const req = db.transaction('entries', 'readonly').objectStore('entries').count();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            db.close();
            resolve(req.result);
          };
        };
      }),
  );
}

async function openDirect(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Chats' }).click();
  await openChat(page, name);
}

async function waitForControl(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state ?? null), {
      timeout: 20_000,
    })
    .toBe('activated');
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test.describe('envío de texto sin conexión', () => {
  test('los textos se encolan, sobreviven a una recarga y se entregan una sola vez al reconectar', async ({ browser }) => {
    test.setTimeout(120_000);
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      const chatText = uniqueText('offline 1a1');
      const groupText = uniqueText('offline grupo');

      await expect(ana.page.getByRole('tab', { name: 'Estados' })).toBeVisible();
      await waitForControl(ana.page);
      await openDirect(luis.page, 'Ana');

      await openDirect(ana.page, 'Luis');
      await ana.context.setOffline(true);
      await expect(banner(ana.page)).toBeVisible();

      await sendChatText(ana.page, chatText);
      await expect(pending(ana.page, chatText)).toHaveAttribute('data-outbox-state', 'pending');
      await expect(pending(ana.page, chatText).getByTestId('message-pending')).toBeVisible();

      await openGroup(ana.page, GROUP);
      await sendGroupText(ana.page, groupText);
      await expect(pending(ana.page, groupText)).toHaveAttribute('data-outbox-state', 'pending');
      await expect(pending(ana.page, groupText).getByTestId('message-pending')).toBeVisible();
      expect(await outboxCount(ana.page)).toBe(2);

      // Recarga sin conexión: el shell sale del service worker, la sesión sigue
      // abierta (perfil cacheado) y el outbox conserva las dos entradas. La lista
      // de chats no se cachea offline, así que no se reabren las conversaciones.
      await ana.page.reload();
      await expect(banner(ana.page)).toBeVisible();
      await expect(ana.page.getByRole('tab', { name: 'Chats' })).toBeVisible();
      expect(new URL(ana.page.url()).pathname).toBe('/dashboard');
      expect(await outboxCount(ana.page)).toBe(2);

      await ana.context.setOffline(false);
      await expect(banner(ana.page)).toBeHidden({ timeout: 30_000 });
      await openGroup(ana.page, GROUP);
      await expect(pending(ana.page, groupText)).toHaveCount(0, { timeout: 30_000 });
      await expect(groupMessageText(ana.page, groupText)).toHaveCount(1);
      await openDirect(ana.page, 'Luis');
      await expect(pending(ana.page, chatText)).toHaveCount(0, { timeout: 30_000 });
      await expect(messageText(ana.page, chatText)).toHaveCount(1);
      await expect.poll(() => outboxCount(ana.page), { timeout: 30_000 }).toBe(0);

      await expect(messageText(luis.page, chatText)).toHaveCount(1, { timeout: 30_000 });
      await openGroup(luis.page, GROUP);
      await expect(groupMessageText(luis.page, groupText)).toHaveCount(1, { timeout: 30_000 });
      // Margen para detectar una entrega duplicada tardía.
      await ana.page.waitForTimeout(4_000);
      await expect(groupMessageText(luis.page, groupText)).toHaveCount(1);
      await openDirect(luis.page, 'Ana');
      await expect(messageText(luis.page, chatText)).toHaveCount(1);

      expect(psql(`SELECT count(*) FROM messages WHERE message = '${chatText}'`)).toBe('1');
      expect(psql(`SELECT count(*) FROM group_messages WHERE message = '${groupText}'`)).toBe('1');

      // Recarga en línea: el historial no duplica lo que antes estaba en el outbox.
      await ana.page.reload();
      await openDirect(ana.page, 'Luis');
      await expect(messageText(ana.page, chatText)).toHaveCount(1);
      await openGroup(ana.page, GROUP);
      await expect(groupMessageText(ana.page, groupText)).toHaveCount(1);
    } finally {
      await ana.context.close();
      await luis.context.close();
    }
  });
});
