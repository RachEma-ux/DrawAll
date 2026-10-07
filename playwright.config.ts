import { defineConfig, devices } from '@playwright/test';

// Recette navigateur : chaque scénario tourne sur ordinateur et sur téléphone.
// L'application est construite puis servie par `vite preview` (frontal seul :
// les appels au serveur échouent proprement, le dessin reste local).
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'bureau', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'telephone', use: { ...devices['Pixel 7'] } },
  ],
});
