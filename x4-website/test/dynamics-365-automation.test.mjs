/*
 * The Journey A automation and integration page (XFO-66).
 *
 * The same two kinds of check as the landing page suite, for the same
 * reasons: the page must keep saying what the task asks for, and it must stay
 * in Journey A's language and Journey A's national reach (plan section 1.1a,
 * rules 2, 3 and 6). On top of those, a word floor: the plan sets 600 words
 * for this page, because a page this specific is only found by search if it
 * says enough to be worth finding.
 *
 * Like the other suites here these read ./dist, the HTML the visitor is
 * actually served, and `npm test` builds first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '../dist');
const PUBLIC = join(here, '../public');

// The sitemap is generated at build time (XFO-93), not a file in public/ any
// more, and @astrojs/sitemap can split it across more than one sitemap-N.xml.
function readSitemap() {
    return readdirSync(DIST)
        .filter((name) => /^sitemap-\d+\.xml$/.test(name))
        .map((name) => readFileSync(join(DIST, name), 'utf8'))
        .join('\n');
}

const PAGE = 'dynamics-365/automation-and-integration.html';
const PATH = '/dynamics-365/automation-and-integration';
const OLD_PATH = '/dynamics-365-automation-integration';

if (!existsSync(DIST)) {
    throw new Error('dist/ is missing. Run `npm run build` first, or use `npm test`, which builds for you.');
}

const html = readFileSync(join(DIST, PAGE), 'utf8');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

/* The words a visitor reads: <main> with the styles, scripts and tags taken
   out. */
const words = main
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter((w) => /\w/.test(w));

test('the page is built', () => {
    assert.ok(existsSync(join(DIST, PAGE)), `${PAGE} is missing`);
});

test('it is at least 600 words', () => {
    assert.ok(words.length >= 600, `the plan asks for 600 words or more; the page has ${words.length}`);
});

test('it covers both halves of its title', () => {
    assert.match(main, /What we automate/, 'the automation section is gone');
    assert.match(main, /What we integrate/, 'the integration section is gone');
});

test('it is written for the national search terms', () => {
    /* The terms a Dynamics buyer anywhere in the UK types. Each must be in the
       title or the visible copy, or the page is not written for it. */
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    assert.match(title, /Dynamics 365 Automation and Integration/i, 'the title has lost its main term');
    for (const term of [/Dynamics 365 integration/i, /Power Automate/, /Dataverse/, /Business Central/]) {
        assert.match(main, term, `a target term is missing from the copy: ${term}`);
    }
    assert.match(main, /anywhere in the UK|across the UK/i, 'the page does not say it is national');
});

test('the one call to action is the Microsoft Bookings link, and it still works for a stranger', () => {
    const hrefs = main.match(/href="https:\/\/bookings\.cloud\.microsoft[^"]*"/g) || [];
    assert.ok(hrefs.length >= 1, 'the booking link is gone from the page');
    for (const href of hrefs) {
        assert.match(href, /anonymous/, '?anonymous is missing, so a stranger would be asked to sign in to Microsoft');
    }
    assert.match(main, /data-booking-link/, 'the booking link is not tagged for measurement');
});

test('there is no enquiry form on this page', () => {
    assert.doesNotMatch(main, /<form/i, 'Journey A takes a booking, not a form');
});

test('it does not borrow Journey B’s language', () => {
    for (const phrase of [/response times?/i, /cover hours/i, /per user,? per month/i, /managed IT/i]) {
        assert.doesNotMatch(main, phrase, `managed IT language on a Dynamics page: ${phrase}`);
    }
});

test('it uses no local search terms', () => {
    /* Rule 6. A town on this page is Journey B tactics spent on a Journey A
       page. */
    for (const place of [/Reading/, /Thames Valley/i, /Berkshire/i, /near me/i, /local/i]) {
        assert.doesNotMatch(main, place, `local search language on a national page: ${place}`);
    }
});

test('it publishes only the proof that is cleared', () => {
    /* XFO-43, as on /dynamics-365. */
    for (const name of ['Allseas Shipping Co', 'VisiMedia', 'Selwood Housing']) {
        assert.match(main, new RegExp(name), `${name} should be named here`);
    }
    assert.match(main, /A UK travel loyalty business/i, 'the anonymised client is missing');
    assert.doesNotMatch(main, /IAG/, 'the anonymised client has been named');
    assert.doesNotMatch(main, /91\s*%/, 'the 91% figure is our estimate, not a client result');
});

test('the price matches the landing page', () => {
    /* One price, said the same way on every Journey A page. */
    assert.match(main, /£1,950\s*\+\s*VAT/, 'the readiness check price is missing or has drifted');
    assert.match(main, /exclude VAT/i, 'the VAT position is not stated');
});

test('it is linked from the landing page, and is in the sitemap', () => {
    const landing = readFileSync(join(DIST, 'dynamics-365.html'), 'utf8');
    assert.match(landing, new RegExp(`href="${PATH}"`), '/dynamics-365 does not link here');
    assert.doesNotMatch(landing, new RegExp(`href="${OLD_PATH}"`), '/dynamics-365 still links to the old address');
    assert.match(main, /href="\/dynamics-365"/, 'this page does not link back to the landing page');
    const sitemap = readSitemap();
    assert.match(sitemap, new RegExp(`<loc>https://www\\.xfour\\.co\\.uk${PATH}</loc>`), 'the page is not in the sitemap');
    assert.doesNotMatch(sitemap, new RegExp(OLD_PATH), 'the sitemap still lists the old address');
});

test('the old flat address redirects here', () => {
    /* The page went live at /dynamics-365-automation-integration first, so
       links and search results may still point there. */
    const redirects = readFileSync(join(PUBLIC, '_redirects'), 'utf8');
    assert.match(redirects, new RegExp(`^${OLD_PATH}\\s+${PATH}\\s+301$`, 'm'));
    assert.ok(!existsSync(join(DIST, 'dynamics-365-automation-integration.html')), 'the old page is still built');
});

test('analytics counts this page as Journey A', () => {
    /* Every page under /dynamics-365/ is Journey A; see analytics.js. */
    const analytics = readFileSync(join(PUBLIC, 'assets/js/analytics.js'), 'utf8');
    assert.match(analytics, /'\/dynamics-365\/'\) !== -1\) return 'dynamics-365'/, 'pages under /dynamics-365 fall back to "other"');
});

test('the page source carries no internal note', () => {
    /* Astro ships HTML comments to the browser. See dynamics-365-source.test.mjs. */
    const comments = html.match(/<!--[\s\S]*?-->/g) ?? [];
    for (const comment of comments) {
        assert.doesNotMatch(comment, /\b(Ben|Benji)\b/, `one of us is named in the page source: ${comment}`);
        assert.doesNotMatch(comment, /XFO-\d+/, `an internal task id is in the page source: ${comment}`);
    }
});
