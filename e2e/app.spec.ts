import { expect, test } from '@playwright/test';

test('muestra el acceso institucional de TutoLink', async ({ page }) => {
  await page.goto('/acceso');
  await expect(page.locator('app-brand img')).toBeVisible();
  await expect(page.locator('ion-card-title')).toHaveText('Bienvenido a TutoLink');
  await expect(page.locator('ion-input[name="correo"] input')).toBeVisible();
});
