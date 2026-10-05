import { test, expect, type Locator, type Page } from '@playwright/test';
import { openSession } from './support/session';
import { createGroup, phoneOf } from './support/api';
import { bubbleWithText, openChat, openGroup, sendChatText, uniqueText } from './support/chat';
import { setExpiry } from './support/db';

// SB5: built-in stickers end to end. A sticker is a bare 150x150 image (no
// bubble background), renders live and after reload, keeps reactions/replies
// working and expires in a disappearing chat like any other message.

// Alt of the first sticker of the basic pack (features/stickers/builtinPack.ts).
const HOLA = 'Sticker con la palabra Hola';
const OK = 'Sticker con la señal OK';

function stickerImage(page: Page, alt: string): Locator {
  return page.locator(`img[alt="${alt}"]`);
}

/** Newest bubble (1:1 or group) that contains a sticker image with that alt. */
function stickerBubble(page: Page, alt: string): Locator {
  return page.locator('[data-message-id]').filter({ has: page.locator(`img[alt="${alt}"]`) }).last();
}

async function sendSticker(page: Page, alt: string): Promise<void> {
  await page.getByLabel('Stickers').click();
  await page.getByRole('button', { name: alt, exact: true }).click();
}

/** A sticker must be a 150x150 image whose bubble carries no background. */
async function expectBareSticker(img: Locator): Promise<void> {
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('width', '150');
  await expect(img).toHaveAttribute('height', '150');
  const box = await img.boundingBox();
  expect(box?.width).toBe(150);
  expect(box?.height).toBe(150);
  const parentClass = await img.evaluate((el) => el.parentElement?.className ?? '');
  expect(parentClass).not.toContain('bg-slate');
  expect(parentClass).not.toContain('bg-indigo');
}

async function react(page: Page, bubble: Locator, emoji: string): Promise<void> {
  await bubble.hover();
  await bubble.getByRole('button', { name: 'Reaccionar', exact: true }).click();
  await page.getByRole('button', { name: `Reaccionar con ${emoji}`, exact: true }).click();
}

function chip(bubble: Locator, emoji: string, count: number, mine = false): Locator {
  return bubble.getByRole('button', { name: `${emoji} ${count}${mine ? ', reaccionaste' : ''}`, exact: true });
}

// --- Disappearing-chat helpers (mirrors disappearing.e2e.ts; those helpers are
// local to that spec, so the timer flow is replicated here). ---
const TIMER = 'Mensajes temporales';

function timerSelect(page: Page): Locator {
  return page.getByRole('combobox', { name: TIMER, exact: true });
}

async function openContactInfo(page: Page): Promise<void> {
  await page.getByTitle('Ver información del contacto').click();
  await expect(timerSelect(page)).toBeVisible();
}

async function closeContactInfo(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(timerSelect(page)).toBeHidden();
}

async function setTimer(page: Page, label: string): Promise<void> {
  await timerSelect(page).selectOption({ label });
  await expect(page.getByTestId('disappearing-pending')).toHaveCount(0);
}

async function ensureTimerOff(page: Page): Promise<void> {
  if ((await timerSelect(page).inputValue()) !== '0') await setTimer(page, 'Desactivados');
}

test.describe('stickers', () => {
  test('1:1: Ana envía un sticker, Luis lo ve a 150px sin fondo, en vivo y tras recargar', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      await openChat(ana.page, 'Luis');
      await openChat(luis.page, 'Ana');

      await sendSticker(ana.page, HOLA);

      // Live on both sides.
      await expectBareSticker(stickerImage(ana.page, HOLA).last());
      await expectBareSticker(stickerImage(luis.page, HOLA).last());

      // Sidebar preview of the last message is the sticker label.
      await expect(ana.page.getByText('✨ Sticker').first()).toBeVisible();

      // Still there after a reload (server history), same 150px/no-bg contract.
      await luis.page.reload();
      await openChat(luis.page, 'Ana');
      await expectBareSticker(stickerImage(luis.page, HOLA).last());
    } finally {
      await ana.context.close();
      await luis.context.close();
    }
  });

  test('1:1: Luis reacciona y responde a un sticker; la cita muestra ✨ Sticker', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      await openChat(ana.page, 'Luis');
      await openChat(luis.page, 'Ana');
      await sendSticker(ana.page, OK);

      // (3) Luis reacts: the chip shows on both sides.
      const luisBubble = stickerBubble(luis.page, OK);
      await expect(luisBubble).toBeVisible();
      await react(luis.page, luisBubble, '👍');
      await expect(chip(stickerBubble(luis.page, OK), '👍', 1, true)).toBeVisible();
      await expect(chip(stickerBubble(ana.page, OK), '👍', 1)).toBeVisible();

      // (4) Luis replies to the sticker: the banner quotes the label, not the URL.
      await luisBubble.hover();
      await luisBubble.getByRole('button', { name: 'Opciones', exact: true }).click();
      await luis.page.getByRole('button', { name: 'Responder', exact: true }).click();
      await expect(luis.page.getByText('✨ Sticker').first()).toBeVisible();

      const replyText = uniqueText('respuesta sticker');
      await sendChatText(luis.page, replyText);
      await expect(bubbleWithText(luis.page, replyText)).toContainText('✨ Sticker');
      // The quote travels with the message to Ana.
      await expect(bubbleWithText(ana.page, replyText)).toContainText('✨ Sticker');
    } finally {
      await ana.context.close();
      await luis.context.close();
    }
  });

  test('1:1: Ana reenvía el sticker a un tercer contacto', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    const marta = await openSession(browser, 'marta');
    try {
      await openChat(ana.page, 'Luis');
      await openChat(luis.page, 'Ana');
      await sendSticker(ana.page, HOLA);

      const anaBubble = stickerBubble(ana.page, HOLA);
      await expect(anaBubble).toBeVisible();
      await anaBubble.hover();
      await anaBubble.getByRole('button', { name: 'Opciones', exact: true }).click();
      await ana.page.getByRole('button', { name: 'Reenviar', exact: true }).click();

      const modal = ana.page.locator('div.fixed.inset-0').filter({ has: ana.page.getByRole('heading', { name: 'Reenviar mensaje' }) });
      await expect(modal).toBeVisible();
      await modal.getByRole('button', { name: /Marta/ }).click();
      await modal.getByRole('button', { name: /^Reenviar/ }).click();

      // Ana's chat with Marta now holds the forwarded sticker.
      await openChat(ana.page, 'Marta');
      await expectBareSticker(stickerImage(ana.page, HOLA).last());
      // Marta receives it live.
      await openChat(marta.page, 'Ana');
      await expectBareSticker(stickerImage(marta.page, HOLA).last());
    } finally {
      await ana.context.close();
      await luis.context.close();
      await marta.context.close();
    }
  });

  test('grupo: el sticker se renderiza a 150px sin fondo', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      const luisPhone = await phoneOf(luis.context.request);
      const name = uniqueText('sticker grupo');
      await createGroup(ana.context.request, name, [luisPhone]);
      await ana.page.reload();
      await openGroup(ana.page, name);
      await openGroup(luis.page, name);

      await sendSticker(ana.page, HOLA);
      await expectBareSticker(stickerImage(ana.page, HOLA).last());
      await expectBareSticker(stickerImage(luis.page, HOLA).last());
    } finally {
      await ana.context.close();
      await luis.context.close();
    }
  });

  test('temporal: un sticker en un chat que desaparece caduca como cualquier mensaje', async ({ browser }) => {
    test.setTimeout(180_000);
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      await openChat(ana.page, 'Luis');
      await openChat(luis.page, 'Ana');

      await openContactInfo(ana.page);
      await ensureTimerOff(ana.page);
      await setTimer(ana.page, '24 horas');
      await closeContactInfo(ana.page);

      await sendSticker(ana.page, HOLA);
      const luisBubble = stickerBubble(luis.page, HOLA);
      await expect(luisBubble).toBeVisible();
      const id = Number(await luisBubble.getAttribute('data-message-id'));
      expect(Number.isInteger(id) && id > 0).toBeTruthy();
      const byId = (page: Page) => page.locator(`[data-message-id="${id}"]`);

      // Near expiry: both reload, the sticker is still there and carries the clock.
      setExpiry('messages', id, '2 minutes');
      await ana.page.reload();
      await openChat(ana.page, 'Luis');
      await luis.page.reload();
      await openChat(luis.page, 'Ana');
      await expect(byId(ana.page)).toBeVisible();
      await expect(byId(luis.page)).toBeVisible();
      await expect(byId(luis.page).getByTestId('expiry-clock')).toBeVisible();

      // Expired in the DB: the messages_expired job removes it live.
      setExpiry('messages', id, '-1 second');
      await expect(byId(ana.page)).toHaveCount(0, { timeout: 90_000 });
      await expect(byId(luis.page)).toHaveCount(0, { timeout: 90_000 });

      // Gone for good after a reload.
      for (const s of [ana, luis]) {
        await s.page.reload();
        await openChat(s.page, s === ana ? 'Luis' : 'Ana');
        await expect(byId(s.page)).toHaveCount(0);
      }
    } finally {
      try {
        await openContactInfo(ana.page);
        await ensureTimerOff(ana.page);
      } catch (err) {
        console.warn('stickers cleanup failed:', err);
      } finally {
        await ana.context.close();
        await luis.context.close();
      }
    }
  });

  test('un sticker inexistente devuelve 404, no el index.html del SPA', async ({ request }) => {
    const res = await request.get('/stickers/basic/no-existe.webp');
    expect(res.status()).toBe(404);
    expect(await res.text()).not.toContain('id="root"');
  });
});
