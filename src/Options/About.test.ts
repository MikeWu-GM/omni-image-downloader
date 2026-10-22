import { beforeEach, describe, expect, it } from 'bun:test';
import html, { render } from '../html.js';
import { mockChrome, mockDOM } from '../test-helpers.js';
import { About } from './About.js';

mockDOM();

describe('About page', () => {
	let container: HTMLElement;

	beforeEach(() => {
		(globalThis as any).chrome = mockChrome();
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	it('renders local-only assets without any external image requests or commercial referral links', () => {
		render(html`<${About} />`, container);

		const images = [...container.querySelectorAll('img')];
		expect(images.length).toBeGreaterThan(0);
		for (const img of images) {
			const src = img.getAttribute('src') || '';
			expect(src.startsWith('http://') || src.startsWith('https://')).toBe(false);
		}

		const commercialLinks = container.querySelectorAll('a[href*="cutoutmagic"], a[href*="gumroad"]');
		expect(commercialLinks.length).toBe(0);
	});
});
