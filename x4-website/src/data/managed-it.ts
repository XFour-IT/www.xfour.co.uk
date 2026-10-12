// The managed IT offer: the price, the terms, the response times, what is
// covered and what is not. Journey B, plan section 1.3.
//
// This file is the only place the offer lives. Three pages read it:
//
//   /it-support                 -- the landing page (XFO-67)
//   /it-support/whats-included  -- every item, with where it stops (XFO-68)
//   /it-support/thames-valley   -- the local page (XFO-68)
//
// Before XFO-68 the lists below sat inside it-support.astro. A second page
// that listed the same service from its own copy would drift from the first
// within a month, and the two would then disagree about what a client is
// paying for. So the offer is here once, and a change here changes all three.
//
// ---------------------------------------------------------------------------
// COMMERCIAL TERMS -- CONFIRMED BY BEN ON XFO-67, 12 OCT 2026
//
// Response times, cover hours and contract terms are his answers verbatim.
// The price he did not give as a figure; he gave the method:
//
//   "Calculate the price with at least a 20% margin. Use Microsoft license
//    & A&A pricing to calculate the cost. You've mentioned we do MDM,
//    broadband, etc. but these all come with costs regardless of how many
//    users."
//
// That last sentence is why there are two prices here and not one. Some of
// what we carry scales with headcount (a licence, a backup seat, support
// hours) and some of it does not (a firewall, the Wi-Fi, the circuit, the
// monthly service review). Recovering a fixed cost through a per-user fee
// only works at one company size; it overcharges the 30-person client and
// loses money on the 6-person one. So: a per-user fee and a per-site fee,
// each covering its own kind of cost.
//
// The full build-up, every input rate and the margin check at 5, 15, 30 and
// 50 users is the "Managed IT price build-up" document on XFO-67. The short
// version:
//
//   Per user, per month, direct cost
//     Microsoft 365 Business Premium licence, annual commitment   £16.90
//     Microsoft 365 and endpoint backup                            £2.40
//     RMM agent, at 1.2 devices per user                           £3.00
//     Phishing simulation and security training                    £1.20
//     Password manager                                             £0.90
//     Documentation and ticketing seat                             £1.10
//     Support labour, 0.6 h/user/month at £38/h loaded            £22.80
//     Onboarding, 1 h/user at £38 spread over the 12-month term     £3.17
//                                                                 ------
//                                                                 £51.47  ->  /0.8 = £64.34  ->  £65
//
//   Per site, per month, direct cost
//     Firewall subscription and rule management                   £22.00
//     Switch, Wi-Fi and circuit monitoring                         £9.00
//     Monthly review, reporting, patch QA, restore test, 1.5 h     £57.00
//     Tenant security baseline upkeep, 0.5 h                      £19.00
//     Onboarding, 6 h at £38 spread over the 12-month term        £19.00
//                                                                 ------
//                                                                £126.00  ->  /0.8 = £157.50 -> £160
//
// Two notes on the method, both deliberate:
//
// 1. Margin, not mark-up. Price = cost / 0.8, so 20% of the price is gross
//    margin. That is the stricter of the two readings -- cost x 1.25 rather
//    than cost x 1.2 -- so it clears "at least 20%" either way.
// 2. Business Premium is the licence the costing assumes, because the
//    covered list below promises MDM, MFA and managed antivirus, and
//    Business Premium is what carries Intune, Entra ID P1 and Defender for
//    Business. Choosing a cheaper licence tier does not save money here, it
//    just moves those three lines into the tooling bill.
//
// Rounding up to £65 and £160 holds the margin at 20.8% or better at every
// size from 5 users to 50. The arithmetic is in the document, and it is
// checked at build time by test/it-support.test.mjs.
//
// Two input rates are XFour's, not Microsoft's, and are the ones worth
// arguing with: the £38/hour loaded engineer cost and the 0.6 support hours
// per user per month. They are industry-normal, not measured from our own
// books. Move either and every figure here moves with it -- which is why
// they are constants and not prose.
// ---------------------------------------------------------------------------
export const terms = {
	/** Pounds per user per month + VAT, Microsoft 365 licence included. */
	pricePerUser: 65,
	/** Pounds per user per month + VAT when the client buys its own licences. */
	pricePerUserOwnLicences: 45,
	/** Pounds per month + VAT, per office, for the network and the service review. */
	pricePerSite: 160,
	minimumUsers: 5,
	coverHours: '8am to 6pm, Monday to Friday',
	coverExcludes: 'bank holidays',
	noticePeriod: '30 days',
	minimumTerm: '12 months',
};

/** £65, £1,135 -- so a worked example cannot drift from the headline. */
export const gbp = (amount: number) => `£${amount.toLocaleString('en-GB')}`;

/** The response-time commitment. Written down because the buyer asked for it. */
export const responseTimes = [
	{
		priority: 'The business has stopped',
		meaning: 'Nobody can work. Your email is down, your internet is down, or your main system is unreachable.',
		response: '1 working hour',
	},
	{
		priority: 'One person has stopped',
		meaning: 'One member of staff cannot do their job. A dead laptop, a locked account, a printer nobody can reach.',
		response: '4 working hours',
	},
	{
		priority: 'Everything else',
		meaning: 'It works, but it is wrong or slow. A new starter to set up, a licence to move, a question to answer.',
		response: '1 working day',
	},
];

export interface CoveredItem {
	/** What we do. The landing page shows this line on its own. */
	text: string;
	/**
	 * Where it stops. Shown on /it-support/whats-included next to the item.
	 *
	 * XFO-68: "State the limits also. Do not hide the limits." Every limit here
	 * follows from a term Ben confirmed on XFO-67 or from what the price build-up
	 * does and does not pay for. Nothing here is a new commercial promise. If a
	 * limit cannot be traced to one of those two, it does not belong here --
	 * ask first.
	 */
	limit: string;
}

export interface CoveredGroup {
	icon: string;
	title: string;
	items: CoveredItem[];
}

/** What the per-user and per-office prices cover. Grouped the way the buyer thinks about it. */
export const covered: CoveredGroup[] = [
	{
		icon: 'fas fa-headset',
		title: 'Your people',
		items: [
			{
				text: 'Unlimited support requests by phone, email or chat',
				limit: `Answered in cover hours, ${terms.coverHours}. A request sent at 9pm is picked up at 8am the next working day.`,
			},
			{
				text: 'A named engineer who knows your business, not a queue',
				limit: 'Your engineer takes holidays. When they are away, the person who answers has your records in front of them.',
			},
			{
				text: 'New starters set up, leavers shut off the same day',
				limit: 'The same working day you tell us. The new starter\'s laptop is hardware and is paid for separately.',
			},
			{
				text: 'Password resets, account lockouts and licence changes',
				limit: 'Each new person adds one user to your monthly count.',
			},
		],
	},
	{
		icon: 'fas fa-laptop',
		title: 'Your devices',
		items: [
			{
				text: 'Every Windows PC and Mac monitored and patched',
				limit: 'Computers your staff use for work. Servers are not in the per-user price; they are priced on your quote.',
			},
			{
				text: 'Antivirus managed and watched, not just installed',
				limit: 'Microsoft Defender for Business, which comes with the licence. If you keep a different antivirus product, its licence is yours to pay for.',
			},
			{
				text: 'Disk, battery and age tracked, so a failure is replaced and not survived',
				limit: 'We tell you when a device needs replacing. The replacement is hardware and is paid for separately.',
			},
			{
				text: 'Phones and tablets enrolled, so a lost phone is wiped and not a breach',
				limit: 'A company phone can be wiped completely. On a personal phone we remove the work data only, never the owner\'s photos and messages.',
			},
		],
	},
	{
		icon: 'fab fa-microsoft',
		title: 'Microsoft 365',
		items: [
			{
				text: 'Email, Teams, SharePoint and OneDrive administered',
				limit: 'When Microsoft itself has an outage, only Microsoft can fix it. We tell you what is happening and when it is expected back.',
			},
			{
				text: 'Licences bought, assigned and reviewed, so you stop paying for staff who left',
				limit: 'Microsoft 365 Business Premium is inside the per-user price. Any other Microsoft licence is quoted on top.',
			},
			{
				text: 'Multi-factor authentication turned on and kept on',
				limit: 'For every account. We will not turn it off for one person because it is inconvenient.',
			},
			{
				text: 'Spam and phishing filtering tuned to your mail',
				limit: 'Filtering stops most phishing, not all of it. That is why the staff training below is in the price as well.',
			},
		],
	},
	{
		icon: 'fas fa-shield-alt',
		title: 'Keeping you safe',
		items: [
			{
				text: 'Backups of Microsoft 365 and your files, checked monthly by restoring one',
				limit: 'Microsoft 365 and the computers we manage. Data kept anywhere else is not backed up until you tell us about it.',
			},
			{
				text: 'Security patching inside 14 days of release, critical fixes faster',
				limit: 'Windows, macOS and Microsoft software. Other software is patched where our tools support it, and we tell you about the rest.',
			},
			{
				text: 'Phishing tests and short security training for your staff',
				limit: 'Training makes staff harder to trick. It does not make them impossible to trick.',
			},
			{
				text: 'A password manager for every user',
				limit: 'For work passwords, on the accounts we set up.',
			},
			{
				text: 'A written record of who has access to what',
				limit: 'For the systems we manage.',
			},
			{
				text: 'We tell you when something looks wrong, before you notice it',
				limit: `Alerts are watched in cover hours. An alert at 2am on a Sunday is acted on at 8am on Monday, unless you add out-of-hours cover.`,
			},
		],
	},
	{
		icon: 'fas fa-network-wired',
		title: 'Your office',
		items: [
			{
				text: 'Your broadband, firewall, switches and Wi-Fi looked after',
				limit: 'This is what the per-office fee pays for. The firewall, switches and Wi-Fi equipment are hardware, and the broadband line is billed at cost.',
			},
			{
				text: 'On-site visits when a problem cannot be fixed remotely',
				limit: 'In cover hours, in the area on our Thames Valley page. No call-out charge there. Further out, we tell you before you sign.',
			},
			{
				text: 'Office moves and new desks planned with you',
				limit: 'The planning is included. The move itself is a project, and is priced on its own.',
			},
		],
	},
	{
		icon: 'fas fa-phone-alt',
		title: 'Your suppliers',
		items: [
			{
				text: 'We deal with your broadband provider, your software vendors and your landlord',
				limit: 'We report the fault and we chase it. We cannot make another company work faster than its own contract with you says.',
			},
			{
				text: 'One number to call, whoever is actually at fault',
				limit: `Answered in cover hours, ${terms.coverHours}.`,
			},
			{
				text: 'Renewals flagged before they roll over',
				limit: 'For the contracts we manage, and the ones you tell us about.',
			},
		],
	},
];

/** Named plainly, because every provider that hides this is asked about it anyway. */
export const notCovered = [
	'Hardware itself. We specify it, buy it for you at cost and set it up; the laptop is yours to pay for.',
	'The broadband line itself. We monitor it and we chase your provider, but the circuit is billed at what it costs us — from about £35 a month for a business line — and we show you the supplier invoice.',
	'Microsoft licences beyond Business Premium. Copilot, extra storage, Dynamics 365, an Office licence for a shared machine: all available, all quoted on top at what they cost plus our handling.',
	'Out-of-hours and weekend cover. Available, priced on your quote, not inside the standard price.',
	'Projects. A server replacement, an office move or a migration is scoped and priced on its own.',
	'Line-of-business software nobody at XFour has seen. We will support it once we have had time to learn it, and we will say so first.',
	'Dynamics 365 and Power Platform work. That is the other half of what we do, and it is quoted as consultancy.',
];

/**
 * The towns the landing page names as in reach. One list, so the landing
 * page, the local page and its structured data cannot name different areas.
 */
export const towns = [
	'Reading',
	'Wokingham',
	'Bracknell',
	'Newbury',
	'Basingstoke',
	'Maidenhead',
	'Slough',
	'High Wycombe',
	'Oxford',
];
