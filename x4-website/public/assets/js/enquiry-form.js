/**
 * Enquiry forms — client side.
 *
 * Drives every <form data-enquiry-form> on the page:
 *   - fetches the Turnstile site key from /api/form-config
 *   - loads and renders a Turnstile widget per form
 *   - posts to /api/enquiry and shows the success or error state
 *   - fires one analytics event per successful submit, tagged by journey
 *
 * The forms need JavaScript, because Turnstile does. Each form carries a
 * <noscript> block with the phone number and email address so a visitor
 * without JavaScript is never stuck.
 */
(function () {
	'use strict';

	var forms = Array.prototype.slice.call(document.querySelectorAll('[data-enquiry-form]'));
	if (forms.length === 0) return;

	var turnstileReady = null;
	var widgets = new Map();

	init();

	function init() {
		fetch('/api/form-config', { headers: { Accept: 'application/json' } })
			.then(function (response) {
				return response.ok ? response.json() : null;
			})
			.catch(function () {
				return null;
			})
			.then(function (config) {
				var siteKey = config && config.turnstileSiteKey;
				if (!siteKey) {
					// No key means the endpoint is not live yet. Say so plainly
					// rather than offering a button that cannot work.
					forms.forEach(unavailable);
					return;
				}
				forms.forEach(function (form) {
					wire(form, siteKey);
				});
			});
	}

	function unavailable(form) {
		var button = form.querySelector('[type="submit"]');
		if (button) button.disabled = true;
		show(form, 'fallback');
	}

	function wire(form, siteKey) {
		loadTurnstile()
			.then(function () {
				var holder = form.querySelector('[data-turnstile]');
				if (!holder) return;
				// Keep the widget id on the form: there are two forms on the
				// page, and a bare turnstile.reset() would reset both.
				widgets.set(form, window.turnstile.render(holder, { sitekey: siteKey, theme: 'light' }));
				form.addEventListener('submit', function (event) {
					event.preventDefault();
					submit(form);
				});
			})
			.catch(function () {
				unavailable(form);
			});
	}

	function loadTurnstile() {
		if (turnstileReady) return turnstileReady;
		turnstileReady = new Promise(function (resolve, reject) {
			if (window.turnstile) {
				resolve();
				return;
			}
			var script = document.createElement('script');
			script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
			script.async = true;
			script.defer = true;
			script.onload = resolve;
			script.onerror = reject;
			document.head.appendChild(script);
		});
		return turnstileReady;
	}

	function submit(form) {
		var button = form.querySelector('[type="submit"]');
		var original = button ? button.textContent : '';

		clearErrors(form);
		if (button) {
			button.disabled = true;
			button.textContent = 'Sending…';
		}

		fetch('/api/enquiry', {
			method: 'POST',
			headers: { Accept: 'application/json' },
			body: new URLSearchParams(new FormData(form)),
		})
			.then(function (response) {
				return response
					.json()
					.catch(function () {
						return {};
					})
					.then(function (body) {
						return { status: response.status, body: body };
					});
			})
			.then(function (result) {
				if (result.body && result.body.ok) {
					succeed(form);
					return;
				}
				if (result.body && result.body.fields) {
					applyErrors(form, result.body.fields);
					reset(form, button, original);
					return;
				}
				show(form, 'error');
				reset(form, button, original);
			})
			.catch(function () {
				show(form, 'error');
				reset(form, button, original);
			});
	}

	function reset(form, button, original) {
		if (button) {
			button.disabled = false;
			button.textContent = original;
		}
		// A Turnstile token is single use, so the widget needs resetting before
		// the visitor can try again.
		if (window.turnstile && widgets.has(form)) {
			window.turnstile.reset(widgets.get(form));
		}
	}

	function succeed(form) {
		var journey = form.getAttribute('data-journey') || 'unknown';
		show(form, 'success');
		track(journey);
		var success = form.parentNode.querySelector('[data-state="success"]');
		if (success) {
			success.setAttribute('tabindex', '-1');
			success.focus();
		}
	}

	/**
	 * One event per submit, tagged by journey. Guarded so this works whether or
	 * not analytics is installed on the page yet (see XFO-44).
	 */
	function track(journey) {
		try {
			if (window.posthog && typeof window.posthog.capture === 'function') {
				window.posthog.capture('enquiry_submitted', { journey: journey });
			}
			if (window.dataLayer && typeof window.dataLayer.push === 'function') {
				window.dataLayer.push({ event: 'enquiry_submitted', journey: journey });
			}
		} catch (err) {
			/* Analytics must never break the form. */
		}
	}

	/** Swaps which of the form / success / error / fallback blocks is visible. */
	function show(form, state) {
		var wrapper = form.parentNode;
		['success', 'error', 'fallback'].forEach(function (name) {
			var block = wrapper.querySelector('[data-state="' + name + '"]');
			if (block) block.hidden = name !== state;
		});
		form.hidden = state === 'success';
	}

	function clearErrors(form) {
		Array.prototype.forEach.call(form.querySelectorAll('.is-invalid'), function (field) {
			field.classList.remove('is-invalid');
			field.removeAttribute('aria-invalid');
		});
		Array.prototype.forEach.call(form.querySelectorAll('[data-error-for]'), function (holder) {
			holder.textContent = '';
		});
		var error = form.parentNode.querySelector('[data-state="error"]');
		if (error) error.hidden = true;
	}

	function applyErrors(form, fields) {
		var first = null;
		Object.keys(fields).forEach(function (name) {
			var field = form.querySelector('[name="' + name + '"]');
			var holder = form.querySelector('[data-error-for="' + name + '"]');
			if (field) {
				field.classList.add('is-invalid');
				field.setAttribute('aria-invalid', 'true');
				if (!first) first = field;
			}
			if (holder) holder.textContent = fields[name];
		});
		if (first) first.focus();
	}
})();
