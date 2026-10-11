/*
 * A DOM small enough to read and big enough to run assets/js/consent.js and
 * assets/js/analytics.js. There is no build step and no test framework in this
 * repo, and pulling jsdom in for two browser files would cost more than it
 * returns, so this stub covers exactly the DOM those two files touch.
 *
 * It deliberately does NOT emulate a browser. It proves the gate logic: which
 * scripts get created, and what goes in the cookie. Whether the Microsoft
 * widget then behaves has to be checked on the deployed site.
 */

function matches(node, selector) {
    if (selector.charAt(0) === '[') {
        var name = selector.slice(1, -1).split('=')[0];
        return Object.prototype.hasOwnProperty.call(node.attrs, name);
    }
    return node.tagName === selector.toUpperCase();
}

function walk(node, selector, out) {
    for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        if (matches(child, selector)) out.push(child);
        walk(child, selector, out);
    }
    return out;
}

export function makeDom(options) {
    options = options || {};

    var created = [];
    var cookieJar = options.cookie || '';
    var listeners = { document: {} };

    function element(tag) {
        var node = {
            tagName: tag.toUpperCase(),
            children: [],
            attrs: {},
            handlers: {},
            className: '',
            id: '',
            textContent: '',
            checked: false,
            parentNode: null,
            setAttribute: function (key, value) {
                this.attrs[key] = String(value);
                if (key === 'id') this.id = String(value);
            },
            getAttribute: function (key) {
                return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
            },
            hasAttribute: function (key) {
                return Object.prototype.hasOwnProperty.call(this.attrs, key);
            },
            appendChild: function (child) {
                this.children.push(child);
                child.parentNode = this;
                return child;
            },
            removeChild: function (child) {
                this.children = this.children.filter(function (c) { return c !== child; });
                child.parentNode = null;
                return child;
            },
            addEventListener: function (type, fn) {
                (this.handlers[type] = this.handlers[type] || []).push(fn);
            },
            focus: function () {},
            querySelector: function (selector) {
                return walk(this, selector, [])[0] || null;
            },
            querySelectorAll: function (selector) {
                return walk(this, selector, []);
            },
            click: function () {
                var self = this;
                (this.handlers.click || []).forEach(function (fn) {
                    fn({ currentTarget: self, target: self, preventDefault: function () {} });
                });
            }
        };
        /* The real consent.js sets node.id directly in one place and
           node.className in another, so both have to be plain properties. */
        created.push(node);
        return node;
    }

    var body = element('body');
    var head = element('head');

    /* Pages that offer live chat carry <div data-x4-livechat>. Pages that do
       not (services, app-development, the legal pages) simply omit it. */
    if (options.livechatMarker) {
        var marker = element('div');
        marker.setAttribute('data-x4-livechat', '');
        body.appendChild(marker);
    }
    if (options.consentOpenLink) {
        var opener = element('a');
        opener.setAttribute('data-x4-consent-open', '');
        body.appendChild(opener);
    }

    var document_ = {
        readyState: 'complete',
        body: body,
        head: head,
        createElement: element,
        /* The banner and panel build sentences out of text nodes mixed with
           links, so the stub needs something appendChild will accept. */
        createTextNode: function (text) {
            var node = element('#text');
            node.textContent = String(text);
            return node;
        },
        getElementById: function (id) {
            return created.filter(function (n) { return n.id === id && n.parentNode; })[0] || null;
        },
        querySelector: function (selector) {
            return walk(body, selector, [])[0] || null;
        },
        querySelectorAll: function (selector) {
            return walk(body, selector, []);
        },
        addEventListener: function (type, fn) {
            (listeners.document[type] = listeners.document[type] || []).push(fn);
        },
        removeEventListener: function () {},
        activeElement: null
    };
    Object.defineProperty(document_, 'cookie', {
        get: function () { return cookieJar; },
        set: function (value) {
            /* Enough of Set-Cookie parsing to keep one named value, which is
               all either script needs. */
            var name = value.split('=')[0];
            var pair = value.split(';')[0];
            var kept = cookieJar.split('; ').filter(function (c) {
                return c && c.split('=')[0] !== name;
            });
            kept.push(pair);
            cookieJar = kept.join('; ');
        }
    });

    var window_ = {
        location: {
            hostname: options.hostname || 'www.xfour.co.uk',
            pathname: options.pathname || '/',
            search: options.search || '',
            protocol: 'https:'
        },
        posthog: options.posthog || null,
        addEventListener: function () {}
    };

    return {
        window: window_,
        document: document_,
        created: created,
        /* Every <script> the code under test appended to the page. */
        scripts: function () {
            return created.filter(function (n) {
                return n.tagName === 'SCRIPT' && n.parentNode;
            });
        },
        chatScript: function () {
            return created.filter(function (n) {
                return n.id === 'Microsoft_Omnichannel_LCWidget' && n.parentNode;
            })[0] || null;
        },
        banner: function () {
            return created.filter(function (n) {
                return n.className === 'x4-consent' && n.parentNode;
            })[0] || null;
        },
        byText: function (text) {
            return created.filter(function (n) { return n.textContent === text; })[0] || null;
        },
        rawCookie: function () { return cookieJar; }
    };
}

export function run(source, dom) {
    /* consent.js and analytics.js are IIFEs that only reach outward for
       `window` and `document`, so passing both in as parameters is enough to
       sandbox them. */
    new Function('window', 'document', source)(dom.window, dom.document);
}
