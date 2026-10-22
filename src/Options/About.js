// @ts-check
import { ExternalLink } from '../components/ExternalLink.js';
import html from '../html.js';

export function About() {
	return html`
		<h1 class="mb-6 flex items-center justify-center gap-2 text-2xl font-bold">
			<img class="h-8 rounded-xl" src="/images/logo.svg" />
			Image Downloader
			<small class="text-slate-400">v${chrome.runtime.getManifest().version}</small>
		</h1>

		<p class="mb-4">
			<b>Image Downloader</b> is a fast, local-only browser extension for browsing, filtering, and bulk-downloading
			images on the web.
		</p>

		<ul class="mb-4 ml-6 list-disc space-y-1">
			<li>100% local execution — no analytics, no tracking, and no external server requests</li>
			<li>Deep extraction across standard DOM, CSS background images, Shadow DOM, and Blob URLs</li>
			<li>Smart deduplication and real-time filtering by dimensions, format, and URL patterns</li>
		</ul>

		<hr class="my-4" />

		<p class="text-sm text-slate-600 dark:text-slate-400">
			Open-source software licensed under the GNU General Public License v3 (GPLv3). Original work Copyright © 2012-2026
			Vladimir Sabev (<${ExternalLink} href="https://github.com/PactInteractive/image-downloader" />); modified and
			hardened in 2026.
		</p>
	`;
}
