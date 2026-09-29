import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

// Suite e2e de navegador contra el stack de Docker (docker compose up -d --build).
// El estado de la BD es compartido entre specs: se ejecutan en serie (workers: 1).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  forbidOnly: isCI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      // Micrófono falso para la nota de voz
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
