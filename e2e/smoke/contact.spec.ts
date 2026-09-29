import { expect, test } from '@playwright/test';

test('contact page shows details and no form', async ({ page }) => {
  await page.goto('/contact');
  await expect(page.getByRole('heading', { level: 1 })).toContainText("Let's Work Together");
  await expect(page.locator('form')).toHaveCount(0);
});

test('donate page states online donations are unavailable', async ({ page }) => {
  await page.goto('/donate');
  await expect(page.getByText('Online donations are not available yet')).toBeVisible();
});
