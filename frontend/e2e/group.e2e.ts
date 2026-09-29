import { test, expect } from '@playwright/test';
import { openSession } from './support/session';
import { USERS } from './support/users';
import {
  attachImage,
  groupMessageText,
  groupTick,
  infoSection,
  openGroup,
  openGroupMessageInfo,
  recordVoiceNote,
  sendGroupText,
  uniqueText,
  uploadedUrlFrom,
} from './support/chat';

test.describe('grupo "Equipo demo"', () => {
  test('texto de Ana llega a Marta', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const marta = await openSession(browser, 'marta');
    try {
      await openGroup(ana.page);
      await openGroup(marta.page);

      const texto = uniqueText('grupo');
      await sendGroupText(ana.page, texto);
      await expect(groupMessageText(marta.page, texto)).toBeVisible();
    } finally {
      await ana.context.close();
      await marta.context.close();
    }
  });

  test('imagen y nota de voz de Ana las ve Marta', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const marta = await openSession(browser, 'marta');
    try {
      await openGroup(ana.page);
      await openGroup(marta.page);

      // La URL devuelta por la subida de Ana identifica su media: Marta debe recibir exactamente esa.
      const imagenUrl = await uploadedUrlFrom(ana.page, () => attachImage(ana.page));
      await expect(marta.page.locator(`img[src="${imagenUrl}"]`)).toBeVisible();

      const audioUrl = await uploadedUrlFrom(ana.page, () => recordVoiceNote(ana.page));
      await expect(marta.page.locator(`audio[src="${audioUrl}"]`)).toBeAttached();
    } finally {
      await ana.context.close();
      await marta.context.close();
    }
  });

  test('acuses: Ana ve enviado/entregado y, cuando Luis y Marta abren el grupo, leído; Info lista a ambos', async ({ browser }) => {
    const ana = await openSession(browser, 'ana');
    const luis = await openSession(browser, 'luis');
    const marta = await openSession(browser, 'marta');
    try {
      await openGroup(ana.page);
      const texto = uniqueText('acuses');
      await sendGroupText(ana.page, texto);

      // Luis y Marta están conectados pero no han abierto el grupo: entregado, aún no leído.
      await expect(groupTick(ana.page, texto, 'Entregado')).toBeVisible();
      await expect(groupTick(ana.page, texto, 'Visto')).toHaveCount(0);

      // Solo Luis lo abre: sigue "entregado" (falta Marta) y Info separa lectores de pendientes de lectura.
      await openGroup(luis.page);
      await expect(groupMessageText(luis.page, texto)).toBeVisible();
      // El ack de lectura de Luis va con throttle (500 ms) + ida y vuelta por WS: se reabre
      // Info hasta que refleje su lectura (sin sleeps fijos; acotado a 10 s).
      await expect(async () => {
        const parcial = await openGroupMessageInfo(ana.page, texto);
        try {
          await expect(infoSection(parcial, 'Leído por')).toContainText(USERS.luis.username, { timeout: 1_000 });
          await expect(infoSection(parcial, 'Entregado a')).toContainText(USERS.marta.username, { timeout: 1_000 });
        } finally {
          await ana.page.keyboard.press('Escape');
          await expect(parcial).toBeHidden();
        }
      }).toPass({ timeout: 10_000 });
      await expect(groupTick(ana.page, texto, 'Visto')).toHaveCount(0);

      // Marta también lo abre: doble check azul en vivo.
      await openGroup(marta.page);
      await expect(groupMessageText(marta.page, texto)).toBeVisible();
      await expect(groupTick(ana.page, texto, 'Visto')).toBeVisible();

      const info = await openGroupMessageInfo(ana.page, texto);
      await expect(infoSection(info, 'Leído por')).toContainText(USERS.luis.username);
      await expect(infoSection(info, 'Leído por')).toContainText(USERS.marta.username);
      await ana.page.keyboard.press('Escape');

      // Tras recargar, los ticks se reconstruyen desde el detalle del grupo.
      await ana.page.reload();
      await openGroup(ana.page);
      await expect(groupTick(ana.page, texto, 'Visto')).toBeVisible();

      // Quien no es el autor no ve "Info" en el mensaje de Ana.
      const bubbleDeLuis = luis.page.locator('div.rounded-2xl.shadow-sm').filter({ has: luis.page.getByText(texto, { exact: true }) });
      await bubbleDeLuis.hover();
      await bubbleDeLuis.getByRole('button', { name: 'Opciones' }).click();
      await expect(luis.page.getByRole('button', { name: 'Responder' })).toBeVisible();
      await expect(luis.page.getByRole('button', { name: 'Info', exact: true })).toHaveCount(0);
    } finally {
      await ana.context.close();
      await luis.context.close();
      await marta.context.close();
    }
  });
});
