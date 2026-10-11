// @ts-check
import { defineConfig } from 'astro/config';

// Astro builds the site to ./dist, which is what the x4-website Worker serves
// (see wrangler.jsonc). ./public keeps its old job: files in it are copied to
// ./dist as they are, so every asset URL stays exactly where it was.
export default defineConfig({
	site: 'https://www.xfour.co.uk',
	outDir: './dist',
	publicDir: './public',

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
