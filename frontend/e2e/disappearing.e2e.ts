import { test, expect, type Locator, type Page } from '@playwright/test';
import { openSession, type Session } from './support/session';
import { createGroup, phoneOf } from './support/api';
import { bubbleWithText, openChat, openGroup, sendChatText, uniqueText } from './support/chat';
import { setExpiry } from './support/db';

// Mensajes temporales. Los estados de caducidad cercana se siembran en Postgres
// (support/db.ts): la app no tiene rutas de test y esperar 24 h no es viable.

const TIMER = 'Mensajes temporales';

function timerSelect(page: Page): Locator {
  return page.getByRole('combobox', { name: TIMER, exact: true });
}

function headerMemberCount(page: Page): Locator {
  return page.locator('div.text-xs').filter({ hasText: /^\d+ miembros$/ });
}

async function openContactInfo(page: Page): Promise<void> {
  await page.getByTitle('Ver información del contacto').click();
  await expect(timerSelect(page)).toBeVisible();
}

async function closeContactInfo(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(timerSelect(page)).toBeHidden();
}

async function openGroupInfo(page: Page): Promise<void> {
  await headerMemberCount(page).click();
  await expect(page.getByText('Info del grupo', { exact: true })).toBeVisible();
}

async function closeGroupInfo(page: Page): Promise<void> {
  await page.locator('div', { has: page.getByText('Info del grupo', { exact: true }) }).last()
    .getByRole('button').first().click();
  await expect(page.getByText('Info del grupo', { exact: true })).toBeHidden();
}

// Mirrors the selector options (DISAPPEAR_OPTIONS in features/dashboard/lib/disappearing.ts).
const TIMER_VALUES: Record<string, string> = {
  Desactivados: '0', '24 horas': '86400', '7 días': '604800', '90 días': '7776000',
};

async function setTimer(page: Page, label: string): Promise<void> {
  const value = TIMER_VALUES[label];
  if (value === undefined) throw new Error(`opción de temporizador desconocida: ${label}`);
  const select = timerSelect(page);
  await select.selectOption({ label });
  await expect(page.getByTestId('disappearing-pending')).toHaveCount(0);
  await expect(select).toHaveValue(value);
}

// The 1:1 setting persists between runs: start and end each run with the timer off.
async function ensureTimerOff(page: Page): Promise<void> {
  if ((await timerSelect(page).inputValue()) !== '0') await setTimer(page, 'Desactivados');
}

async function messageId(bubble: Locator): Promise<number> {
  const raw = await bubble.first().getAttribute('data-message-id');
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`data-message-id inválido: ${raw}`);
  return id;
}

async function reopenChat(s: Session, contact: string): Promise<void> {
  await s.page.reload();
  await openChat(s.page, contact);
}

test.describe('mensajes temporales', () => {
  test('1:1: Ana activa 24 h, ambos ven el aviso y el chip; el mensaje lleva reloj y caduca en vivo y tras recargar', async ({ browser }) => {
    test.setTimeout(180_000);
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    try {
      await openChat(ana.page, 'Luis');
      await openChat(luis.page, 'Ana');

      // Start from "Desactivados" (the setting persists between runs).
      await openContactInfo(ana.page);
      await ensureTimerOff(ana.page);
      await expect(ana.page.getByTestId('disappearing-chip')).toHaveCount(0);

      const pillsAna = ana.page.getByText('Activaste los mensajes temporales: 24 horas');
      const pillsLuis = luis.page.getByText('Ana activó los mensajes temporales: 24 horas');
      const beforeAna = await pillsAna.count();
      const beforeLuis = await pillsLuis.count();

      await setTimer(ana.page, '24 horas');
      await expect(pillsAna).toHaveCount(beforeAna + 1);
      await expect(pillsLuis).toHaveCount(beforeLuis + 1);
      await expect(ana.page.getByTestId('disappearing-chip')).toHaveText('Mensajes temporales: 24 h');
      await expect(luis.page.getByTestId('disappearing-chip')).toHaveText('Mensajes temporales: 24 h');
      await closeContactInfo(ana.page);

      // A new message carries the expiry clock for both.
      const keep = uniqueText('temporal reloj');
      await sendChatText(ana.page, keep);
      await expect(bubbleWithText(luis.page, keep)).toBeVisible();
      await expect(bubbleWithText(ana.page, keep).getByTestId('expiry-clock')).toBeVisible();
      await expect(bubbleWithText(luis.page, keep).getByTestId('expiry-clock')).toBeVisible();

      // Near-expiry path: expiry 45 s from now (margin for two reloads on a slow runner);
      // clients reload to learn the near ExpiresAt. Removal may come from the local timer or
      // from the job's messages_expired, whichever is first; the local timer alone is proven by
      // the useExpiryTimer unit tests.
      const soon = uniqueText('temporal local');
      await sendChatText(ana.page, soon);
      await expect(bubbleWithText(luis.page, soon)).toBeVisible();
      setExpiry('messages', await messageId(bubbleWithText(luis.page, soon)), '45 seconds');
      await reopenChat(ana, 'Luis');
      await reopenChat(luis, 'Ana');
      await expect(bubbleWithText(ana.page, soon)).toBeVisible();
      await expect(bubbleWithText(luis.page, soon)).toBeVisible();

      // Server job path: expired in the DB, clients are NOT reloaded (they still hold a 24 h
      // ExpiresAt), so only the `messages_expired` event (job ticks every minute) can remove it.
      const jobText = uniqueText('temporal job');
      await sendChatText(ana.page, jobText);
      await expect(bubbleWithText(luis.page, jobText)).toBeVisible();
      setExpiry('messages', await messageId(bubbleWithText(luis.page, jobText)), '-1 second');

      await expect(bubbleWithText(ana.page, soon)).toHaveCount(0, { timeout: 60_000 });
      await expect(bubbleWithText(luis.page, soon)).toHaveCount(0, { timeout: 60_000 });
      await expect(bubbleWithText(ana.page, jobText)).toHaveCount(0, { timeout: 90_000 });
      await expect(bubbleWithText(luis.page, jobText)).toHaveCount(0, { timeout: 90_000 });

      // Gone for good after a reload; the long-lived message is still there.
      await reopenChat(ana, 'Luis');
      await reopenChat(luis, 'Ana');
      for (const s of [ana, luis]) {
        await expect(bubbleWithText(s.page, keep)).toBeVisible();
        await expect(bubbleWithText(s.page, soon)).toHaveCount(0);
        await expect(bubbleWithText(s.page, jobText)).toHaveCount(0);
      }
    } finally {
      // Leave the chat without a timer for the other specs.
      try {
        await openContactInfo(ana.page);
        await ensureTimerOff(ana.page);
      } catch (err) {
        // Do not let a cleanup failure replace the original test failure.
        console.warn('disappearing cleanup failed:', err);
      } finally {
        await ana.context.close();
        await luis.context.close();
      }
    }
  });

  test('grupo: el miembro cambia el temporizador con "Editar info" abierto; con "solo admins" queda en solo lectura', async ({ browser }) => {
    test.setTimeout(120_000);
    const ana = await openSession(browser, 'ana');
    const marta = await openSession(browser, 'marta');
    try {
      const martaPhone = await phoneOf(marta.context.request);
      const name = uniqueText('temporal grupo');
      await createGroup(ana.context.request, name, [martaPhone]);
      await ana.page.reload();
      await openGroup(ana.page, name);
      await openGroup(marta.page, name);

      // Open by default: Marta (member) can change the timer; both see the notice and chip.
      await openGroupInfo(marta.page);
      await expect(timerSelect(marta.page)).toBeEnabled();
      await setTimer(marta.page, '24 horas');
      await expect(marta.page.getByText('Activaste los mensajes temporales: 24 horas')).toBeVisible();
      await expect(ana.page.getByText(/ activó los mensajes temporales: 24 horas$/)).toBeVisible();
      await expect(marta.page.getByTestId('disappearing-chip')).toHaveText('Mensajes temporales: 24 h');
      await expect(ana.page.getByTestId('disappearing-chip')).toHaveText('Mensajes temporales: 24 h');
      await closeGroupInfo(marta.page);

      // Ana restricts "Editar info del grupo": Marta's selector becomes read-only with the hint.
      await openGroupInfo(ana.page);
      const toggle = ana.page.getByRole('group', { name: 'Editar info del grupo' })
        .getByRole('button', { name: 'Solo admins', exact: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');

      await openGroupInfo(marta.page);
      await expect(timerSelect(marta.page)).toHaveCount(0);
      await expect(marta.page.getByTestId('disappearing-readonly')).toHaveText('24 horas');
      await expect(marta.page.getByText('Solo los administradores pueden cambiar esta opción')).toBeVisible();

      // The admin can still change it, and Marta's read-only value follows live.
      await setTimer(ana.page, '7 días');
      await expect(ana.page.getByText('Activaste los mensajes temporales: 7 días')).toBeVisible();
      await expect(marta.page.getByText(/ activó los mensajes temporales: 7 días$/)).toBeVisible();
      await expect(marta.page.getByTestId('disappearing-readonly')).toHaveText('7 días');
      await expect(marta.page.getByTestId('disappearing-chip')).toHaveText('Mensajes temporales: 7 d');
    } finally {
      await ana.context.close();
      await marta.context.close();
    }
  });
});
