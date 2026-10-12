# Enquiry forms → Dynamics 365 Leads

Runbook for the two enquiry forms on `/contact-us` (XFO-46, from Phase 0 / XFO-3).

The code is finished and merged behind configuration. **The endpoint answers
`503 not_configured` until the steps in "Tenant configuration" are done**, which
is deliberate: a form that silently drops a lead is worse than no form.

### Decided 11 October 2026

| Question | Answer |
|---|---|
| Customer Insights – Journeys licence? | No. Keep the Worker. |
| Lead owner | Ben owns both journeys for now |
| Dataverse environment | `https://xfour.crm11.dynamics.com` |
| Turnstile widget | Made — see step 5, nothing left to do |
| Review before go-live | On a preview address first — see "Previewing it" |
| Both forms, seen on the preview address | Approved by Ben, 11 Oct 2026 |
| Who does the four tenant jobs | Ben, then sends the values back |
| The five values | Received 12 Oct 2026 and set in `wrangler.jsonc` |

| Both runtime secrets, Assign on Lead | Done by Ben, 12 Oct 2026 |
| Acknowledgement + task flow | A solution file Ben imports — see below |

| Read and Write on Lead, flow imported and on | Done by Ben, 12 Oct 2026 |

| Create and Assign on Lead at Business Unit | Done by Ben, 12 Oct 2026 |

State on 12 Oct 2026, 23:00:

- Both forms are **live on www.xfour.co.uk**, deployed from this branch by
  accident on 12 Oct (a dashboard Deploy picked up the branch's latest upload).
  Ben decided to keep them live. The next deploy of `main` removes them again
  until this branch is merged.
- The test submissions at 22:45 and 22:46 got past Create and were then
  **refused by Dataverse** with `does not have ReadAccess right(s) for record
  … of entity Lead. Consider assigning a role with the level BusinessUnitLevel`.
  A create that names another owner makes Dataverse assign the new Lead, and
  the assign checks Read on it at Ben's scope. Read at Business Unit would let
  a leaked secret read every Lead, so the design changed instead: the Worker no
  longer sets the owner, and the flow (version 1.0.0.1 on) hands each Lead to
  its owner. See step 2 and "Acknowledgement email and the follow-up task".
- 1.0.0.1 imported on 12 Oct but **would not turn on**: one step description
  was 260 characters and Power Automate allows 256. The import log still says
  "Processed", and the upgrade switched the flow **off**. 1.0.0.2 fixes the
  description, and `pack.mjs` now refuses any description over 256.
- To finish: Ben imports `XFourWebsiteEnquiries_1_0_0_2.zip` over the existing
  solution and checks the flow is **On**, this branch is deployed, then one
  test submission on each form.
- Ben may merge this branch once a test Lead lands with the right source and
  owner.

---

## What to send back, and what never to send

Five values come back. **None of them is a secret**, so the task thread is a
fine place for them:

| # | Value | Where it comes from | Goes into |
|---|---|---|---|
| 1 | Directory (tenant) ID | Entra app registration, Overview | `ENTRA_TENANT_ID` |
| 2 | Application (client) ID | Entra app registration, Overview | `ENTRA_CLIENT_ID` |
| 3 | Integer value of `Web — Dynamics 365` | Lead Source choice, step 3 | `LEAD_SOURCE_DYNAMICS` |
| 4 | Integer value of `Web — Managed IT` | Lead Source choice, step 3 | `LEAD_SOURCE_MANAGED_IT` |
| 5 | Ben's systemuser GUID | Dynamics user record, step 4 | the flow's `Owner for this journey` step |

The **client secret is the one thing that must not come back.** Do not put it in
the task thread, in an email, or in the repo. Ben puts it straight into
Cloudflare himself, where the Worker reads it and nobody else can:

1. Cloudflare dashboard → Workers & Pages → **x4-website** → Settings.
2. The **Variables and Secrets** section near the top of the page → Add → type
   **Secret**.
3. Name `ENTRA_CLIENT_SECRET`, value the secret from the app registration.
   Click **Deploy**.

**Not** the "Variables and secrets" box inside the **Build** section further
down the same page. That one is only handed to `npm ci` / `wrangler` while a
push is being built; the running Worker never sees it, so the form keeps
answering 503. The two boxes have the same name, which is an easy trap.

To check it landed: after saving, the top Variables and Secrets list shows
`ENTRA_CLIENT_SECRET` with type Secret and a hidden value.

A Worker secret is encrypted, is never shown again in the dashboard, and
survives later deploys, because it is not in `wrangler.jsonc`. The CLI
equivalent is `npx wrangler secret put ENTRA_CLIENT_SECRET`; either is fine.

Order does not matter. `POST /api/enquiry` needs `DATAVERSE_URL`,
`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` all present, and
answers `503 not_configured` while any one of them is blank — so a half-finished
configuration shows the "call us instead" message rather than losing a lead.
Values 3, 4 and 5 are not part of that check: without them the Lead is still
created, it just has no source and the default owner.

---

## What was built

| | Journey A — Dynamics 365 | Journey B — Managed IT |
|---|---|---|
| Anchor | `/contact-us#dynamics-365` | `/contact-us#managed-it` |
| Primary action | The live Microsoft Bookings link | The quote form itself |
| `journey` value posted | `dynamics` | `managed-it` |
| Lead subject | `Dynamics 365 enquiry — {company}` | `Managed IT quote — {company}` |
| Lead source | `LEAD_SOURCE_DYNAMICS` | `LEAD_SOURCE_MANAGED_IT` |
| Lead owner | Set by the flow, `Owner for this journey` | Set by the flow, `Owner for this journey` |

Files:

- `x4-website/src/index.js` — the Worker. `POST /api/enquiry` and `GET /api/form-config`.
- `x4-website/public/assets/js/enquiry-form.js` — client side.
- `x4-website/src/pages/contact-us.astro` — both forms.
- `x4-website/wrangler.jsonc` — the non-secret configuration.

Spam defence is a honeypot field plus Cloudflare Turnstile, with validation
repeated server side. Nothing the browser sends is trusted.

## Why a Worker and not a Dynamics form embed

The plan asked us to check the native Dynamics 365 Marketing / Customer Insights
– Journeys form embed first. The live chat widget proves the tenant has Sales /
Customer Service with Omnichannel; it does **not** prove Customer Insights –
Journeys, which is a separate licence. A Marketing embed would also drop
Microsoft's own markup into the page, which will not match the rest of the site.

So: a small Worker endpoint posting to the Dataverse Web API. No new vendor, no
new data processor in the privacy policy, and full control of the markup.

**If the tenant does already have a Customer Insights – Journeys licence, say so
and we will revisit** — the native route needs no code to maintain.

---

## Tenant configuration

Five jobs. All of them need somebody with tenant admin and a Dynamics system
administrator role, which is why they were not in PR #23.

### 1. Register the application in Entra ID

1. Entra admin centre → App registrations → New registration.
   - Name: `XFour website enquiry forms`
   - Single tenant. No redirect URI — this is a daemon, not a sign-in.
2. Note the **Application (client) ID** and the **Directory (tenant) ID**.
3. Certificates & secrets → New client secret. Copy the value once; it is never
   shown again. Put it straight into Cloudflare as described in "What to send
   back" — not into the task thread. Put a diary note in for the expiry date,
   because the forms stop working the day it expires.

No API permissions are needed here. Dataverse access comes from the application
user in step 2, not from a delegated or application permission grant.

### 2. Create the application user in Dynamics

1. Power Platform admin centre → Environments → the XFour production
   environment → Settings → Users + permissions → Application users → New.
2. Pick the app registration from step 1.
3. Give it a security role that can **create Lead only**. Do not give it System
   Administrator. Create a role named `Website enquiry form` with **Create**,
   **Read** and **Write** on the Lead entity, all at **User** scope (the
   smallest circle), and nothing else.

Why the Worker does not set the owner: a create that names another owner makes
Dataverse assign the new Lead to them, and that assignment checks the app
user's Read and Write on the Lead at the new owner's scope. On 12 Oct 2026 the
live forms were refused, one privilege at a time: first `missing prvReadLead`,
then `CreateAccess … BusinessUnitLevel`, then `ReadAccess … BusinessUnitLevel`.
Read at Business Unit would let a leaked secret read every Lead in the CRM. So
the Worker creates the Lead owned by its own app user, and the flow hands it to
the journey's owner straight after.

Why Read and Write at all, when the Worker never reads a Lead back: Dataverse
checks them on the record during a create. At User scope they cover only Leads
the app user owns, and it owns each Lead only for the seconds before the flow
hands it on.

Why that is still safe: if the client secret ever leaked, the worst an attacker
could do is create junk leads. They could not list or read any real Lead.

Create and Assign were set to **Business Unit** on 12 Oct 2026, before this
change. That is harmless: Create only makes new Leads, and Assign needs Read on
the Lead, which stays at User. They can be put back to User (and Assign
removed) at any time; nothing needs them now.

If a submission is refused, read the `enquiry_dataverse_failed` line in the
Worker log before widening anything.

### 3. Add the two Lead Source option set values

Lead Source (`leadsourcecode`) has no web values out of the box.

1. Power Apps → Tables → Lead → Columns → `Lead Source` → Edit → add:
   - `Web — Dynamics 365`
   - `Web — Managed IT`
2. Note the **integer value** of each new choice. They go in `wrangler.jsonc`.

These are optional to the code — if they are left blank the lead still arrives
and the journey is still in the subject line and the description. But without
them the two pipelines cannot be reported separately, which was the whole point
of building two forms.

### 4. Decide the two owners — done

**Ben owns both journeys for now** (11 Oct 2026). His systemuser GUID
(Dynamics → Settings → Users → his record → `id=` in the address bar) is in the
flow's **Owner for this journey** step, once per journey. To give a journey to
somebody else, change that GUID in the flow; the Worker does not change.

### 5. Create the Turnstile widget — done

Made on 11 Oct 2026 in the XFour IT Limited Cloudflare account.

- Name: `xfour.co.uk enquiry forms`
- Mode: Managed
- Hostnames: `xfour.co.uk`, `www.xfour.co.uk`, `x4-website.xfour.workers.dev`,
  `x4-website-preview.xfour.workers.dev`
- Site key: `0x4AAAAAAFT_mDl3N3uC7M63` — already in `wrangler.jsonc`, public by
  design

The **secret key** is only in the Cloudflare dashboard (Turnstile → the widget →
Settings). Set it on the production Worker the same way as
`ENTRA_CLIENT_SECRET` — the top **Variables and Secrets** box, type Secret, name
`TURNSTILE_SECRET_KEY` — or from the CLI:

```bash
cd x4-website
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Without it both forms answer 503 and show "call us instead", even with every
Dynamics value in place.

It is already set on the preview Worker.

---

## Setting the configuration

Non-secret values go in `x4-website/wrangler.jsonc` under `vars` and are
committed:

```jsonc
"vars": {
  "DATAVERSE_URL": "https://xfour.crm11.dynamics.com",   // done
  "ENTRA_TENANT_ID": "...",                              // step 1
  "ENTRA_CLIENT_ID": "...",                              // step 1
  "TURNSTILE_SITE_KEY": "0x4AAAAAAFT_mDl3N3uC7M63",      // done
  "LEAD_SOURCE_DYNAMICS": "...",                         // step 3
  "LEAD_SOURCE_MANAGED_IT": "..."                        // step 3
}
```

`DATAVERSE_URL` must have no trailing slash. It is the environment URL from the
Power Platform admin centre, not the `omnichannelengagementhub.com` URL used by
the chat widget.

The two secrets are set with Wrangler and **must never be written into the
repo**:

```bash
cd x4-website
npx wrangler secret put ENTRA_CLIENT_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
```

For local development, put the same two in `x4-website/.dev.vars`, which is
git-ignored.

---

## Acknowledgement email and the follow-up task

These are deliberately **not** in the Worker. Both are done in one Power Automate
flow, **Web enquiry - acknowledge and create follow-up task**, which lives in
this repo as a Power Platform solution: `dynamics/website-enquiries/`.

Why not in the Worker: sending from a real mailbox through the Worker would need
`Mail.Send` application permission on the app registration, which by default lets
it send as anybody in the tenant. Power Automate avoids that and keeps the email
text editable by somebody who is not a developer.

### What the flow does

Trigger: a Lead is **created** with Lead Source `Web — Dynamics 365` or
`Web — Managed IT` (828640001 / 828640002). Any other Lead is ignored.

Then, side by side:

1. **Give the Lead to its owner.** The website creates each Lead owned by its
   own app user (see step 2 for why). The **Owner for this journey** step picks
   the owner by Lead Source, and the Lead is assigned to them. Ben owns both
   for now.
2. **Create the follow-up task.** A Task regarding the Lead, owned by the
   journey's owner, high priority, due **one working day** after the Lead was
   created: Friday +3 days, Saturday +2, any other day +1, on UK time. Bank
   holidays are not skipped. The description repeats the form answers.
3. **Send the acknowledgement** from the `hello@xfour.co.uk` shared mailbox to
   the Lead's email address. The text is fixed and **contains nothing the
   visitor typed** — not even their name. Otherwise anyone could put somebody
   else's address in the form and use it to send that person a message of
   their choosing from hello@.

If the email fails, the task subject is changed to start
`NO ACKNOWLEDGEMENT SENT - reply by hand`, and the run is marked failed. If
the task cannot be created, or the Lead cannot be given to its owner, the run
is marked failed. Power Automate emails the flow owner about failed runs, so no
failure is silent. A Lead that was not handed on is still in Dynamics, under
the app user `# XFour website enquiry forms`; assign it by hand.

If the flow is off, Leads still arrive, but they stay with the app user and
nobody gets a task. Ben sees them under **All Leads**, not **My Leads**.

The SLA in the task (one working day) is the promise made by the success
message in `contact-us.astro`. If one changes, change both.

### Building and importing it

```bash
node dynamics/website-enquiries/pack.mjs
```

That checks the parts agree — in particular that the trigger filter names the
same Lead Source values as `LEAD_SOURCE_*` in `wrangler.jsonc`, because a
mismatch imports cleanly and then never fires, and that no step description is
over 256 characters, because that also imports cleanly and then will not turn
on — and writes
`dynamics/website-enquiries/dist/XFourWebsiteEnquiries_1_0_0_2.zip`.

Before importing, the account that will own the flow needs **Send As** on the
`hello@xfour.co.uk` mailbox: Exchange admin centre → Recipients → Mailboxes →
hello@ → Delegation → Send as → add the account. It can take up to an hour to
work.

1. make.powerapps.com → pick the XFour environment (the one at
   `xfour.crm11.dynamics.com`) → **Solutions** → **Import solution**.
2. Browse to the zip → Next → Import.
3. It asks for two connections. For **XFour website enquiries - Dataverse**,
   pick or create a Microsoft Dataverse connection. For **XFour website
   enquiries - Outlook (sends as hello@)**, pick or create an Office 365
   Outlook connection, signed in as the account that has Send As on hello@.
4. When the import finishes, open the solution → the flow → **Turn on**. It is
   imported switched off on purpose.

To update it (for example 1.0.0.1 → 1.0.0.2), import the new zip the same way.
Power Apps sees the higher version and offers **Upgrade**; keep the default. It
reuses the existing connections. Check the flow is still **On** afterwards.
An upgrade switches the old version off before it turns the new one on, so if
the new one fails to turn on, no version is running. The import log
(Solutions → History → the import → Download log) shows why in the
"Workflow Activation" row, even when the import itself says "Processed".

It is an unmanaged solution, so the flow can be edited in the designer
afterwards. If you change it there, export the solution and unpack it over
`src/`, so the repo does not drift from what runs.

The new publisher is `XFour website` (prefix `xfw`). It is separate from the
publisher that owns the Lead Source values, and nothing else uses it.

---

## Analytics

XFO-44 has landed, so this is live now rather than waiting.

Two events per enquiry, which is deliberate:

| Event | Fired by | When |
|---|---|---|
| `form_submit` | `analytics.js` | Every submit **attempt** |
| `enquiry_submitted` | `enquiry-form.js` | Only a **successful** submit |

Attempts minus successes is the drop-off, which is the number worth watching.
Both carry the journey. Both forms carry a `data-form-name`
(`enquiry-dynamics`, `enquiry-managed-it`), which is what `analytics.js` reads,
so neither reports as `unnamed`.

`enquiry-form.js` also does a guarded `dataLayer.push`, which does nothing today
and means no code change if a tag manager is ever added.

Note that `analytics.js` only reports from `www.xfour.co.uk` and `xfour.co.uk`,
so preview submissions stay out of the numbers. Add `?x4analytics=test` to a
preview URL to force reporting on.

---

## Previewing it

**https://x4-website-preview.xfour.workers.dev/contact-us**

The review address, put up on 11 Oct 2026 so both forms can be seen before
anything reaches xfour.co.uk. It is the `x4-website-preview` Worker in the same
Cloudflare account, and it is a throwaway — delete it once the forms are live.

What is real on it:

- `src/index.js` from this branch, byte for byte. Same handler, same validation,
  same honeypot, same origin allowlist.
- Both forms and `enquiry-form.js` from this branch.
- Turnstile, against the live widget.

What is different:

- Static files come from the `xfour-preview-assets` KV namespace rather than the
  Workers asset server, because this Worker was uploaded over the API and has no
  asset bundle. Every page is served from that namespace, so the whole branch can
  be clicked through, not only `/contact-us`.
- `TURNSTILE_SECRET_KEY` is set on it. The Dataverse vars are not, so a
  submission that passes Turnstile gets the same `503 not_configured` the live
  site would give today, and the form shows its "call us instead" message. **A
  preview submission cannot create a Lead.** That needs the four jobs above.
- Every response carries `X-Robots-Tag: noindex, nofollow` and `robots.txt`
  disallows everything, so the preview cannot show up in search results next to
  the real site.

To rebuild it after a change, or to tear it down, the Worker, the KV namespace
and the Turnstile hostname entry are all in the XFour IT Limited Cloudflare
account.

### Why not the Workers Builds preview URL

The README is right that every branch push uploads a Worker version with its own
preview URL, and that is the usual way to review a change here. It is not enough
on its own for these forms, for two reasons:

- **The hostname changes on every push.** Workers Builds names a stable alias
  after the branch, but `feature/enquiry-forms` has a slash in it and gets none,
  so the only address is `<version-prefix>-x4-website.xfour.workers.dev`, which
  is a new link after every commit.
- **Turnstile only answers on a hostname that is on the widget.** The stable
  preview address is on it. A per-version hostname is not, so the widget refuses
  to render there and neither form can be submitted.

Both preview kinds now pass the origin check: the Worker allows any host under
`.xfour.workers.dev` rather than a fixed list, because nobody outside this
account can create one.

## Testing it

Locally:

```bash
cd x4-website
npm install
npx wrangler dev
```

Then `http://localhost:8787/contact-us`. With no Turnstile site key set, both
forms show the "not available right now" fallback — that is the configured-off
behaviour working.

Once configured, the acceptance test from the plan is:

1. Submit the Dynamics form. A Lead appears with source `Web — Dynamics 365`,
   the right owner, and the answers in the description.
2. Submit the Managed IT form. Same, with source `Web — Managed IT`, the other
   owner, and the user count in `Number of Employees`.
3. The acknowledgement email arrives at the address used.
4. The follow-up task exists against each lead with the right due date.
5. The analytics event fires once per submit with the right `journey`.

Worker logs are in the Cloudflare dashboard (observability is on). Useful lines:
`enquiry_lead_created`, `enquiry_dataverse_failed`, `enquiry_turnstile_rejected`,
`enquiry_honeypot_tripped`, `enquiry_not_configured`.

---

## Known limits, worth a follow-up

- **A failed Dataverse write loses the enquiry.** The visitor is told to call or
  email, and the failure is logged, but nothing holds the submission for a retry.
  A Queue or a KV write before the Dataverse call would fix this. Not Phase 0.
- **No rate limit beyond Turnstile.** If junk ever gets through, add a Cloudflare
  rate limiting rule on `/api/enquiry` rather than writing counting code.
- **The Bookings link is shared** with `/app-development`, so a Dynamics scoping
  call and an app build review land in the same calendar.
