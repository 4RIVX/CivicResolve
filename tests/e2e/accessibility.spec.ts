import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

type AxeViolation = {
  id: string;
  impact: string | null;
  description: string;
  nodes: Array<{ target: string[]; failureSummary?: string | null }>;
};

declare global {
  interface Window {
    axe: {
      run: (
        context: Document,
        options: { runOnly: { type: 'tag'; values: string[] } }
      ) => Promise<{ violations: AxeViolation[] }>;
    };
  }
}

const publicRoutes = ['/', '/transparency', '/login'];
const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function mockPublicStatistics(page: Page) {
  await page.route('**/api/public/statistics', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        statistics: {
          totalReported: 0,
          reportedCount: 0,
          resolvedCount: 0,
          inProgressCount: 0,
          criticalCount: 0,
          resolutionRate: 0,
          avgResolutionHours: 0,
          byCategory: {},
          byPriority: {},
          byDepartment: {},
          byArea: {},
          monthlyTrends: [],
          updatedAt: new Date().toISOString(),
        },
      }),
    })
  );
}

async function expectNoAxeViolations(page: Page) {
  await page.addScriptTag({ path: path.resolve('node_modules/axe-core/axe.min.js') });
  const { violations } = await page.evaluate(async (tags) => {
    return window.axe.run(document, {
      runOnly: { type: 'tag', values: tags },
    });
  }, wcagTags);
  expect(violations).toEqual([]);
}

test('public routes render in Chromium without WCAG violations on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockPublicStatistics(page);

  for (const route of publicRoutes) {
    await page.goto(route);
    await expect(page.locator('main#main-content')).toBeVisible();
    await expectNoAxeViolations(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${route} should not overflow a 1440px viewport`
    ).toBe(true);
  }
});

test('mobile navigation, language selection, and protected-route redirects work in Chromium', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPublicStatistics(page);
  await page.goto('/');

  const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
  await menuButton.click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', {
    name: 'Transparency',
  }).click();
  await expect(page).toHaveURL(/\/transparency$/);

  const tamilButton = page
    .getByRole('group', { name: 'Language selection' })
    .last()
    .getByRole('button', { name: 'தமிழ்' });
  await tamilButton.click();
  await expect(tamilButton).toHaveAttribute('aria-pressed', 'true');
  await expectNoAxeViolations(page);

  const mobileOverflow = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const overflowingElements = Array.from(document.body.querySelectorAll('*'))
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter(
        (element) =>
          element.right > viewportWidth + 1 ||
          element.left < -1 ||
          element.scrollWidth > element.clientWidth + 1
      )
      .slice(0, 10);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth,
      overflowingElements,
    };
  });
  expect(mobileOverflow.scrollWidth, JSON.stringify(mobileOverflow)).toBeLessThanOrEqual(
    mobileOverflow.viewportWidth
  );

  await page.goto('/citizen/report');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('main#main-content')).toBeVisible();
});
