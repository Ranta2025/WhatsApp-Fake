import { test, expect } from '@playwright/test';
import { openSession } from './support/session';
import { uniqueText } from './support/chat';

test('Ana publica un estado de texto y Luis lo ve', async ({ browser }) => {
  const ana = await openSession(browser, 'ana');
  const luis = await openSession(browser, 'luis');
  try {
    await ana.page.getByRole('tab', { name: 'Estados' }).click();
    await ana.page.getByLabel('Añadir una actualización de estado').click();
    await ana.page.getByRole('button', { name: 'Texto', exact: true }).click();

    const texto = uniqueText('estado');
    await ana.page.getByLabel('Texto del estado').fill(texto);
    await ana.page.getByRole('button', { name: 'Publicar' }).click();
    await expect(ana.page.getByRole('dialog', { name: 'Crear estado' })).toBeHidden();

    await luis.page.getByRole('tab', { name: 'Estados' }).click();
    await luis.page.getByText('Ana', { exact: true }).first().click();
    const visor = luis.page.getByRole('dialog', { name: /Estado de/ });
    await expect(visor.getByText(texto)).toBeVisible();
  } finally {
    await ana.context.close();
    await luis.context.close();
  }
});
