import { test, expect } from '@playwright/test';
import { openSession } from './support/session';
import { uniqueText } from './support/chat';

// Tope de estados a recorrer en el visor de Ana.
const MAX_ESTADOS = 30;

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
    await expect(visor).toBeVisible();
    // Los estados se acumulan entre ejecuciones: el visor puede abrir en uno anterior,
    // así que se avanza (acotado) hasta el nuevo.
    const objetivo = visor.getByText(texto);
    for (let i = 0; i < MAX_ESTADOS && !(await objetivo.isVisible()); i++) {
      await luis.page.keyboard.press('ArrowRight');
      await expect(visor).toBeVisible();
    }
    await expect(objetivo).toBeVisible();
  } finally {
    await ana.context.close();
    await luis.context.close();
  }
});
