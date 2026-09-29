import { test, expect } from '@playwright/test';
import { openSession } from './support/session';
import {
  attachImage,
  openGroup,
  recordVoiceNote,
  sendGroupText,
  storageImages,
  uniqueText,
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
      await expect(marta.page.getByText(texto)).toBeVisible();
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

      // El estado es compartido: se compara contra lo que ya había, sin totales absolutos.
      const imagenesAntes = await storageImages(marta.page).count();
      const audiosAntes = await marta.page.locator('audio').count();

      await attachImage(ana.page);
      await expect(storageImages(marta.page)).not.toHaveCount(imagenesAntes);

      await recordVoiceNote(ana.page);
      await expect(marta.page.locator('audio')).not.toHaveCount(audiosAntes);
    } finally {
      await ana.context.close();
      await marta.context.close();
    }
  });
});
