/*
 * Website measurement for www.xfour.co.uk — PostHog, EU region, cookieless.
 *
 * The site sets no cookie and writes nothing to localStorage: persistence is
 * "memory" and the visitor id comes from PostHog's stateless server-side hash.
 * That keeps us off the consent-banner critical path. When the banner ships,
 * switch persistence to "localStorage+cookie" for visitors who accept.
 *
 * Conversion events live at the bottom of this file. Add new ones there rather
 * than inline in the pages, so all 11 pages keep sharing one script.
 */
(function () {
    'use strict';

    var PROJECT_KEY = 'phc_uqVq6egcqrUDUzNS4SMYyU96iFHRXHnmTHFP2KSEoShp';
    var API_HOST = 'https://eu.i.posthog.com';
    var LOADER_URL = 'https://eu-assets.i.posthog.com/static/array.js';

    // Only the live site reports. Local dev and worker preview URLs stay out of
    // the numbers. Append ?x4analytics=test to any URL to force reporting on.
    var LIVE_HOSTS = ['www.xfour.co.uk', 'xfour.co.uk'];
    var forced = window.location.search.indexOf('x4analytics=test') !== -1;
    if (!forced && LIVE_HOSTS.indexOf(window.location.hostname) === -1) {
        return;
    }

    /* Which part of the funnel this page belongs to. Registered on every event
       so a lead can be traced back to the journey that produced it. */
    function journeyFor(path) {
        var page = path.replace(/\/+$/, '').split('/').pop() || 'index.html';
        if (page === 'index.html') return 'home';
        if (page === 'app-development.html') return 'app-development';
        if (page === 'services.html') return 'services';
        if (page === 'contact-us.html') return 'contact';
        if (page === 'about-us.html') return 'about';
        if (path.indexOf('/legal/') !== -1) return 'legal';
        return 'other';
    }

    function start() {
        var posthog = window.posthog;
        if (!posthog || typeof posthog.init !== 'function') return;

        posthog.init(PROJECT_KEY, {
            api_host: API_HOST,
            defaults: '2025-05-24',
            persistence: 'memory',
            respect_dnt: true,
            person_profiles: 'identified_only',
            capture_pageview: true,
            capture_pageleave: true,
            disable_session_recording: true,
            disable_surveys: true,
            loaded: function (ph) {
                ph.register({
                    journey: journeyFor(window.location.pathname),
                    page_path: window.location.pathname
                });
            }
        });

        trackConversions(posthog);
    }

    function capture(posthog, name, props) {
        props = props || {};
        props.page_path = window.location.pathname;
        props.journey = journeyFor(window.location.pathname);
        posthog.capture(name, props);
    }

    function linkText(el) {
        return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    }

    function trackConversions(posthog) {
        /* One delegated listener, so links added to a page later are covered
           without touching this file. */
        document.addEventListener('click', function (event) {
            var link = event.target && event.target.closest && event.target.closest('a[href]');
            if (!link) return;

            var href = link.getAttribute('href') || '';

            if (href.indexOf('tel:') === 0) {
                capture(posthog, 'phone_click', {
                    phone_number: href.slice(4),
                    link_text: linkText(link)
                });
                return;
            }

            if (href.indexOf('mailto:') === 0) {
                capture(posthog, 'email_click', {
                    email_address: href.slice(7).split('?')[0],
                    link_text: linkText(link)
                });
                return;
            }

            if (link.hasAttribute('data-booking-link') || href.indexOf('bookings.cloud.microsoft') !== -1) {
                capture(posthog, 'booking_click', {
                    link_text: linkText(link)
                });
                return;
            }

            // Any other link off the site — App Store badge, partner links.
            if (/^https?:\/\//.test(href) && link.hostname && link.hostname !== window.location.hostname) {
                capture(posthog, 'outbound_click', {
                    target_host: link.hostname,
                    target_url: href,
                    link_text: linkText(link)
                });
            }
        }, true);

        /* Ready for the enquiry forms. Give each form a data-form-name and its
           submits are counted, tagged by the journey that produced them. */
        document.addEventListener('submit', function (event) {
            var form = event.target;
            if (!form || form.tagName !== 'FORM') return;
            capture(posthog, 'form_submit', {
                form_name: form.getAttribute('data-form-name') || form.getAttribute('name') || 'unnamed'
            });
        }, true);
    }

    var loader = document.createElement('script');
    loader.src = LOADER_URL;
    loader.async = true;
    loader.crossOrigin = 'anonymous';
    loader.onload = start;
    document.head.appendChild(loader);
})();
