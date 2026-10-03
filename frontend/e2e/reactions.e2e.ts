import { test, expect, type Locator, type Page } from '@playwright/test';
import { openSession } from './support/session';
import { createGroup, phoneOf } from './support/api';
import { bubbleWithText, openChat, openGroup, sendChatText, sendGroupText, uniqueText } from './support/chat';

// Hover the bubble and pick an emoji from the quick row of the "Reaccionar" trigger.
async function react(page: Page, bubble: Locator, emoji: string): Promise<void> {
  await bubble.hover();
  await bubble.getByRole('button', { name: 'Reaccionar', exact: true }).click();
  await page.getByRole('button', { name: `Reaccionar con ${emoji}`, exact: true }).click();
}

// Reaction chip of a bubble; `mine` adds the ", reaccionaste" suffix of the accessible name.
function chip(bubble: Locator, emoji: string, count: number, mine = false): Locator {
  return bubble.getByRole('button', { name: `${emoji} ${count}${mine ? ', reaccionaste' : ''}`, exact: true });
}

test.describe('reacciones', () => {
  test('1:1: Ana reacciona, cambia y quita; Luis lo ve en vivo y tras recargar', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      const texto = uniqueText('reaccion 1a1');
      await openChat(ana.page, 'Luis');
      await openChat(luis.page, 'Ana');
      await sendChatText(ana.page, texto);
      const anaBubble = bubbleWithText(ana.page, texto);
      const luisBubble = bubbleWithText(luis.page, texto);
      await expect(luisBubble).toBeVisible();

      await react(ana.page, anaBubble, '👍');
      await expect(chip(luisBubble, '👍', 1)).toBeVisible();

      await luis.page.reload();
      await openChat(luis.page, 'Ana');
      await expect(chip(bubbleWithText(luis.page, texto), '👍', 1)).toBeVisible();

      await react(ana.page, anaBubble, '❤️');
      const luisBubbleAfter = bubbleWithText(luis.page, texto);
      await expect(chip(luisBubbleAfter, '❤️', 1)).toBeVisible();
      await expect(luisBubbleAfter.getByRole('button', { name: /^👍/ })).toHaveCount(0);

      // Tapping my own chip removes the reaction for both.
      await chip(anaBubble, '❤️', 1, true).click();
      await expect(anaBubble.getByRole('button', { name: /^❤️/ })).toHaveCount(0);
      await expect(luisBubbleAfter.getByRole('button', { name: /^❤️/ })).toHaveCount(0);
    } finally {
      await ana.context.close();
      await luis.context.close();
    }
  });

  test('grupo: Luis y Marta reaccionan; Ana ve el conteo y quién reaccionó', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    const marta = await openSession(browser, 'marta');
    try {
      const luisPhone = await phoneOf(luis.context.request);
      const martaPhone = await phoneOf(marta.context.request);
      const name = uniqueText('reaccion grupo');
      await createGroup(ana.context.request, name, [luisPhone, martaPhone]);
      const texto = uniqueText('reaccion grupo msg');

      for (const s of [ana, luis, marta]) {
        await s.page.reload();
        await openGroup(s.page, name);
      }
      await sendGroupText(ana.page, texto);
      const anaBubble = bubbleWithText(ana.page, texto);
      await expect(anaBubble).toBeVisible();

      await react(luis.page, bubbleWithText(luis.page, texto), '😂');
      await expect(chip(anaBubble, '😂', 1)).toBeVisible();
      await react(marta.page, bubbleWithText(marta.page, texto), '😂');
      await expect(chip(anaBubble, '😂', 2)).toBeVisible();

      await anaBubble.getByRole('button', { name: 'Ver reacciones' }).click();
      const dialog = ana.page.getByRole('dialog', { name: 'Reacciones' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Luis')).toBeVisible();
      await expect(dialog.getByText('Marta')).toBeVisible();
    } finally {
      await ana.context.close();
      await luis.context.close();
      await marta.context.close();
    }
  });

  test('autor: Ana fuera del chat recibe un aviso cuando Luis reacciona', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      const texto = uniqueText('reaccion aviso');
      await openChat(ana.page, 'Luis');
      await openChat(luis.page, 'Ana');
      await sendChatText(ana.page, texto);
      await expect(bubbleWithText(luis.page, texto)).toBeVisible();
      // Ana leaves the chat: the reaction must reach her as a toast.
      await openChat(ana.page, 'Marta');
      await react(luis.page, bubbleWithText(luis.page, texto), '🙏');

      await expect(ana.page.getByText(/Luis reaccionó 🙏/)).toBeVisible();
    } finally {
      await ana.context.close();
      await luis.context.close();
    }
  });
});
