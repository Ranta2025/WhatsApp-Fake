import { test, expect } from '@playwright/test';
import { openSession } from './support/session';
import { messageText, openChat, sendChatText, uniqueText } from './support/chat';

test('Ana escribe a Luis y Luis lo ve en vivo, y responde', async ({ browser }) => {
  const ana = await openSession(browser, 'ana');
  const luis = await openSession(browser, 'luis');
  try {
    await openChat(ana.page, 'Luis');
    await openChat(luis.page, 'Ana');

    const hola = uniqueText('hola');
    await sendChatText(ana.page, hola);
    await expect(messageText(ana.page, hola)).toBeVisible();
    await expect(messageText(luis.page, hola)).toBeVisible();

    const respuesta = uniqueText('respuesta');
    await sendChatText(luis.page, respuesta);
    await expect(messageText(ana.page, respuesta)).toBeVisible();
  } finally {
    await ana.context.close();
    await luis.context.close();
  }
});
