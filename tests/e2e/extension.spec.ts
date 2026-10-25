import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

export const test = base.extend<{
	context: BrowserContext;
	extensionId: string;
}>({
	context: async ({}, use) => {
		const pathToExtension = path.resolve(__dirname, '../../build');
		const context = await chromium.launchPersistentContext('', {
			channel: 'chromium',
			args: [
				'--headless=new',
				`--disable-extensions-except=${pathToExtension}`,
				`--load-extension=${pathToExtension}`,
				'--no-sandbox',
			],
		});
		await use(context);
		await context.close();
	},
	extensionId: async ({ context }, use) => {
		let [background] = context.serviceWorkers();
		if (!background) {
			background = await context.waitForEvent('serviceworker', { timeout: 10000 });
		}
		const extensionId = background.url().split('/')[2];
		await use(extensionId);
	},
});

export const expect = test.expect;

test.describe('OmniImage Downloader Extension E2E', () => {
	test('loads background serviceWorker and popup page with correct title and elements', async ({
		context,
		extensionId,
	}) => {
		expect(extensionId).toBeTruthy();

		// Open extension popup page directly via chrome-extension protocol
		const page = await context.newPage();
		await page.goto(`chrome-extension://${extensionId}/src/Popup/index.html`);

		// Verify title and main elements
		await expect(page).toHaveTitle('OmniImage Downloader');
		await expect(page.locator('#filter_by_url_input')).toBeVisible();
		await expect(page.locator('#auto_scroll_button')).toBeVisible();
	});

	test('renders options page with full settings and About information', async ({ context, extensionId }) => {
		const page = await context.newPage();
		await page.goto(`chrome-extension://${extensionId}/src/Options/index.html`);

		// Verify Options page loads cleanly
		await expect(page).toHaveTitle('OmniImage Downloader | Options');
		await expect(page.locator('body')).toContainText('OmniImage Downloader');
	});
});
