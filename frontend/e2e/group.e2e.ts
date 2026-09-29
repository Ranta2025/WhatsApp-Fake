import { test, expect } from '@playwright/test';
import { openSession } from './support/session';
import {
  attachImage,
  groupMessageText,
  openGroup,
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
});
