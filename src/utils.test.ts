import { describe, expect, it } from 'bun:test';

import { disambiguateFolderNames, escapeHtml, generateSourceHtml, sanitizeFolderName } from './utils.js';

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

	it('disambiguates identical folder names with numeric suffixes', () => {
		const rawNames = ['Auth Login', 'Auth Login', 'Gallery', 'Auth Login', 'Gallery'];
		const uniqueNames = disambiguateFolderNames(rawNames);
		expect(uniqueNames).toEqual(['Auth Login', 'Auth Login (2)', 'Gallery', 'Auth Login (3)', 'Gallery (2)']);
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

describe('measurePerf & getPerfReport', () => {
	it('records synchronous execution duration and aggregates metrics', () => {
		const { measurePerf, getPerfReport } = require('./utils.js');

		const result = measurePerf('test:sync', () => {
			let sum = 0;
			for (let i = 0; i < 1000; i++) sum += i;
			return sum;
		});

		expect(result).toBe(499500);
		const report = getPerfReport();
		expect(report['test:sync']).toBeDefined();
		expect(report['test:sync'].count).toBe(1);
	});

	it('records asynchronous promise duration and updates window diagnostics', async () => {
		const { measurePerf, getPerfReport } = require('./utils.js');

		const asyncResult = await measurePerf('test:async', async () => {
			await new Promise((r) => setTimeout(r, 15));
			return 'async-done';
		});

		expect(asyncResult).toBe('async-done');
		const report = getPerfReport();
		expect(report['test:async']).toBeDefined();
		expect(report['test:async'].count).toBe(1);
	});
});

describe('dev web server & manifest CSP security boundaries', () => {
	it('declares explicit MV3 extension_pages CSP in manifest.json', async () => {
		const manifest = await import('../manifest.json');
		expect((manifest as any).content_security_policy?.extension_pages).toBe(
			"script-src 'self'; object-src 'none'; base-uri 'none';"
		);
	});

	it('blocks non-loopback Host headers and hidden repository files in scripts/web.ts', async () => {
		const webMod = await import('../scripts/web');
		expect(typeof webMod.handleWebRequest).toBe('function');

		const rebindRes = await webMod.handleWebRequest(
			new Request('http://127.0.0.1:3000/src/Web/index.html', {
				headers: { host: 'evil-rebind.attacker.example:3000' },
			})
		);
		expect(rebindRes.status).toBe(403);

		const gitConfigRes = await (webMod as any).handleWebRequest(
			new Request('http://127.0.0.1:3000/.git/config', {
				headers: { host: '127.0.0.1:3000' },
			})
		);
		expect(gitConfigRes.status).toBe(403);

		const pkgJsonRes = await (webMod as any).handleWebRequest(
			new Request('http://127.0.0.1:3000/package.json', {
				headers: { host: '127.0.0.1:3000' },
			})
		);
		expect(pkgJsonRes.status).toBe(403);

		const okRes = await (webMod as any).handleWebRequest(
			new Request('http://127.0.0.1:3000/', {
				headers: { host: '127.0.0.1:3000' },
			})
		);
		expect(okRes.status).toBe(200);
	});
});
