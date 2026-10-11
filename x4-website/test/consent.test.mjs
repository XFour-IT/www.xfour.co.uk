/*
 * The acceptance criterion for XFO-47 is one sentence: a first-time visitor
 * sets no non-essential cookie until they choose, and the choice is reversible.
 * These tests hold the gate shut. They are not a substitute for opening the
 * deployed site — see dom-stub.mjs — but they will fail loudly if someone
 * pastes the Microsoft widget back onto a page or flips a default.
 *
 * Run with: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeDom, run } from './dom-stub.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CONSENT_JS = readFileSync(join(here, '../public/assets/js/consent.js'), 'utf8');
const ANALYTICS_JS = readFileSync(join(here, '../public/assets/js/analytics.js'), 'utf8');

const CHAT_HOST = 'oc-cdn-public-gbr.azureedge.net';

/* A page that offers chat, with no stored choice: the state every first-time
   visitor is in. */
function freshChatPage(extra) {
    return makeDom(Object.assign({ livechatMarker: true, consentOpenLink: true }, extra));
}

test('a first-time visitor gets the banner and NO Microsoft chat script', () => {
    const dom = freshChatPage();
    run(CONSENT_JS, dom);

    assert.ok(dom.banner(), 'the banner should be on the page');
    assert.equal(dom.chatScript(), null, 'the chat must not load before a choice is made');
    assert.equal(
        dom.scripts().filter((s) => (s.src || '').includes(CHAT_HOST)).length,
        0,
        'nothing should be fetched from the Microsoft chat CDN'
    );
});

test('a first-time visitor has no cookie set until they choose', () => {
    const dom = freshChatPage();
    run(CONSENT_JS, dom);
    assert.equal(dom.rawCookie(), '', 'showing the banner must not write a cookie');
});

test('Accept stores consent and loads the chat with the right Microsoft config', () => {
    const dom = freshChatPage();
    run(CONSENT_JS, dom);

    dom.byText('Accept').click();

    assert.match(dom.rawCookie(), /x4_consent=/);
    const stored = decodeURIComponent(dom.rawCookie().split('x4_consent=')[1]);
    assert.match(stored, /chat=1/);
    assert.match(stored, /analytics=1/);

    const chat = dom.chatScript();
    assert.ok(chat, 'the chat script should now be on the page');
    assert.equal(chat.src, 'https://' + CHAT_HOST + '/livechatwidget/scripts/LiveChatBootstrapper.js');
    assert.equal(chat.getAttribute('data-org-id'), 'c38508aa-cd24-ef11-8407-0022481a27a4');
    assert.equal(chat.getAttribute('data-app-id'), '30c2ba8d-2037-47e1-99c3-6b9c412ac9d1');
    assert.equal(chat.getAttribute('data-lcw-version'), 'prod');
    assert.equal(
        chat.getAttribute('data-org-url'),
        'https://m-c38508aa-cd24-ef11-8407-0022481a27a4.uk.omnichannelengagementhub.com'
    );
    assert.equal(dom.banner(), null, 'the banner should go away once answered');
});

test('Reject stores a refusal, loads no chat, and also stops measurement', () => {
    const dom = freshChatPage();
    run(CONSENT_JS, dom);

    dom.byText('Reject').click();

    const stored = decodeURIComponent(dom.rawCookie().split('x4_consent=')[1]);
    assert.match(stored, /chat=0/);
    /* A button labelled Reject has to mean what a visitor thinks it means. */
    assert.match(stored, /analytics=0/);
    assert.equal(dom.chatScript(), null);
    assert.equal(dom.banner(), null);
});

test('a returning visitor who accepted gets the chat and no banner', () => {
    const dom = makeDom({ livechatMarker: true, cookie: 'x4_consent=v%3D1%26chat%3D1%26analytics%3D1%26at%3D2026-10-11' });
    run(CONSENT_JS, dom);

    assert.equal(dom.banner(), null, 'do not ask someone who has already answered');
    assert.ok(dom.chatScript(), 'their consent should still load the chat');
});

test('a returning visitor who refused is not asked again and gets no chat', () => {
    const dom = makeDom({ livechatMarker: true, cookie: 'x4_consent=v%3D1%26chat%3D0%26analytics%3D0%26at%3D2026-10-11' });
    run(CONSENT_JS, dom);

    assert.equal(dom.banner(), null);
    assert.equal(dom.chatScript(), null);
});

test('a choice stored against an older category list is asked again, not honoured', () => {
    const dom = makeDom({ livechatMarker: true, cookie: 'x4_consent=v%3D0%26chat%3D1' });
    run(CONSENT_JS, dom);

    assert.ok(dom.banner(), 'a stale choice must not silently opt someone in');
    assert.equal(dom.chatScript(), null);
});

test('pages that do not offer chat never inject it, even with consent', () => {
    /* services, app-development and the legal pages have never had chat. */
    const dom = makeDom({ livechatMarker: false, cookie: 'x4_consent=v%3D1%26chat%3D1%26analytics%3D1' });
    run(CONSENT_JS, dom);

    assert.equal(dom.chatScript(), null, 'no marker on the page means no widget');
});

test('the footer link opens the preferences panel instead of navigating', () => {
    const dom = makeDom({
        livechatMarker: true,
        consentOpenLink: true,
        cookie: 'x4_consent=v%3D1%26chat%3D0%26analytics%3D1'
    });
    run(CONSENT_JS, dom);

    assert.equal(dom.banner(), null, 'the visitor has already chosen');
    const opener = dom.document.querySelector('[data-x4-consent-open]');
    opener.click();

    assert.ok(dom.byText('Your cookie choices'), 'the panel should open');
    assert.ok(dom.byText('Save my choices'), 'and offer to save a new answer');
});

test('the panel can turn chat on after it was refused, which makes the choice reversible', () => {
    const dom = makeDom({
        livechatMarker: true,
        consentOpenLink: true,
        cookie: 'x4_consent=v%3D1%26chat%3D0%26analytics%3D1'
    });
    run(CONSENT_JS, dom);

    dom.document.querySelector('[data-x4-consent-open]').click();

    /* Find the live chat group by its heading, then tick its box. */
    const chatLabel = dom.byText('Live chat');
    const group = chatLabel.parentNode.parentNode;
    const box = group.querySelector('input');
    assert.equal(box.checked, false, 'nothing may be pre-ticked');
    box.checked = true;

    dom.byText('Save my choices').click();

    const stored = decodeURIComponent(dom.rawCookie().split('x4_consent=')[1]);
    assert.match(stored, /chat=1/);
    assert.ok(dom.chatScript(), 'saying yes later must load the chat');
});

test('the panel reports the stored analytics objection without pre-ticking chat', () => {
    const dom = makeDom({ consentOpenLink: true, cookie: 'x4_consent=v%3D1%26chat%3D0%26analytics%3D0' });
    run(CONSENT_JS, dom);

    dom.document.querySelector('[data-x4-consent-open]').click();

    const chatBox = dom.byText('Live chat').parentNode.parentNode.querySelector('input');
    const measureBox = dom.byText('Visit measurement').parentNode.parentNode.querySelector('input');
    assert.equal(chatBox.checked, false);
    assert.equal(measureBox.checked, false, 'a stored objection should show as off');
});

/* ------------------------------------------------- analytics.js interaction */

test('analytics.js does not even fetch PostHog for a visitor who objected', () => {
    const dom = makeDom({ cookie: 'x4_consent=v%3D1%26chat%3D0%26analytics%3D0' });
    run(CONSENT_JS, dom);
    run(ANALYTICS_JS, dom);

    const posthog = dom.scripts().filter((s) => (s.src || '').includes('posthog'));
    assert.equal(posthog.length, 0, 'an objection must stop the request, not just the events');
});

test('analytics.js still measures a visitor who has made no choice', () => {
    const dom = freshChatPage();
    run(CONSENT_JS, dom);
    run(ANALYTICS_JS, dom);

    const posthog = dom.scripts().filter((s) => (s.src || '').includes('posthog'));
    assert.equal(posthog.length, 1, 'cookieless measurement is not gated by the banner');
});

test('analytics.js measures a visitor who accepted', () => {
    const dom = makeDom({ cookie: 'x4_consent=v%3D1%26chat%3D1%26analytics%3D1' });
    run(CONSENT_JS, dom);
    run(ANALYTICS_JS, dom);

    assert.equal(dom.scripts().filter((s) => (s.src || '').includes('posthog')).length, 1);
});

test('analytics.js stays off non-live hosts, so previews do not pollute the numbers', () => {
    const dom = makeDom({ hostname: 'x4-website.pages.dev' });
    run(ANALYTICS_JS, dom);

    assert.equal(dom.scripts().filter((s) => (s.src || '').includes('posthog')).length, 0);
});
