// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Pages that exist but are not for search: an error state, a maintenance
// state, and the Slay app's privacy policy (deliberately chrome-less, read
// only inside the app, not something to surface in web search). The
// hand-typed sitemap this integration replaces never listed these either.
const EXCLUDED_FROM_SITEMAP = new Set(['/503', '/maintenance', '/legal/slay']);

// Astro builds the site to ./dist, which is what the x4-website Worker serves
// (see wrangler.jsonc). ./public keeps its old job: files in it are copied to
// ./dist as they are, so every asset URL stays exactly where it was.
export default defineConfig({
	site: 'https://www.xfour.co.uk',
	outDir: './dist',
	publicDir: './public',

	// Generated from the actual build output, so it is never stale the way the
	// hand-typed public/sitemap.xml was. Writes sitemap-index.xml plus one or
	// more sitemap-N.xml files; robots.txt points at sitemap-index.xml.
	integrations: [
		sitemap({
			filter: (page) => !EXCLUDED_FROM_SITEMAP.has(new URL(page).pathname),
		}),
	],

	// `file` writes about-us.astro to dist/about-us.html, the same shape the
	// Worker serves today. The default (`directory`) would write
	// dist/about-us/index.html, which makes /about-us redirect to /about-us/.
	// That would change every URL on the site, so it is not used.
	build: { format: 'file' },
	trailingSlash: 'never',

	// Keep the built HTML readable. The pages are small and Cloudflare already
	// compresses them in transit, so minifying only makes the diff unreadable.
	compressHTML: false,
});
