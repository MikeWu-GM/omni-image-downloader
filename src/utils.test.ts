import { describe, expect, it } from 'bun:test';

import { getReferralUrl } from './utils.js';

describe('getReferralUrl', () => {
	it('builds referral URLs without a redundant trailing slash', () => {
		expect(
			getReferralUrl('https://cutoutmagic.com/library', {
				url: 'https://example.com/a.jpg',
				utm_content: 'remove_background_button',
			})
		).toBe(
			'https://cutoutmagic.com/library?utm_source=image_downloader&utm_medium=chrome_extension&utm_campaign=internal_referral&url=https%3A%2F%2Fexample.com%2Fa.jpg&utm_content=remove_background_button'
		);

		expect(getReferralUrl('https://cutoutmagic.com', { utm_content: 'about_page' })).toBe(
			'https://cutoutmagic.com/?utm_source=image_downloader&utm_medium=chrome_extension&utm_campaign=internal_referral&utm_content=about_page'
		);
	});
});

describe('sanitizeFolderName', () => {
	it('replaces illegal filesystem characters with underscores', () => {
		// @ts-ignore
		const { sanitizeFolderName } = require('./utils.js');
		expect(sanitizeFolderName('GitHub: PactInteractive/image-downloader?*<>|')).toBe(
			'GitHub_PactInteractive_image-downloader'
		);
	});

	it('trims leading and trailing dots, spaces, and separators', () => {
		// @ts-ignore
		const { sanitizeFolderName } = require('./utils.js');
		expect(sanitizeFolderName('  ...---my_cool_folder---...  ')).toBe('my_cool_folder');
	});

	it('truncates overly long titles to 80 characters', () => {
		// @ts-ignore
		const { sanitizeFolderName } = require('./utils.js');
		const longTitle = 'A'.repeat(120);
		const sanitized = sanitizeFolderName(longTitle);
		expect(sanitized.length).toBeLessThanOrEqual(80);
	});

	it('falls back to hostname when title is empty or invalid', () => {
		// @ts-ignore
		const { sanitizeFolderName } = require('./utils.js');
		expect(sanitizeFolderName('', 'github.com')).toBe('github.com');
		expect(sanitizeFolderName('   :::???***   ', 'github.com')).toBe('github.com');
	});

	it('falls back to "images" when both title and hostname are missing', () => {
		// @ts-ignore
		const { sanitizeFolderName } = require('./utils.js');
		expect(sanitizeFolderName('')).toBe('images');
		expect(sanitizeFolderName('   ')).toBe('images');
	});
});

describe('generateSourceHtml', () => {
	it('generates an html document with instant meta-refresh redirect and safe title', () => {
		// @ts-ignore
		const { generateSourceHtml } = require('./utils.js');
		const html = generateSourceHtml('https://example.com/gallery', 'My Cool Gallery');
		expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://example.com/gallery">');
		expect(html).toContain('<title>My Cool Gallery</title>');
		expect(html).toContain('href="https://example.com/gallery"');
	});
});
