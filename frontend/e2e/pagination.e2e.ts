import { test, expect, type APIRequestContext, type Locator } from '@playwright/test';
import { openSession } from './support/session';
import { openChat, messageBubbles, messageText, uniqueText } from './support/chat';

// La ventana más reciente es de 200 mensajes: con 230 los 30 primeros quedan en una página anterior.
const SEED_COUNT = 230;
// Desplazamiento máximo admitido del ancla al anteponer la página anterior.
const TOLERANCIA_PX = 40;

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
    const bubbles = messageBubbles(ana.page).filter({ hasText: new RegExp(`^${tag} #\\d{3}$`) });
    const anchor = bubbles.first();
    const anchorText = (await anchor.textContent()) ?? '';
    expect(anchorText).toContain(tag);

    const offsetOf = (loc: Locator) =>
      loc.evaluate((el) => {
        const scroller = el.closest('.overflow-y-auto');
        if (!scroller) throw new Error('sin contenedor de scroll');
        return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      });

    // Llega arriba y mide el ancla en el mismo paso síncrono, antes de que la carga anteponga nada.
    const offsetAntes = await anchor.evaluate((el) => {
      const scroller = el.closest('.overflow-y-auto');
      if (!scroller) throw new Error('sin contenedor de scroll');
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll'));
      return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    });

    await expect(messageText(ana.page, label(1))).toBeAttached({ timeout: 15_000 });

    // El ancla conserva su posición relativa al contenedor (tolerancia pequeña por el layout).
    const anchorAfter = messageText(ana.page, anchorText);
    await expect(anchorAfter).toBeInViewport();
    await expect
      .poll(async () => Math.abs((await offsetOf(anchorAfter)) - offsetAntes), { timeout: 5_000 })
      .toBeLessThanOrEqual(TOLERANCIA_PX);
  } finally {
    await ana.context.close();
    await marta.context.close();
  }
});
