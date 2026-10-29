import { globSync } from 'glob';
import { join, resolve, sep } from 'node:path';

import * as config from './config';

const projectRoot = resolve(__dirname, '..');

const mimeTypes: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
};

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const ALLOWED_WEB_PREFIXES = ['/src/', '/lib/', '/images/', '/build/'];

function isAllowedHostHeader(hostHeader: string | null): boolean {
	if (!hostHeader) return false;
	try {
		const parsed = new URL(`http://${hostHeader}`);
		return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
	} catch {
		return false;
	}
}

function isAllowedWebAssetPath(pathname: string): boolean {
	if (!pathname.startsWith('/')) return false;
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return false;
	}
	const segments = decoded.replace(/\\/g, '/').split('/').filter(Boolean);
	if (segments.some((segment) => segment.startsWith('.'))) return false;
	return ALLOWED_WEB_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function handleWebRequest(request: Request): Promise<Response> {
	if (!isAllowedHostHeader(request.headers.get('host'))) {
		return new Response('Forbidden', { status: 403 });
	}

	const url = new URL(request.url);
	const path = url.pathname === '/' ? '/src/Web/index.html' : url.pathname;
	if (!isAllowedWebAssetPath(path)) {
		return new Response('Forbidden', { status: 403 });
	}

	const shouldServeFromBuild =
		/^\/lib\//.test(path) ||
		config.copy.include.some((pattern) =>
			globSync(pattern, {
				ignore: config.copy.exclude.filter((excludePattern) => excludePattern !== config.style),
			}).includes(path.slice(1))
		);

	const targetPath = resolve(projectRoot, '.' + (shouldServeFromBuild ? `/${config.build}` : '') + path);
	if (!targetPath.startsWith(projectRoot + sep)) {
		return new Response('Forbidden', { status: 403 });
	}

	const file = Bun.file(targetPath);

	if (await file.exists()) {
		console.log(`${request.method} ${url.href} 200`);
		const extension = path.slice(path.lastIndexOf('.'));
		const contentType = mimeTypes[extension] || 'application/octet-stream';

		if (extension === '.html') {
			const injectScripts = `${
				url.searchParams.has('debug')
					? `<script src="/src/Web/lib/eruda.min.js"></script><script>eruda.init()</script>`
					: ''
			}<script src="/src/Web/chrome.shim.js"></script>`;
			const html = (await file.text()).replace('<script', `${injectScripts}<script`);

			return new Response(html, {
				headers: {
					'Content-Type': contentType,
				},
			});
		}

		return new Response(file, {
			headers: {
				'Content-Type': contentType,
			},
		});
	}

	console.log(`${request.method} ${url.href} 404`);
	return new Response('Not Found', { status: 404 });
}

const port = parseInt(process.env.PORT || '') || 3000;
if (import.meta.main) {
	Bun.serve({
		hostname: '127.0.0.1',
		port,
		fetch: handleWebRequest,
	});

	console.log(`Web server running at http://127.0.0.1:${port}`);
}
