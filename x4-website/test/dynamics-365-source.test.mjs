/*
 * What a visitor sees in View Source on the Journey A page (XFO-64).
 *
 * Astro keeps frontmatter comments out of the build but ships HTML comments
 * exactly as they are written. The price block on this page carried a note
 * saying who set the £1,950 price and when, and that note went live in the
 * page source on 12 October 2026. Notes of that kind explain a decision to the
 * next person who edits the file, which is useful in the repository and is
 * nobody's business on a public page, so they belong in the frontmatter.
 *
 * This suite covers this page only. Other pages carry the same kind of note --
 * /app-development and the privacy policy both do today -- and cleaning those
 * up, and widening this check to every built page, is its own piece of work.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DIST = join(here, '../dist');

if (!existsSync(DIST)) {
    throw new Error('dist/ is missing. Run `npm run build` first, or use `npm test`, which builds for you.');
}

const html = readFileSync(join(DIST, 'dynamics-365.html'), 'utf8');
const comments = html.match(/<!--[\s\S]*?-->/g) ?? [];

/* The people who work here, as a comment would name them. A visitor should
   meet them on the About page, not in a note about why a number is what it
   is. */
const NAMES = /\b(Ben|Benji)\b/;

/* A written-out date in a comment records when a decision was made inside the
   business. Dates a visitor is meant to read -- a policy's "last updated", for
   instance -- are page content, not comments. */
const DATES = /\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/;

test('the page source carries no internal note', () => {
    assert.ok(comments.length > 0, 'no comments found at all, so this check proves nothing');

    for (const comment of comments) {
        assert.doesNotMatch(comment, NAMES, `one of us is named in the page source: ${comment}`);
        assert.doesNotMatch(comment, DATES, `an internal date is in the page source: ${comment}`);
    }
});

test('the reason for the price is still written down, in the frontmatter', () => {
    /* Taking the note out of the HTML must not lose it. The frontmatter is
       where it went, and frontmatter never reaches the browser. */
    const source = readFileSync(join(here, '../src/pages/dynamics-365.astro'), 'utf8');
    const frontmatter = source.slice(0, source.indexOf('---', 3));

    assert.match(frontmatter, /1,950/, 'the price is not explained anywhere in the frontmatter');
    assert.match(frontmatter, NAMES, 'the frontmatter no longer records who set the price');
});
