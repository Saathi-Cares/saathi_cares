import { expect, test } from '@playwright/test';

test('home page renders the hero and sections', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Healthy Smiles');
  await expect(page.getByText('Numbers That Tell Our Story')).toBeVisible();
  // Scoped to <main>: the header's Donate button is desktop-only (hidden below `lg`).
  await expect(page.locator('main a[href="/donate"]').first()).toBeVisible();
});

// PLAN.md §2: phones are the primary target. Checks the project's own viewport and the narrowest common phone.
for (const width of [undefined, 360] as const) {
  test(`home page has no horizontal overflow${width ? ` at ${width}px` : ''}`, async ({ page }) => {
    if (width) await page.setViewportSize({ width, height: 800 });
    // The entrance animations translate content; with reduced motion they are off, so the layout is final at load.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // Compare with the configured viewport, not window.innerWidth: under mobile emulation an overflowing
    // page widens the layout viewport, so innerWidth grows with the overflow and the check would be vacuous.
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(viewportWidth).toBeGreaterThan(0);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
  });
}

test('404 page is served for unknown routes', async ({ page }) => {
  const res = await page.goto('/nope');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});
