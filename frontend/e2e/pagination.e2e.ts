import { test, expect, type APIRequestContext } from '@playwright/test';
import { openSession } from './support/session';
import { openChat, messageText, uniqueText } from './support/chat';

// La ventana más reciente es de 200 mensajes: con 230 los 30 primeros quedan en una página anterior.
const SEED_COUNT = 230;

interface UserResponse {
  Telephon: string;
}

function isUserResponse(value: unknown): value is UserResponse {
  return typeof value === 'object' && value !== null && typeof (value as { Telephon?: unknown }).Telephon === 'string';
}

async function phoneOf(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/v1/user');
  expect(res.ok()).toBeTruthy();
  const body: unknown = await res.json();
  if (!isUserResponse(body)) throw new Error('GET /api/v1/user sin "Telephon"');
  return body.Telephon;
}

test('scroll hacia arriba en un chat largo carga mensajes anteriores sin saltar', async ({ browser }) => {
  test.setTimeout(180_000);
  const ana = await openSession(browser, 'ana');
  const marta = await openSession(browser, 'marta');
  try {
    // Seed por API con una etiqueta única: más rápido y estable que escribir 230 mensajes por UI.
    const martaPhone = await phoneOf(marta.context.request);
    const tag = uniqueText('pag');
    const label = (n: number) => `${tag} #${String(n).padStart(3, '0')}`;
    for (let n = 1; n <= SEED_COUNT; n++) {
      const res = await ana.context.request.post('/api/v1/chat', {
        data: { receptor: martaPhone, message: label(n) },
      });
      expect(res.ok(), `seed ${n}`).toBeTruthy();
    }

    await ana.page.reload();
    await openChat(ana.page, 'Marta');

    // Ventana más reciente: el último está, el primero todavía no se cargó.
    await expect(messageText(ana.page, label(SEED_COUNT))).toBeVisible();
    await expect(messageText(ana.page, label(1))).toHaveCount(0);

    // Ancla: el mensaje más antiguo cargado. Tras cargar la página anterior debe
    // seguir en pantalla (sin salto de scroll).
    const bubbles = ana.page.locator('.whitespace-pre-wrap').filter({ hasText: new RegExp(`^${tag} #\\d{3}$`) });
    const anchor = bubbles.first();
    const anchorText = (await anchor.textContent()) ?? '';
    expect(anchorText).toContain(tag);

    const container = anchor.locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
    await container.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });

    await expect(messageText(ana.page, label(1))).toBeAttached({ timeout: 15_000 });

    // El ancla sigue dentro del área visible del contenedor.
    const anchorAfter = messageText(ana.page, anchorText);
    await expect(anchorAfter).toBeInViewport();
  } finally {
    await ana.context.close();
    await marta.context.close();
  }
});
