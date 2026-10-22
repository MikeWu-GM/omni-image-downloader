import { describe, expect, it } from 'bun:test';

import { escapeHtml, generateSourceHtml, sanitizeFolderName } from './utils.js';

describe('escapeHtml', () => {
	it('escapes HTML special characters to prevent XSS injection', () => {
		expect(escapeHtml('<script>alert("xss" & \'1\')</script>')).toBe(
			'&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;1&#39;)&lt;/script&gt;'
		);
	});
});

describe('sanitizeFolderName', () => {
	it('replaces illegal filesystem characters with underscores', () => {
		expect(sanitizeFolderName('GitHub: PactInteractive/image-downloader?*<>|')).toBe(
			'GitHub_PactInteractive_image-downloader'
		);
	});

	it('trims leading and trailing dots, spaces, and separators', () => {
		expect(sanitizeFolderName('  ...---my_cool_folder---...  ')).toBe('my_cool_folder');
	});

	it('truncates overly long titles to 80 characters', () => {
		const longTitle = 'A'.repeat(120);
		const sanitized = sanitizeFolderName(longTitle);
		expect(sanitized.length).toBeLessThanOrEqual(80);
	});

	it('falls back to hostname when title is empty or invalid', () => {
		expect(sanitizeFolderName('', 'github.com')).toBe('github.com');
		expect(sanitizeFolderName('   :::???***   ', 'github.com')).toBe('github.com');
	});

	it('falls back to "images" when both title and hostname are missing', () => {
		expect(sanitizeFolderName('')).toBe('images');
		expect(sanitizeFolderName('   ')).toBe('images');
	});
});

describe('generateSourceHtml', () => {
	it('generates an html document with instant meta-refresh redirect and safe title', () => {
		const html = generateSourceHtml('https://example.com/gallery', 'My Cool Gallery');
		expect(html).toContain('<meta http-equiv="refresh" content="0; url=https://example.com/gallery">');
		expect(html).toContain('<title>My Cool Gallery</title>');
		expect(html).toContain('href="https://example.com/gallery"');
	});

	it('escapes malicious HTML tags in title and url to prevent stored XSS in downloaded source.html', () => {
		const html = generateSourceHtml(
			'https://example.com/?a=1&b="><script>alert(1)</script>',
			'</title><script>alert("xss")</script>'
		);
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
	});

	it('blocks non-http(s) protocols such as javascript: from meta-refresh and link href', () => {
		const html = generateSourceHtml('javascript:alert(document.cookie)', 'Evil Page');
		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('http-equiv="refresh"');
		expect(html).toContain('href="#"');
	});
});
