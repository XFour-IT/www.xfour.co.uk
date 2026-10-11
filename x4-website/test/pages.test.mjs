/*
 * Whole-site checks on the HTML itself.
 *
 * The site is eleven hand-maintained pages with no templating, so the real
 * risk is not broken logic — it is one page drifting out of step with the
 * other ten. That is how the journey tag ended up wrong in XFO-44: the code
 * was right and one page was not. These tests read every page and fail if any
 * of them disagrees with the rest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, '../public');

function htmlFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(full);
        return entry.name.endsWith('.html') ? [full] : [];
    });
}

const pages = htmlFiles(PUBLIC).map((path) => ({
    name: relative(PUBLIC, path),
    html: readFileSync(path, 'utf8')
}));

test('every page is found', () => {
    assert.ok(pages.length >= 11, `expected the whole site, found ${pages.length} pages`);
});

test('no page loads the Microsoft chat widget directly', () => {
    /* The widget sets cookies the moment it loads, so it may only ever be
       injected by consent.js after the visitor agrees. If this fails, someone
       has pasted the Microsoft snippet back into a page. */
    const offenders = pages
        .filter((p) => /<script[^>]*Microsoft_Omnichannel_LCWidget/.test(p.html))
        .map((p) => p.name);
    assert.deepEqual(offenders, [], 'these pages load the chat without consent');
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
    const names = new Set(pages.map((p) => p.name.split('\\').join('/')));
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
    const privacy = pages.find((p) => p.name.endsWith('privacy.html')).html;
    assert.doesNotMatch(privacy, /do not run any website analytics/i);
    assert.match(privacy, /cookieless/i, 'the policy should describe how measurement works');
});

test('the cookie policy names every cookie the site can set', () => {
    const cookies = pages.find((p) => p.name.endsWith('cookies.html')).html;
    for (const name of ['x4_consent', 'cf_clearance', 'MC1', 'MS0']) {
        assert.match(cookies, new RegExp(name), `${name} is not named in the cookie policy`);
    }
});

test('the cookie name in the policy matches the one the code sets', () => {
    const consentJs = readFileSync(join(PUBLIC, 'assets/js/consent.js'), 'utf8');
    const match = consentJs.match(/COOKIE_NAME\s*=\s*'([^']+)'/);
    assert.ok(match, 'could not find the cookie name in consent.js');
    const cookies = pages.find((p) => p.name.endsWith('cookies.html')).html;
    assert.match(cookies, new RegExp(match[1]), 'the policy names a different cookie than the code sets');
});

test('the sitemap lists the cookie policy', () => {
    const sitemap = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8');
    assert.match(sitemap, /legal\/cookies/, 'a published policy page should be indexable');
});
