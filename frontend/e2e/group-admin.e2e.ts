import { test, expect, type Locator, type Page } from '@playwright/test';
import { openSession, type Session } from './support/session';
import {
  createGroup,
  forceGroupSendOverWs,
  groupMessageTexts,
  phoneOf,
  setGroupMemberRole,
} from './support/api';
import { groupMessageText, openGroup, sendGroupText, uniqueText } from './support/chat';

// Each test creates its own group through the REST API, so "Equipo demo" and reruns
// are never touched and member counts are those of a fresh group.

const COMPOSER = 'Escribe un mensaje en el grupo...';

interface Trio {
  ana: Session;
  luis: Session;
  marta: Session;
  luisPhone: string;
  martaPhone: string;
}

async function openTrio(browser: Parameters<typeof openSession>[0]): Promise<Trio> {
  const ana = await openSession(browser, 'ana');
  const luis = await openSession(browser, 'luis');
  const marta = await openSession(browser, 'marta');
  const luisPhone = await phoneOf(luis.context.request);
  const martaPhone = await phoneOf(marta.context.request);
  return { ana, luis, marta, luisPhone, martaPhone };
}

async function closeAll(...sessions: Session[]): Promise<void> {
  for (const s of sessions) await s.context.close();
}

// "N miembros" subtitle of the open group's header (the sidebar rows use a <span>).
function headerMemberCount(page: Page): Locator {
  return page.locator('div.text-xs').filter({ hasText: /^\d+ miembros$/ });
}

// Selects a group from the sidebar without assuming the composer is enabled.
async function selectGroup(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Grupos' }).click();
  await page.getByText(name).first().click();
  await expect(headerMemberCount(page)).toBeVisible();
}

async function openInfo(page: Page): Promise<void> {
  await headerMemberCount(page).click();
  await expect(page.getByText('Info del grupo', { exact: true })).toBeVisible();
}

async function closeInfo(page: Page): Promise<void> {
  // Innermost div holding the panel title is the panel header; its first button closes it.
  await page.locator('div', { has: page.getByText('Info del grupo', { exact: true }) }).last()
    .getByRole('button').first().click();
  await expect(page.getByText('Info del grupo', { exact: true })).toBeHidden();
}

// Member row in the info panel (every row shows the member's phone).
function memberRow(page: Page, phone: string): Locator {
  return page.locator('div.px-4.py-3').filter({ hasText: phone });
}

function adminBadge(page: Page, phone: string): Locator {
  return memberRow(page, phone).getByText('admin', { exact: true });
}

async function setPermission(page: Page, label: string, value: 'Todos' | 'Solo admins'): Promise<void> {
  const toggle = page.getByRole('group', { name: label }).getByRole('button', { name: value, exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
}

test.describe('administración de grupos', () => {
  test('Ana designa a Luis admin, Luis elimina a Marta y Ana la vuelve a añadir', async ({ browser }) => {
    test.setTimeout(120_000);
    const { ana, luis, marta, luisPhone, martaPhone } = await openTrio(browser);
    try {
      const name = uniqueText('admin grupo');
      await createGroup(ana.context.request, name, [luisPhone, martaPhone]);
      await ana.page.reload();
      await openGroup(ana.page, name);
      await openGroup(luis.page, name);
      await openGroup(marta.page, name);

      // Ana promotes Luis from his member menu.
      await openInfo(ana.page);
      await expect(adminBadge(ana.page, luisPhone)).toHaveCount(0);
      await memberRow(ana.page, luisPhone).click();
      await ana.page.getByRole('button', { name: 'Designar como admin' }).click();
      await expect(adminBadge(ana.page, luisPhone)).toBeVisible();
      await closeInfo(ana.page);

      // The persisted system message is worded per viewer and the badge reaches everyone live.
      await expect(ana.page.getByText(/^Tú designaste a .+ como admin$/)).toBeVisible();
      await expect(luis.page.getByText(/te designó como admin$/)).toBeVisible();
      await expect(marta.page.getByText(/designó a .+ como admin$/)).toBeVisible();
      await openInfo(marta.page);
      await expect(adminBadge(marta.page, luisPhone)).toBeVisible();
      await closeInfo(marta.page);

      // It survives a reload (server-persisted, not a client-only entry).
      await marta.page.reload();
      await openGroup(marta.page, name);
      await expect(marta.page.getByText(/designó a .+ como admin$/)).toBeVisible();

      // Luis, now admin, removes Marta: her UI switches to the removed state live.
      await openInfo(luis.page);
      await expect(adminBadge(luis.page, luisPhone)).toBeVisible();
      await memberRow(luis.page, martaPhone).click();
      await luis.page.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await expect(luis.page.getByText(/^¿Eliminar a .+\?$/)).toBeVisible();
      await luis.page.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await expect(memberRow(luis.page, martaPhone)).toHaveCount(0);
      await expect(luis.page.getByText('2 participantes', { exact: true })).toBeVisible();
      await closeInfo(luis.page);

      await expect(marta.page.getByTestId('group-composer-left')).toContainText('Un admin te eliminó de este grupo');
      await expect(marta.page.getByPlaceholder(COMPOSER)).toBeHidden();
      await expect(headerMemberCount(ana.page)).toHaveText('2 miembros');
      await expect(ana.page.getByText(/eliminó a .+$/)).toBeVisible();

      // Ana adds Marta back.
      await openInfo(ana.page);
      await ana.page.getByRole('button', { name: 'Añadir', exact: true }).click();
      const modal = ana.page.locator('div.fixed', { has: ana.page.getByRole('heading', { name: 'Añadir miembros' }) });
      await modal.getByRole('button').filter({ hasText: martaPhone }).click();
      await modal.getByRole('button', { name: 'Añadir (1)' }).click();
      await expect(modal).toBeHidden();
      await expect(headerMemberCount(ana.page)).toHaveText('3 miembros');
      await expect(ana.page.getByText(/^Tú añadiste a .+$/)).toBeVisible();

      // Marta is a member again: reopening the group gives her the composer back.
      await marta.page.reload();
      await openGroup(marta.page, name);
      await expect(marta.page.getByText(/te añadió al grupo$/)).toBeVisible();
    } finally {
      await closeAll(ana, luis, marta);
    }
  });

  test('"Enviar mensajes: solo admins" bloquea a Marta en la UI y por WebSocket forzado', async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const { ana, luis, marta, luisPhone, martaPhone } = await openTrio(browser);
    try {
      const name = uniqueText('admin envio');
      const groupID = await createGroup(ana.context.request, name, [luisPhone, martaPhone]);
      await setGroupMemberRole(ana.context.request, groupID, luisPhone, 'admin');
      await ana.page.reload();
      await openGroup(ana.page, name);
      await openGroup(luis.page, name);
      await openGroup(marta.page, name);

      await openInfo(ana.page);
      await setPermission(ana.page, 'Enviar mensajes', 'Solo admins');
      await closeInfo(ana.page);

      // Marta's composer becomes the banner live; Luis (admin) can still send.
      await expect(marta.page.getByTestId('group-composer-restricted')).toContainText('Solo los admins pueden enviar mensajes');
      await expect(marta.page.getByPlaceholder(COMPOSER)).toBeHidden();
      const fromLuis = uniqueText('admin luis');
      await sendGroupText(luis.page, fromLuis);
      await expect(groupMessageText(ana.page, fromLuis)).toBeVisible();
      await expect(groupMessageText(marta.page, fromLuis)).toBeVisible();

      // A hand-crafted WS client as Marta. The hub keeps one connection per user, so her
      // browser leaves the dashboard first (otherwise its reconnect would replace ours).
      await marta.page.goto('about:blank');
      const forced = uniqueText('admin forzado');
      const reply = await forceGroupSendOverWs(marta.context.request, baseURL ?? 'http://localhost', groupID, forced);
      expect(reply.type).toBe('error');
      expect(reply.error).toContain('solo los admins pueden enviar mensajes');

      // Ordering marker: once Luis's next message arrives, the forced one would have too.
      const marker = uniqueText('admin marcador');
      await sendGroupText(luis.page, marker);
      await expect(groupMessageText(ana.page, marker)).toBeVisible();
      await expect(groupMessageText(luis.page, marker)).toBeVisible();
      await expect(groupMessageText(ana.page, forced)).toHaveCount(0);
      await expect(groupMessageText(luis.page, forced)).toHaveCount(0);
      expect(await groupMessageTexts(ana.context.request, groupID)).not.toContain(forced);

      // Back on the dashboard Marta is still restricted; "Todos" re-enables her composer live.
      await marta.page.goto('/dashboard');
      await selectGroup(marta.page, name);
      await expect(marta.page.getByTestId('group-composer-restricted')).toBeVisible();

      await openInfo(ana.page);
      await setPermission(ana.page, 'Enviar mensajes', 'Todos');
      await closeInfo(ana.page);

      await expect(marta.page.getByPlaceholder(COMPOSER)).toBeVisible();
      await expect(marta.page.getByTestId('group-composer-restricted')).toHaveCount(0);
      const fromMarta = uniqueText('admin marta');
      await sendGroupText(marta.page, fromMarta);
      await expect(groupMessageText(ana.page, fromMarta)).toBeVisible();
    } finally {
      await closeAll(ana, luis, marta);
    }
  });

  test('"Editar info" y "Agregar participantes" ocultan y muestran los controles de Marta', async ({ browser }) => {
    test.setTimeout(120_000);
    const ana = await openSession(browser, 'ana');
    const marta = await openSession(browser, 'marta');
    try {
      const martaPhone = await phoneOf(marta.context.request);
      const name = uniqueText('admin info');
      await createGroup(ana.context.request, name, [martaPhone]);
      await ana.page.reload();
      await openGroup(ana.page, name);
      await openGroup(marta.page, name);

      const editInfo = marta.page.getByRole('button', { name: 'Editar info del grupo' });
      const addMembers = marta.page.getByRole('button', { name: 'Añadir', exact: true });

      // Open by default: Marta (member) can edit info and add participants.
      await openInfo(marta.page);
      await expect(editInfo).toBeVisible();
      await expect(addMembers).toBeVisible();

      await openInfo(ana.page);
      await setPermission(ana.page, 'Editar info del grupo', 'Solo admins');
      await expect(editInfo).toHaveCount(0);
      await expect(marta.page.getByTestId('group-setting-edit-value')).toHaveText('Solo admins');
      await expect(addMembers).toBeVisible();

      await setPermission(ana.page, 'Agregar otros participantes', 'Solo admins');
      await expect(addMembers).toHaveCount(0);
      await expect(marta.page.getByTestId('group-setting-add-value')).toHaveText('Solo admins');

      // Back to "Todos": the controls come back live.
      await setPermission(ana.page, 'Editar info del grupo', 'Todos');
      await setPermission(ana.page, 'Agregar otros participantes', 'Todos');
      await expect(editInfo).toBeVisible();
      await expect(addMembers).toBeVisible();
      await expect(marta.page.getByTestId('group-setting-edit-value')).toHaveText('Todos');
      await expect(marta.page.getByTestId('group-setting-add-value')).toHaveText('Todos');
    } finally {
      await closeAll(ana, marta);
    }
  });
});
