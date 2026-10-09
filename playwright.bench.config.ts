import { defineConfig, devices } from '@playwright/test';

// Banc de mesure (lot 19.2) : un seul navigateur, un seul travailleur (mesures non concurrentes).
export default defineConfig({
  testDir: 'bench',
  timeout: 3_600_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'bureau', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
