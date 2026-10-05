import { test, expect, type Locator, type Page } from '@playwright/test';
import { openSession } from './support/session';
import { createGroup, phoneOf } from './support/api';
import { bubbleWithText, openChat, openGroup, sendChatText, sendGroupText, uniqueText } from './support/chat';
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
  // Polled: the bubble plays a slide-up animation on arrival, which scales the box.
  await expect.poll(async () => (await img.boundingBox())?.width).toBe(150);
  await expect.poll(async () => (await img.boundingBox())?.height).toBe(150);
  // Every ancestor from the image up to its message wrapper ([data-message-id],
  // inclusive) must be free of the bubble backgrounds.
  const ancestorClasses = await img.evaluate((el) => {
    const root = el.closest('[data-message-id]');
    if (!root) return null;
    const classes: string[] = [];
    for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
      classes.push(n.getAttribute('class') ?? '');
      if (n === root) break;
    }
    return classes.join(' ');
  });
  expect(ancestorClasses, 'sticker image must live inside a [data-message-id] message').not.toBeNull();
  expect(ancestorClasses).not.toMatch(/bg-(indigo|slate)-/);
}

/** Positive control: a plain text bubble in the same chat DOES carry a bubble background. */
async function expectTextBubbleHasBackground(page: Page, text: string): Promise<void> {
  const bubble = bubbleWithText(page, text);
  await expect(bubble).toBeVisible();
  await expect(bubble.locator('[class*="bg-indigo-"], [class*="bg-slate-"]').first()).toBeVisible();
}

/** Sidebar row (a button) of a contact whose title and last-message preview match. */
function sidebarRow(page: Page, contact: string, preview: string | RegExp): Locator {
  return page.getByRole('button').filter({ hasText: contact }).filter({ hasText: preview });
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

      // Positive control + known sidebar preview: a unique text message first, so the
      // sticker label can only come from the sticker sent below (older stickers exist).
      const controlText = uniqueText('control burbuja');
      await sendChatText(ana.page, controlText);
      await expectTextBubbleHasBackground(ana.page, controlText);
      await expect(sidebarRow(ana.page, 'Luis', controlText)).toBeVisible();

      const anaBefore = await stickerImage(ana.page, HOLA).count();
      const luisBefore = await stickerImage(luis.page, HOLA).count();
      await sendSticker(ana.page, HOLA);

      // Live on both sides: the count grows by exactly one new sticker.
      await expect(stickerImage(ana.page, HOLA)).toHaveCount(anaBefore + 1);
      await expect(stickerImage(luis.page, HOLA)).toHaveCount(luisBefore + 1);
      await expectBareSticker(stickerImage(ana.page, HOLA).last());
      await expectBareSticker(stickerImage(luis.page, HOLA).last());

      // Sidebar preview of Luis' row switched from the text to the sticker label.
      await expect(sidebarRow(ana.page, 'Luis', '✨ Sticker')).toBeVisible();
      await expect(sidebarRow(ana.page, 'Luis', controlText)).toHaveCount(0);

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
      // Scoped to the composer banner (the node next to the "Respondiendo a" label).
      const banner = luis.page.getByText(/^Respondiendo a/).locator('xpath=..');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('✨ Sticker');

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
      // Baseline counts of HOLA stickers in the Ana<->Marta chat (older runs left some).
      await openChat(ana.page, 'Marta');
      await openChat(marta.page, 'Ana');
      const anaMartaBefore = await stickerImage(ana.page, HOLA).count();
      const martaBefore = await stickerImage(marta.page, HOLA).count();

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
      await expect(stickerImage(ana.page, HOLA)).toHaveCount(anaMartaBefore + 1);
      await expectBareSticker(stickerImage(ana.page, HOLA).last());
      // Marta receives it live (her chat with Ana has been open since the baseline).
      await expect(stickerImage(marta.page, HOLA)).toHaveCount(martaBefore + 1);
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

      // Positive control: a text bubble in this group carries a background.
      const controlText = uniqueText('control grupo');
      await sendGroupText(ana.page, controlText);
      await expectTextBubbleHasBackground(ana.page, controlText);

      const anaBefore = await stickerImage(ana.page, HOLA).count();
      const luisBefore = await stickerImage(luis.page, HOLA).count();
      await sendSticker(ana.page, HOLA);
      await expect(stickerImage(ana.page, HOLA)).toHaveCount(anaBefore + 1);
      await expect(stickerImage(luis.page, HOLA)).toHaveCount(luisBefore + 1);
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
