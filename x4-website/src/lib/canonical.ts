// Shared by BaseLayout and BlogPostLayout, so the canonical URL in <head> and
// the one in a post's JSON-LD can never drift apart.
//
// The build writes about-us.html, but the URL people and search engines use is
// /about-us, so the .html and the index are taken off the end. The home page
// keeps its single trailing slash; no other page has one. This matches the
// URLs the Worker serves today exactly.
export function canonicalUrl(url: URL, site: URL): string {
	const path = url.pathname
		.replace(/\.html$/, '')
		.replace(/\/index$/, '/')
		.replace(/(.)\/+$/, '$1');
	return new URL(path, site).href;
}
