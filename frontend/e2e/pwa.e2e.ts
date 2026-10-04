import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";
import { openSession } from "./support/session";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  id: string;
  name: string;
  start_url: string;
  scope: string;
  display: string;
  lang: string;
  icons: ManifestIcon[];
}

// Espera a que el worker esté activado y controlando la página (recarga una vez
// si la primera carga quedó sin controlador: clients.claim() es asíncrono).
async function waitForControlledPage(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return registration.active?.state ?? null;
        }),
      { timeout: 20_000 },
    )
    .toBe("activated");
  if (
    !(await page.evaluate(() => navigator.serviceWorker.controller !== null))
  ) {
    await page.reload();
  }
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);
}

async function freshPage(
  browser: import("@playwright/test").Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

test.describe("PWA", () => {
  test("el manifest es válido y sus iconos se sirven", async ({
    request,
    browser,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain(
      "application/manifest+json",
    );

    const manifest = (await res.json()) as Manifest;
    expect(manifest.id).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("es");
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((i) => i.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);

    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status(), icon.src).toBe(200);
      expect(iconRes.headers()["content-type"], icon.src).toContain(icon.type);
    }

    const { context, page } = await freshPage(browser);
    try {
      await page.goto("/");
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test("el service worker se activa y se sirve sin caché", async ({
    browser,
    request,
  }) => {
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-cache");

    const { context, page } = await freshPage(browser);
    try {
      await page.goto("/");
      await waitForControlledPage(page);
      expect(context.serviceWorkers().length).toBeGreaterThan(0);
      expect(context.serviceWorkers()[0]?.url()).toContain("/sw.js");
    } finally {
      await context.close();
    }
  });

  test("sin conexión la app shell carga y muestra el banner", async ({
    browser,
  }) => {
    const { context, page } = await freshPage(browser);
    try {
      await page.goto("/");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /Conecta con quien importa/,
        }),
      ).toBeVisible();
      await waitForControlledPage(page);
      await expect(
        page.getByRole("status").filter({ hasText: "Sin conexión" }),
      ).toBeHidden();

      await context.setOffline(true);
      await page.reload();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: /Conecta con quien importa/,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("status").filter({ hasText: "Sin conexión" }),
      ).toBeVisible();

      await context.setOffline(false);
      await expect(
        page.getByRole("status").filter({ hasText: "Sin conexión" }),
      ).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("con sesión iniciada, sin conexión la app no se rompe", async ({
    browser,
  }) => {
    const { context, page } = await openSession(browser, "ana");
    try {
      await expect(page.getByRole("tab", { name: "Estados" })).toBeVisible();
      await waitForControlledPage(page);

      await context.setOffline(true);
      await page.reload();
      await expect(page.locator("#root")).not.toBeEmpty();
      await expect(
        page.getByRole("status").filter({ hasText: "Sin conexión" }),
      ).toBeVisible();

      await context.setOffline(false);
      await expect(
        page.getByRole("status").filter({ hasText: "Sin conexión" }),
      ).toBeHidden({
        timeout: 30_000,
      });
    } finally {
      await context.close();
    }
  });

  test("la API y el storage nunca se sirven desde el service worker", async ({
    browser,
  }) => {
    const { context, page } = await freshPage(browser);
    try {
      await page.goto("/");
      await waitForControlledPage(page);

      const responses: Response[] = [];
      page.on("response", (r) => responses.push(r));
      const urls = ["/healthz", "/storage/pwa-e2e/inexistente.png"];

      for (const url of urls) {
        const status = await page.evaluate(
          async (u) => (await fetch(u, { cache: "no-store" })).status,
          url,
        );
        expect(status, url).toBeGreaterThan(0);
        const seen = responses.find((r) => new URL(r.url()).pathname === url);
        expect(seen, url).toBeDefined();
        expect(seen?.fromServiceWorker(), url).toBe(false);
      }

      await context.setOffline(true);
      for (const url of urls) {
        const failed = await page.evaluate(async (u) => {
          try {
            await fetch(u);
            return false;
          } catch {
            return true;
          }
        }, url);
        expect(failed, `${url} no debe tener copia en caché`).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
});
