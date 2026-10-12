/*
 * Whole-site checks on the HTML the visitor actually receives.
 *
 * These read ./dist, the output of `astro build`, not the .astro sources. One
 * shared layout makes drift between pages much less likely than it was, but it
 * does not make these checks pointless: a page can still opt out of the layout
 * (maintenance.astro does), pass the wrong prop, or be added by hand. Reading
 * the built HTML also tests the layout itself — if the consent script is
 * dropped from BaseLayout, every page here fails at once, which is what we
 * want.
 *
 * `npm test` builds first (see the pretest script), so dist is never stale.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '../dist');
const PUBLIC = join(here, '../public');

if (!existsSync(DIST)) {
    throw new Error('dist/ is missing. Run `npm run build` first, or use `npm test`, which builds for you.');
}

function htmlFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(full);
        return entry.name.endsWith('.html') ? [full] : [];
    });
}

const pages = htmlFiles(DIST).map((path) => ({
    name: relative(DIST, path).split('\\').join('/'),
    html: readFileSync(path, 'utf8')
}));

test('every page is found', () => {
    assert.ok(pages.length >= 11, `expected the whole site, found ${pages.length} pages`);
});

test('no page loads the Microsoft chat widget directly', () => {
    /* The widget writes to the visitor's device as soon as it loads, so it may
       only ever be injected by consent.js after the visitor agrees. If this
       fails, someone has pasted the Microsoft snippet back into a page or into
       LiveChat.astro. */
    const offenders = pages
        .filter((p) => /<script[^>]*Microsoft_Omnichannel_LCWidget/.test(p.html))
        .map((p) => p.name);
    assert.deepEqual(offenders, [], 'these pages load the chat without consent');
});

/* The one page with no chat slot. It is the Slay app's privacy policy: Apple
   requires that URL, it is read inside the app, and it carries no navigation,
   no footer and no analytics on purpose. */
const NO_CHAT = ['legal/slay.html'];

test('every page offers chat, except the Slay policy', () => {
    /* Four pages used to miss the chat because eleven hand-edited HTML files
       drifted. Ben asked for it everywhere, so the layout gives it to every
       page it builds. This fails if a page loses the slot again, and also if
       the Slay policy gains site chrome its own text says is not there. */
    const withoutChat = pages
        .filter((p) => !p.html.includes('data-x4-livechat'))
        .map((p) => p.name)
        .sort();
    assert.deepEqual(withoutChat, NO_CHAT, 'these pages have no way to reach the chat');
});

test('every page that offers chat has the consent script to gate it', () => {
    const offenders = pages
        .filter((p) => p.html.includes('data-x4-livechat') && !p.html.includes('/assets/js/consent.js'))
        .map((p) => p.name);
    assert.deepEqual(offenders, [], 'these pages have a chat slot but nothing to unlock it');
});

test('consent.js loads before analytics.js on every page that has both', () => {
    /* analytics.js reads window.x4Consent synchronously. Both tags are defer,
       so they run in document order: get the order wrong and a visitor who
       objected is measured anyway. */
    const offenders = pages
        .filter((p) => p.html.includes('/assets/js/analytics.js') && p.html.includes('/assets/js/consent.js'))
        .filter((p) => p.html.indexOf('/assets/js/consent.js') > p.html.indexOf('/assets/js/analytics.js'))
        .map((p) => p.name);
    assert.deepEqual(offenders, [], 'these pages load analytics before consent');
});

test('every page that loads analytics.js also loads consent.js', () => {
    /* The other half of the order check: a page that measures without the
       consent script present can never be switched off by the visitor. */
    const offenders = pages
        .filter((p) => p.html.includes('/assets/js/analytics.js') && !p.html.includes('/assets/js/consent.js'))
        .map((p) => p.name);
    assert.deepEqual(offenders, [], 'these pages measure with no way to object');
});

test('every page that loads consent.js also loads its stylesheet', () => {
    const offenders = pages
        .filter((p) => p.html.includes('/assets/js/consent.js') && !p.html.includes('/assets/css/consent.css'))
        .map((p) => p.name);
    assert.deepEqual(offenders, [], 'these pages would show an unstyled banner');
});

test('every page with a footer offers a way back to the cookie choices', () => {
    /* The choice has to be reversible from any page, which is the second half
       of the XFO-47 acceptance criterion. */
    const withFooter = pages.filter((p) => p.html.includes('class="page-footer'));
    assert.ok(withFooter.length >= 8, `expected the main pages to have footers, found ${withFooter.length}`);

    const offenders = withFooter
        .filter((p) => !p.html.includes('data-x4-consent-open'))
        .map((p) => p.name);
    assert.deepEqual(offenders, [], 'these pages give no way to change a cookie choice');
});

test('the footer legal links point at pages that exist', () => {
    const targets = {
        '/legal/legal': 'legal/legal.html',
        '/legal/privacy': 'legal/privacy.html',
        '/legal/cookies': 'legal/cookies.html'
    };
    const names = new Set(pages.map((p) => p.name));
    for (const [href, file] of Object.entries(targets)) {
        assert.ok(names.has(file), `${href} is linked but ${file} does not exist`);
    }

    const withFooter = pages.filter((p) => p.html.includes('class="page-footer'));
    for (const href of Object.keys(targets)) {
        const offenders = withFooter.filter((p) => !p.html.includes(`href="${href}"`)).map((p) => p.name);
        assert.deepEqual(offenders, [], `these pages are missing the ${href} footer link`);
    }
});

test('the privacy policy no longer claims we run no analytics', () => {
    /* It said exactly that while PostHog was live. Keep the claim from coming
       back if the page is ever edited by hand. */
    const privacy = pages.find((p) => p.name === 'legal/privacy.html').html;
    assert.doesNotMatch(privacy, /do not run any website analytics/i);
    assert.match(privacy, /cookieless/i, 'the policy should describe how measurement works');
});

test('the privacy policy states the retention periods the business confirmed', () => {
    /* Confirmed on 11 October 2026 (XFO-47). These numbers also appear in the
       data protection addendum customers are given; if one is changed without
       the other, the two documents contradict each other. */
    const privacy = pages.find((p) => p.name === 'legal/privacy.html').html;
    assert.match(privacy, /24 months from your last contact/i, 'the enquiry retention period is missing');
    assert.match(privacy, /then 6 years/i, 'the customer retention period is missing');
});

test('the cookie policy names every cookie the site can set', () => {
    const cookies = pages.find((p) => p.name === 'legal/cookies.html').html;
    for (const name of ['x4_consent', 'cf_clearance', 'MC1', 'MS0']) {
        assert.match(cookies, new RegExp(name), `${name} is not named in the cookie policy`);
    }
});

test('the cookie policy declares both analytics tools', () => {
    /* Cloudflare Web Analytics is injected by Cloudflare after our HTML leaves
       the Worker, so it is invisible in this repository and easy to forget. The
       business chose to keep it, so it has to stay declared. */
    const cookies = pages.find((p) => p.name === 'legal/cookies.html').html;
    assert.match(cookies, /PostHog/, 'PostHog is not declared');
    assert.match(cookies, /Cloudflare Web Analytics/, 'Cloudflare Web Analytics is not declared');
});

test('the cookie name in the policy matches the one the code sets', () => {
    const consentJs = readFileSync(join(PUBLIC, 'assets/js/consent.js'), 'utf8');
    const match = consentJs.match(/COOKIE_NAME\s*=\s*'([^']+)'/);
    assert.ok(match, 'could not find the cookie name in consent.js');
    const cookies = pages.find((p) => p.name === 'legal/cookies.html').html;
    assert.match(cookies, new RegExp(match[1]), 'the policy names a different cookie than the code sets');
});

test('the sitemap lists the cookie policy', () => {
    const sitemap = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /legal\/cookies/, 'a published policy page should be indexable');
});
