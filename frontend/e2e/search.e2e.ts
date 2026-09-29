import { test, expect, type Locator, type Page } from '@playwright/test';
import { openSession } from './support/session';
import { openChat, openGroup, sendChatText, messageText, uniqueText, bubbleWithText, openChatSearch, RETURN_TO_LATEST } from './support/chat';
import { phoneOf, postChat, postGroupMessage, groupIdByName, createGroup, globalSearch } from './support/api';

// La ventana más reciente de un chat es de 200 mensajes: con 210 de relleno el primero queda en una página anterior.
const FILLER_COUNT = 210;
const FILLER_BATCH = 10;

function counter(page: Page, text: string): Locator {
  return page.getByRole('status').filter({ hasText: text });
}

test.describe('búsqueda de mensajes', () => {
  test('en el chat: encuentra un mensaje de una página anterior, salta a él, lo resalta y no rompe paginación ni mensajes en vivo', async ({ browser }) => {
    test.setTimeout(240_000);
    const ana = await openSession(browser, 'ana');
    const marta = await openSession(browser, 'marta');
    try {
      const martaPhone = await phoneOf(marta.context.request);
      const stamp = Date.now();
      const term = `cancion${stamp}`;
      const oldText = `Qué canción${stamp} vieja`;
      const recentText = `Otra CANCIÓN${stamp} reciente`;
      const liveText = uniqueText('en vivo');
      const tag = uniqueText('relleno');

      // Semilla por API: el mensaje viejo primero, después el relleno (lo empuja a una página anterior) y el reciente al final.
      await postChat(ana.context.request, martaPhone, oldText);
      for (let n = 1; n <= FILLER_COUNT; n += FILLER_BATCH) {
        await Promise.all(
          Array.from({ length: Math.min(FILLER_BATCH, FILLER_COUNT - n + 1) }, (_, i) => postChat(ana.context.request, martaPhone, `${tag} #${n + i}`)),
        );
      }
      await postChat(ana.context.request, martaPhone, recentText);

      await ana.page.reload();
      await openChat(ana.page, 'Marta');
      await expect(messageText(ana.page, recentText)).toBeVisible();
      await expect(bubbleWithText(ana.page, oldText)).toHaveCount(0); // aún no está cargado

      // Busca sin acentos ni mayúsculas: encuentra las dos variantes y salta a la más reciente.
      const input = await openChatSearch(ana.page);
      await input.fill(term);
      await expect(counter(ana.page, '1 de 2')).toBeVisible();
      await expect(bubbleWithText(ana.page, recentText).locator('mark')).toHaveText(`CANCIÓN${stamp}`);
      await expect(bubbleWithText(ana.page, recentText)).toBeInViewport();

      // Anterior: salta al mensaje de la página anterior (ventana desprendida), lo centra y lo resalta.
      await ana.page.getByRole('button', { name: 'Coincidencia anterior' }).click();
      await expect(counter(ana.page, '2 de 2')).toBeVisible();
      const old = bubbleWithText(ana.page, oldText);
      await expect(old).toBeVisible();
      await expect(old).toBeInViewport();
      await expect(old.locator('mark')).toHaveText(`canción${stamp}`);
      await expect(old).toHaveAttribute('data-search-flash', 'true');
      await expect(ana.page.getByRole('button', { name: RETURN_TO_LATEST })).toBeVisible();

      // Mientras está desprendida, un mensaje en vivo no se cuela en la ventana...
      await openChat(marta.page, 'Ana');
      await sendChatText(marta.page, liveText);
      await expect(messageText(marta.page, liveText)).toBeVisible();
      await expect(bubbleWithText(ana.page, liveText)).toHaveCount(0);

      // Siguiente: vuelve al reciente.
      await ana.page.getByRole('button', { name: 'Coincidencia siguiente' }).click();
      await expect(counter(ana.page, '1 de 2')).toBeVisible();
      await expect(bubbleWithText(ana.page, recentText)).toBeInViewport();

      // Escape cierra la barra y quita el resaltado.
      await ana.page.keyboard.press('Escape');
      await expect(input).toBeHidden();
      await expect(ana.page.locator('mark')).toHaveCount(0);

      // ...y al volver a los últimos mensajes aparece.
      await ana.page.getByRole('button', { name: RETURN_TO_LATEST }).click();
      await expect(ana.page.getByRole('button', { name: RETURN_TO_LATEST })).toHaveCount(0);
      await expect(messageText(ana.page, liveText)).toBeVisible();
      await expect(messageText(ana.page, oldText)).toHaveCount(0);

      // La paginación de la lista normal sigue funcionando: al subir se carga la página anterior con el mensaje viejo.
      await ana.page.locator('.overflow-y-auto', { has: ana.page.locator('[data-message-id]') }).first().evaluate((el) => {
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
      });
      await expect(messageText(ana.page, oldText)).toBeAttached({ timeout: 15_000 });
    } finally {
      await ana.context.close();
      await marta.context.close();
    }
  });

  test('global: agrupa por chat (1:1 y grupos), abre el chat en el mensaje y respeta la privacidad', async ({ browser }) => {
    test.setTimeout(120_000);
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      const martaSession = await openSession(browser, 'marta');
      const martaPhone = await phoneOf(martaSession.context.request);
      await martaSession.context.close();

      const stamp = Date.now();
      const term = `glob${stamp}`;
      const query = `cancion ${term}`;
      const directText = `Escucha esta canción ${term} ahora`;
      const groupText = `Reunión sobre la canción ${term} en el grupo`;
      const secretText = `Secreto: canción ${term}`;

      // 1:1 Ana<->Marta, grupo compartido y un grupo privado (Ana y Marta, sin Luis).
      await postChat(ana.context.request, martaPhone, directText);
      const sharedGroupId = await groupIdByName(ana.context.request, 'Equipo demo');
      await postGroupMessage(ana.context.request, sharedGroupId, groupText);
      const privateName = `E2E privado ${stamp}`;
      const privateGroupId = await createGroup(ana.context.request, privateName, [martaPhone]);
      await postGroupMessage(ana.context.request, privateGroupId, secretText);

      // Ana ve los tres chats en la sección "Mensajes" de la barra lateral.
      await ana.page.reload();
      const search = ana.page.getByLabel('Buscar chats');
      await search.fill(query);
      const section = ana.page.getByRole('region', { name: 'Mensajes' });
      await expect(section.locator('[data-chat-key]')).toHaveCount(3);
      await expect(section).toContainText('Marta');
      await expect(section).toContainText('Equipo demo');
      await expect(section).toContainText(privateName);
      await expect(section.locator('mark').first()).toBeVisible();

      // Clic en el resultado del 1:1: abre el chat en ese mensaje.
      await section.locator('[data-chat-key^="direct:"] button[data-result-id]').first().click();
      await expect(ana.page.getByPlaceholder('Escribe un mensaje...')).toBeVisible();
      await expect(bubbleWithText(ana.page, directText)).toBeInViewport();
      await expect(ana.page.getByRole('button', { name: RETURN_TO_LATEST })).toBeVisible();

      // Clic en el resultado del grupo compartido: abre el grupo en ese mensaje.
      await section.locator('[data-chat-key^="group:"]').filter({ hasText: 'Equipo demo' }).locator('button[data-result-id]').first().click();
      await expect(ana.page.getByPlaceholder('Escribe un mensaje en el grupo...')).toBeVisible();
      await expect(bubbleWithText(ana.page, groupText)).toBeInViewport();

      // Privacidad: Luis (miembro de "Equipo demo", ajeno al 1:1 y al grupo privado) solo ve el grupo compartido.
      const luisSearch = luis.page.getByLabel('Buscar chats');
      await luisSearch.fill(query);
      const luisSection = luis.page.getByRole('region', { name: 'Mensajes' });
      await expect(luisSection.locator('[data-chat-key]')).toHaveCount(1);
      await expect(luisSection).toContainText('Equipo demo');
      await expect(luisSection).not.toContainText(privateName);
      await expect(luisSection).not.toContainText(directText);

      // ...y por API: ni el buscador global, ni la búsqueda del grupo privado, ni saltar a sus mensajes.
      const luisHits = await globalSearch(luis.context.request, query);
      expect(luisHits.map((c) => `${c.kind}:${c.key}`)).toEqual([`group:${sharedGroupId}`]);
      const denied = await luis.context.request.get(`/api/v1/group/${privateGroupId}/message/search`, { params: { q: term } });
      expect(denied.status()).toBe(403);

      const anaHits = await globalSearch(ana.context.request, query);
      const directHit = anaHits.find((c) => c.kind === 'direct')?.results[0]?.messageID;
      const privateHit = anaHits.find((c) => c.key === String(privateGroupId))?.results[0]?.messageID;
      if (directHit === undefined || privateHit === undefined) throw new Error('Ana debería ver el 1:1 y el grupo privado');
      const luisJump = await luis.context.request.get(`/api/v1/chat/${martaPhone}`, { params: { around: directHit } });
      expect(luisJump.status()).toBe(404);
      const luisGroupJump = await luis.context.request.get(`/api/v1/group/${privateGroupId}/message`, { params: { around: privateHit } });
      expect(luisGroupJump.status()).toBe(403);

      // Un término sin coincidencias muestra "Sin resultados".
      await luisSearch.fill(`nada${stamp}`);
      await expect(luisSection).toContainText('Sin resultados');
    } finally {
      await ana.context.close();
      await luis.context.close();
    }
  });

  test('en el grupo: la búsqueda salta a un mensaje anterior y "n de N" recorre las coincidencias', async ({ browser }) => {
    test.setTimeout(120_000);
    const ana = await openSession(browser, 'ana');
    try {
      const stamp = Date.now();
      const term = `reunion${stamp}`;
      const first = `Primera reunión${stamp} del grupo`;
      const second = `Segunda REUNIÓN${stamp} del grupo`;
      const groupId = await groupIdByName(ana.context.request, 'Equipo demo');
      await postGroupMessage(ana.context.request, groupId, first);
      await postGroupMessage(ana.context.request, groupId, second);

      await ana.page.reload();
      await openGroup(ana.page);
      const input = await openChatSearch(ana.page);
      await input.fill(term);
      await expect(counter(ana.page, '1 de 2')).toBeVisible();
      await expect(bubbleWithText(ana.page, second).locator('mark')).toHaveText(`REUNIÓN${stamp}`);

      await ana.page.getByRole('button', { name: 'Coincidencia anterior' }).click();
      await expect(counter(ana.page, '2 de 2')).toBeVisible();
      await expect(bubbleWithText(ana.page, first)).toBeInViewport();
      await expect(bubbleWithText(ana.page, first).locator('mark')).toHaveText(`reunión${stamp}`);

      await input.fill(`zzz${stamp}`);
      await expect(counter(ana.page, 'Sin resultados')).toBeVisible();
      await ana.page.keyboard.press('Escape');
      await expect(input).toBeHidden();
    } finally {
      await ana.context.close();
    }
  });
});
