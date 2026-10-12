// The Microsoft Bookings link: Journey A's one call to action.
//
// It is the link that was already live on /app-development, which is what
// XFO-64 asked the Dynamics pages to use. It lives here, once, because more
// than one Journey A page books with it now. A link pasted into each page is
// how the old site drifted: change the meeting type in one page and the others
// keep booking the old one.
//
// Keep ?anonymous: it is what lets a stranger book without a Microsoft sign-in.
// The three & stay bare in this string; Astro escapes them when it writes the
// attribute.
//
// It books the same 30-minute slot the app-development page books. That is a
// real 30-minute scoping call today, so the pages are honest, but a separate
// Bookings meeting type for Dynamics scoping would tell the two journeys apart
// in the diary. That is Ben's call. When he makes one, change it here.
//
// /app-development still writes the link out by hand in its two buttons. It
// is the same link today; moving that page onto this constant belongs with
// the work that brings it under Journey A.
export const BOOKING_URL =
	'https://bookings.cloud.microsoft/bookwithme/user/f88c86d426534c27b206669a47304f11@xfour.co.uk/meetingtype/njvB-bvc7kqemKescI1BCg2?anonymous&ismsaljsauthenabled&ep=mcard';
