import { test as base, chromium, type BrowserContext } from '@playwright/test';
import http from 'http';
import type { AddressInfo } from 'net';
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

	test('discovers images in both Current Tab and Current Window modes before target page finishes loading', async ({
		context,
		extensionId,
	}) => {
		const onePixelPng = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
			'base64'
		);
		const stalledResponses: http.ServerResponse[] = [];

		const server = http.createServer((req, res) => {
			if (req.url === '/img-alpha.png' || req.url === '/img-beta.png') {
				res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': onePixelPng.length });
				res.end(onePixelPng);
				return;
			}
			if (req.url === '/stalled-frame') {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.write('<!doctype html><html><body>still streaming...');
				stalledResponses.push(res);
				return;
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(`<!doctype html>
				<html>
					<head><title>Incomplete Gallery Page</title></head>
					<body>
						<img src="/img-alpha.png" alt="alpha" />
						<img src="/img-beta.png" alt="beta" />
						<iframe src="/stalled-frame"></iframe>
					</body>
				</html>`);
		});

		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
		const { port } = server.address() as AddressInfo;
		const targetUrl = `http://127.0.0.1:${port}/gallery`;

		try {
			const targetPage = await context.newPage();
			await targetPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });

			// Confirm page is genuinely still loading (readyState !== 'complete')
			expect(await targetPage.evaluate(() => document.readyState)).not.toBe('complete');

			let [background] = context.serviceWorkers();
			if (!background) {
				background = await context.waitForEvent('serviceworker', { timeout: 10000 });
			}
			const tabInfo = await background.evaluate(async (url) => {
				const tabs = await chrome.tabs.query({});
				const match = tabs.find((t) => t.url === url);
				return match ? { id: match.id, status: match.status } : null;
			}, targetUrl);

			expect(tabInfo?.id).toBeDefined();
			expect(tabInfo?.status).toBe('loading');

			// 1. Verify Current Tab mode discovers both images immediately while page is still loading
			const panelPage = await context.newPage();
			await panelPage.goto(`chrome-extension://${extensionId}/src/SidePanel/index.html?tabId=${tabInfo!.id}`);

			await expect(panelPage.locator('header')).toContainText('2 matching');
			expect(await targetPage.evaluate(() => document.readyState)).not.toBe('complete');

			// 2. Switch to Current Window mode and verify images are also discovered while page is still loading
			await panelPage.getByRole('button', { name: /Current Window/i }).click();
			await expect(panelPage.locator('header')).toContainText('2 matching');
			await expect(panelPage.locator('#images_container')).toContainText('Incomplete Gallery Page');
			expect(await targetPage.evaluate(() => document.readyState)).not.toBe('complete');
		} finally {
			for (const res of stalledResponses) {
				try {
					res.end('</body></html>');
				} catch {}
			}
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});
});
