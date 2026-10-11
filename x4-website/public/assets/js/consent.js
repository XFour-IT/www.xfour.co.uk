/*
 * Cookie consent for www.xfour.co.uk.
 *
 * PECR and UK GDPR: nothing beyond a strictly necessary cookie may be set
 * before the visitor chooses. Two things on this site are in scope, and they
 * are in scope for different reasons:
 *
 *   1. The Microsoft Dynamics 365 Omnichannel live chat SETS COOKIES as soon
 *      as it loads. So it must not load until the visitor allows it. This file
 *      owns the widget: the pages no longer carry the Microsoft script tag,
 *      they carry a single <div data-x4-livechat> marker and we inject the
 *      real script here. One copy of the config instead of six.
 *
 *   2. PostHog analytics (assets/js/analytics.js) sets NO cookie and writes
 *      nothing to localStorage — see the comment at the top of that file. It
 *      therefore needs no PECR consent and is not gated behind this banner;
 *      gating it would cost us the numbers and buy no compliance. It is still
 *      declared in the banner text and on /legal/cookies, and a visitor can
 *      object to it from the Manage panel. That objection is what the
 *      "analytics" value in the cookie below records.
 *
 * The one cookie we set before any choice is made is our own x4_consent, which
 * records the choice itself. Storing a preference the visitor asked us to
 * remember is the "strictly necessary" exemption, and it is how we avoid
 * asking the same person on every page.
 *
 * Reject is deliberately the same size and prominence as Accept, and nothing
 * is pre-ticked. Both are ICO requirements, not styling preferences — do not
 * "tidy" the Reject button into a text link.
 */
(function () {
    'use strict';

    var COOKIE_NAME = 'x4_consent';
    var COOKIE_DAYS = 365;
    var VERSION = '1';

    /* Bump this when the categories change. A stored choice from an older
       version is treated as no choice at all, so visitors are asked again
       about anything new rather than silently opted in. */
    var CURRENT_VERSION = '1';

    var CHAT = {
        id: 'Microsoft_Omnichannel_LCWidget',
        primarySrc: 'https://oc-cdn-public-gbr.azureedge.net/livechatwidget/scripts/LiveChatBootstrapper.js',
        /* Microsoft's own documented fallback. The original inline tag reached
           for this via an onerror handler; keeping it means a CDN outage does
           not silently remove our chat channel. */
        fallbackSrc: 'https://ocprodpublicgbrgs.blob.core.windows.net/livechatwidget/scripts/LiveChatBootstrapper.js',
        attrs: {
            'data-app-id': '30c2ba8d-2037-47e1-99c3-6b9c412ac9d1',
            'data-lcw-version': 'prod',
            'data-org-id': 'c38508aa-cd24-ef11-8407-0022481a27a4',
            'data-org-url': 'https://m-c38508aa-cd24-ef11-8407-0022481a27a4.uk.omnichannelengagementhub.com'
        }
    };

    var COOKIE_POLICY_URL = '/legal/cookies';
    var PRIVACY_POLICY_URL = '/legal/privacy';

    /* ---------------------------------------------------------------- state */

    function readCookie(name) {
        var parts = document.cookie ? document.cookie.split(';') : [];
        for (var i = 0; i < parts.length; i++) {
            var pair = parts[i].replace(/^\s+/, '');
            if (pair.indexOf(name + '=') === 0) {
                return decodeURIComponent(pair.slice(name.length + 1));
            }
        }
        return null;
    }

    function writeCookie(name, value, days) {
        var expires = new Date(Date.now() + days * 864e5).toUTCString();
        var cookie = name + '=' + encodeURIComponent(value) +
            '; expires=' + expires +
            '; path=/; SameSite=Lax';
        if (window.location.protocol === 'https:') cookie += '; Secure';
        document.cookie = cookie;
    }

    /* Stored as a short query string rather than JSON so it stays readable in
       devtools and cannot throw on a malformed value. */
    function parseChoice(raw) {
        if (!raw) return null;
        var out = {};
        raw.split('&').forEach(function (pair) {
            var bits = pair.split('=');
            if (bits.length === 2) out[bits[0]] = bits[1];
        });
        if (out.v !== CURRENT_VERSION) return null;
        return {
            chat: out.chat === '1',
            analytics: out.analytics !== '0',
            at: out.at || ''
        };
    }

    function serialiseChoice(choice) {
        return 'v=' + VERSION +
            '&chat=' + (choice.chat ? '1' : '0') +
            '&analytics=' + (choice.analytics ? '1' : '0') +
            '&at=' + new Date().toISOString().slice(0, 10);
    }

    var choice = parseChoice(readCookie(COOKIE_NAME));

    /* --------------------------------------------------------------- effects */

    var chatLoaded = false;

    function loadChat() {
        if (chatLoaded) return;
        /* Nothing to do on pages that do not offer chat (the legal pages and
           the services and app-development pages have never had it). */
        if (!document.querySelector('[data-x4-livechat]')) return;
        chatLoaded = true;

        inject(CHAT.primarySrc, function () {
            /* Primary CDN failed. Remove the dead tag and try the blob store,
               exactly as Microsoft's snippet did. */
            var dead = document.getElementById(CHAT.id);
            if (dead && dead.parentNode) dead.parentNode.removeChild(dead);
            inject(CHAT.fallbackSrc, null);
        });

        function inject(src, onError) {
            var el = document.createElement('script');
            el.id = CHAT.id;
            el.src = src;
            el.async = true;
            Object.keys(CHAT.attrs).forEach(function (key) {
                el.setAttribute(key, CHAT.attrs[key]);
            });
            if (onError) el.onerror = onError;
            document.body.appendChild(el);
        }
    }

    /* Withdrawing chat consent cannot un-set the cookies Microsoft already
       wrote, so say so plainly rather than pretend. We clear what we can see
       and tell the visitor to use their browser for the rest. */
    function describeChatRemoval() {
        return chatLoaded
            ? 'The chat is already running on this page. Reload the page to remove it. ' +
              'Cookies Microsoft has already set stay until they expire or you clear them in your browser.'
            : '';
    }

    /* Report the decision so we can see how many visitors allow chat — that
       number decides whether chat is still a lead channel worth paying for.
       Safe to call before PostHog has loaded: it is simply skipped. */
    function report(action, next) {
        var posthog = window.posthog;
        if (!posthog || typeof posthog.capture !== 'function') return;
        if (!next.analytics) return;
        posthog.capture('consent_choice', {
            consent_action: action,
            consent_chat: next.chat,
            consent_analytics: next.analytics
        });
    }

    function apply(next, action) {
        choice = next;
        writeCookie(COOKIE_NAME, serialiseChoice(next), COOKIE_DAYS);
        window.x4Consent.choice = next;

        /* Report before stopping, so a visitor who objects is not counted, but
           the decision itself still reaches us when they allow measurement. */
        report(action, next);

        /* Stop measuring straight away rather than at the next navigation.
           analytics.js reads our cookie when it loads, so the next page view
           is covered either way; this is about the page the visitor is on when
           they object. Turning measurement back ON can only take effect from
           the next page view, because analytics.js never fetched the PostHog
           loader for someone who had objected — there is nothing here to
           restart. */
        var posthog = window.posthog;
        if (posthog && typeof posthog.opt_out_capturing === 'function' && !next.analytics) {
            posthog.opt_out_capturing();
        }

        if (next.chat) loadChat();
    }

    /* ------------------------------------------------------------------- ui */

    var bannerEl = null;
    var panelEl = null;
    var lastFocus = null;

    function el(tag, attrs, text) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (key) {
            if (key === 'class') node.className = attrs[key];
            else node.setAttribute(key, attrs[key]);
        });
        if (text) node.textContent = text;
        return node;
    }

    function removeBanner() {
        if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
        bannerEl = null;
    }

    function closePanel() {
        if (panelEl && panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
        panelEl = null;
        document.removeEventListener('keydown', onPanelKey);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function onPanelKey(event) {
        if (event.key === 'Escape') closePanel();
    }

    function showBanner() {
        if (bannerEl) return;

        bannerEl = el('div', {
            'class': 'x4-consent',
            role: 'dialog',
            /* Not modal: a visitor can ignore the banner and read the site.
               Saying so stops a screen reader promising a focus trap that is
               not there. The preferences panel below IS modal. */
            'aria-modal': 'false',
            'aria-labelledby': 'x4-consent-title',
            'aria-describedby': 'x4-consent-body'
        });

        var inner = el('div', { 'class': 'x4-consent__inner' });
        inner.appendChild(el('h2', { id: 'x4-consent-title', 'class': 'x4-consent__title' }, 'Cookies on this site'));

        var body = el('p', { id: 'x4-consent-body', 'class': 'x4-consent__body' });
        body.appendChild(document.createTextNode(
            'Our live chat sets cookies in your browser, so we keep it switched off until you say yes. ' +
            'We also count visits in a way that stores nothing on your device and does not identify you — ' +
            'press Reject and we stop that as well. ' +
            'You can change your mind at any time from the footer of any page. '
        ));
        var link = el('a', { href: COOKIE_POLICY_URL }, 'Read our cookie policy');
        body.appendChild(link);
        body.appendChild(document.createTextNode('.'));
        inner.appendChild(body);

        var actions = el('div', { 'class': 'x4-consent__actions' });

        var accept = el('button', { type: 'button', 'class': 'x4-consent__btn x4-consent__btn--accept' }, 'Accept');
        accept.addEventListener('click', function () {
            apply({ chat: true, analytics: true }, 'accept_all');
            removeBanner();
        });

        var reject = el('button', { type: 'button', 'class': 'x4-consent__btn x4-consent__btn--reject' }, 'Reject');
        reject.addEventListener('click', function () {
            /* Reject switches off visit measurement as well as chat, even
               though measurement stores nothing and needs no consent. A button
               labelled "Reject" has to mean what a visitor thinks it means;
               carrying on measuring someone who pressed it would be a bad look
               for a firm that sells IT, whatever the regulation allows. The
               cost is only the small number of visitors who reject. */
            apply({ chat: false, analytics: false }, 'reject_all');
            removeBanner();
        });

        var manage = el('button', { type: 'button', 'class': 'x4-consent__btn x4-consent__btn--manage' }, 'Manage');
        manage.addEventListener('click', function () {
            openPanel(manage);
        });

        actions.appendChild(accept);
        actions.appendChild(reject);
        actions.appendChild(manage);
        inner.appendChild(actions);
        bannerEl.appendChild(inner);
        document.body.appendChild(bannerEl);
    }

    function openPanel(trigger) {
        if (panelEl) return;
        lastFocus = trigger || document.activeElement;

        panelEl = el('div', { 'class': 'x4-consent-panel' });

        var dialog = el('div', {
            'class': 'x4-consent-panel__dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'x4-consent-panel-title'
        });

        dialog.appendChild(el('h2', { id: 'x4-consent-panel-title', 'class': 'x4-consent-panel__title' }, 'Your cookie choices'));

        var current = choice || { chat: false, analytics: true };

        /* 1. Strictly necessary — no control, because there is nothing here a
              visitor could switch off and still have the site remember them. */
        dialog.appendChild(group({
            name: 'Strictly necessary',
            always: true,
            detail: 'One cookie, x4_consent, which remembers the choice you make on this panel for 12 months. ' +
                'Without it we would have to ask you again on every page. It holds no name, no email address and no identifier for you.'
        }));

        /* 2. Live chat — the only real consent decision on this site. Off
              unless the visitor has already said yes. Never pre-ticked. */
        var chatBox = group({
            name: 'Live chat',
            key: 'chat',
            checked: current.chat,
            detail: 'Lets the Microsoft Dynamics 365 Omnichannel chat widget load. It sets its own cookies as soon as it loads, ' +
                'which is why it waits for you. With this off, the chat bubble does not appear and you can reach us by phone or email instead.'
        });
        dialog.appendChild(chatBox);

        /* 3. Analytics — described honestly as an objection, not as consent,
              because it stores nothing on the device and so is outside PECR
              consent. See the file header. */
        var analyticsBox = group({
            name: 'Visit measurement',
            key: 'analytics',
            checked: current.analytics,
            detail: 'Counts page views and clicks on our phone, email and booking links so we can see which pages bring in work. ' +
                'It sets no cookie, writes nothing to your device and does not build a profile of you. ' +
                'Because of that it does not need your permission under the cookie rules — but you can still object, and this switch is how.'
        });
        dialog.appendChild(analyticsBox);

        var note = describeChatRemoval();
        if (note) dialog.appendChild(el('p', { 'class': 'x4-consent-panel__note' }, note));

        var links = el('p', { 'class': 'x4-consent-panel__links' });
        links.appendChild(el('a', { href: COOKIE_POLICY_URL }, 'Cookie policy'));
        links.appendChild(document.createTextNode(' · '));
        links.appendChild(el('a', { href: PRIVACY_POLICY_URL }, 'Privacy policy'));
        dialog.appendChild(links);

        var actions = el('div', { 'class': 'x4-consent-panel__actions' });

        var save = el('button', { type: 'button', 'class': 'x4-consent__btn x4-consent__btn--accept' }, 'Save my choices');
        save.addEventListener('click', function () {
            apply({
                chat: !!chatBox.querySelector('input').checked,
                analytics: !!analyticsBox.querySelector('input').checked
            }, 'save_choices');
            closePanel();
            removeBanner();
        });

        var rejectAll = el('button', { type: 'button', 'class': 'x4-consent__btn x4-consent__btn--reject' }, 'Reject all');
        rejectAll.addEventListener('click', function () {
            apply({ chat: false, analytics: false }, 'reject_all');
            closePanel();
            removeBanner();
        });

        var close = el('button', { type: 'button', 'class': 'x4-consent__btn x4-consent__btn--manage' }, 'Cancel');
        close.addEventListener('click', closePanel);

        actions.appendChild(save);
        actions.appendChild(rejectAll);
        actions.appendChild(close);
        dialog.appendChild(actions);

        panelEl.appendChild(dialog);
        document.body.appendChild(panelEl);
        document.addEventListener('keydown', onPanelKey);
        save.focus();

        function group(opts) {
            var wrap = el('div', { 'class': 'x4-consent-panel__group' });
            if (opts.always) {
                var head = el('div', { 'class': 'x4-consent-panel__head' });
                head.appendChild(el('strong', {}, opts.name));
                head.appendChild(el('span', { 'class': 'x4-consent-panel__always' }, 'Always on'));
                wrap.appendChild(head);
            } else {
                var id = 'x4-consent-' + opts.key;
                var label = el('label', { 'class': 'x4-consent-panel__head', 'for': id });
                var input = el('input', { type: 'checkbox', id: id });
                if (opts.checked) input.checked = true;
                label.appendChild(input);
                label.appendChild(el('strong', {}, opts.name));
                wrap.appendChild(label);
            }
            wrap.appendChild(el('p', { 'class': 'x4-consent-panel__detail' }, opts.detail));
            return wrap;
        }
    }

    /* ----------------------------------------------------------------- boot */

    /* Public handle, so the cookie policy page and the footer link can reopen
       the panel, and so analytics.js can read the objection. */
    window.x4Consent = {
        choice: choice,
        open: function () { openPanel(null); },
        hasChoice: function () { return !!choice; }
    };

    function boot() {
        /* The footer of every page carries a "Cookie choices" link. It points
           at the cookie policy so it still works with JavaScript off, and we
           upgrade it here into a button that opens the panel in place. */
        var openers = document.querySelectorAll('[data-x4-consent-open]');
        for (var i = 0; i < openers.length; i++) {
            openers[i].addEventListener('click', function (event) {
                event.preventDefault();
                openPanel(event.currentTarget);
            });
        }

        if (!choice) {
            showBanner();
            return;
        }
        if (choice.chat) loadChat();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
