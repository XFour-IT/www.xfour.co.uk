/*
 * Journey A: the implementation and migration page (XFO-65).
 *
 * The page exists to give search engines something to find, so the first check
 * is that it still has the words to do it: 600 of its own, inside <main>, not
 * counting the nav and footer every page shares. The rest are the same
 * journey rules the landing page is held to (plan section 1.1a): Journey A's
 * language, no Journey B language, no place names, a booking and not a form,
 * and only the proof that is cleared.
 *
 * Like the other suites here these read ./dist, and `npm test` builds first.
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

const PAGE = 'dynamics-365/implementation-and-migration.html';
const PATH = '/dynamics-365/implementation-and-migration';

if (!existsSync(DIST)) {
    throw new Error('dist/ is missing. Run `npm run build` first, or use `npm test`, which builds for you.');
}

assert.ok(existsSync(join(DIST, PAGE)), `${PAGE} was not built`);

const html = readFileSync(join(DIST, PAGE), 'utf8');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const landing = readFileSync(join(DIST, 'dynamics-365.html'), 'utf8');

/* What a visitor reads: tags, scripts, styles and comments taken out. */
function words(fragment) {
    return fragment
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .split(/\s+/)
        .filter((w) => /[A-Za-z0-9£]/.test(w));
}

test('it has at least 600 words of its own', () => {
    const count = words(main).length;
    assert.ok(count >= 600, `only ${count} words inside <main>; the task asks for 600 or more`);
});

test('it uses the national, intent-led search terms where search engines read them', () => {
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    const h1 = main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
    assert.match(title, /Dynamics 365 Implementation/i, 'the title has lost the search term');
    assert.match(h1, /Dynamics 365 implementation/i, 'the H1 has lost the search term');
    assert.match(main, /Dynamics 365 implementation partner/i);
    assert.match(main, /Dynamics 365 data migration/i);
});

test('it speaks Journey A’s language', () => {
    for (const word of ['licence', 'migration', 'automat', 'reporting']) {
        assert.match(main, new RegExp(word, 'i'), `${word} is missing from the page`);
    }
});

test('it does not borrow Journey B’s language', () => {
    for (const phrase of [/response times?/i, /cover hours/i, /per user,? per month/i]) {
        assert.doesNotMatch(main, phrase, `managed IT language on a Dynamics page: ${phrase}`);
    }
});

test('it is not sold locally', () => {
    for (const place of [/Reading/, /Thames Valley/i, /Berkshire/i]) {
        assert.doesNotMatch(main, place, `a place name on a national page: ${place}`);
    }
});

test('the call to action is the shared Bookings link, the same one the landing page uses', () => {
    const hrefs = main.match(/href="https:\/\/bookings\.cloud\.microsoft[^"]*"/g) || [];
    assert.ok(hrefs.length >= 1, 'the booking link is gone from the page');
    const landingHref = landing.match(/href="https:\/\/bookings\.cloud\.microsoft[^"]*"/)[0];
    for (const href of hrefs) {
        assert.equal(href, landingHref, 'this page books a different slot from the landing page');
        assert.match(href, /anonymous/, '?anonymous is missing, so a stranger would be asked to sign in');
    }
    assert.match(main, /data-booking-link/, 'the booking link is not tagged for measurement');
    assert.doesNotMatch(main, /<form/i, 'Journey A takes a booking, not a form');
});

test('it publishes only the proof that is cleared', () => {
    for (const name of ['Allseas Shipping Co', 'VisiMedia', 'Selwood Housing']) {
        assert.match(main, new RegExp(name), `${name} should be named here`);
    }
    assert.doesNotMatch(main, /IAG/, 'the anonymised client has been named');
    assert.doesNotMatch(main, /91\s*%/, 'the 91% figure is our estimate, not a client result');
});

test('the price it quotes is the published one', () => {
    assert.match(main, /£1,950\s*\+\s*VAT/, 'the readiness check price is missing or has changed');
});

test('the landing page links here, and this page links back', () => {
    assert.match(landing, new RegExp(`href="${PATH}"`), 'the landing page does not link to this page');
    assert.match(main, /href="\/dynamics-365"/, 'no way back to the landing page');
});

test('it is in the sitemap, with its canonical URL', () => {
    const sitemap = readSitemap();
    assert.match(sitemap, new RegExp(`<loc>https://www\\.xfour\\.co\\.uk${PATH}</loc>`));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.xfour\\.co\\.uk${PATH}">`));
});

test('analytics tags it as Journey A', () => {
    const analytics = readFileSync(join(PUBLIC, 'assets/js/analytics.js'), 'utf8');
    assert.match(analytics, /'\/dynamics-365\/'\) !== -1\) return 'dynamics-365'/, 'pages under /dynamics-365 fall back to "other"');
});

test('the page source carries no internal note', () => {
    /* Same rule as the landing page: who decided what, and when, belongs in
       the frontmatter, which never reaches the browser. */
    for (const comment of html.match(/<!--[\s\S]*?-->/g) ?? []) {
        assert.doesNotMatch(comment, /\b(Ben|Benji)\b/, `one of us is named in the page source: ${comment}`);
        assert.doesNotMatch(comment, /\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/, `an internal date is in the page source: ${comment}`);
    }
});
