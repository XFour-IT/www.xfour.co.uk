// The real people of XFour, for the "Who we are" section of /about-us.
//
// This file is the only place the team content lives. Adding a person here
// puts them on the About page; the page needs no edit. Removing the last
// person removes the whole section rather than leaving an empty grid behind.
//
// Nothing invented goes in this list. The About page carried three people who
// did not exist -- John Smith, Robert Downturn and Ally Sanders -- until
// 11 October 2026. An empty list is honest. A filled-in guess is not.
//
// To add a person, Ben needs four things for each one:
//
//   1. name   -- the name they want on the site.
//   2. role   -- the job title they want on the site.
//   3. bio    -- one or two sentences, written as a person speaks, not as a
//                CV reads. Plain English. No "passionate about".
//   4. photo  -- a real photograph of that person. A phone camera against a
//                plain wall is enough. Put the file in
//                public/assets/img/team/ and name it after the person, e.g.
//                public/assets/img/team/ben-smith.jpg, then set
//                photo: '/assets/img/team/ben-smith.jpg'.
//
// Photographs: roughly square, at least 600 x 600 pixels, JPEG. The page
// crops them to a circle, so leave a little space around the head. A stock
// photograph is not an option -- it repeats the exact mistake that was
// removed.

export interface TeamMember {
	/** The name as it should appear on the site. */
	name: string;
	/** The job title as it should appear on the site. */
	role: string;
	/** One or two sentences in plain English. */
	bio: string;
	/** Path under public/, e.g. '/assets/img/team/ben-smith.jpg'. */
	photo: string;
	/**
	 * Alt text for the photograph. Defaults to "<name>, <role> at XFour",
	 * which is what a screen reader needs, so this is rarely worth setting.
	 */
	photoAlt?: string;
	/** Full LinkedIn profile URL. Omit it rather than linking to nothing. */
	linkedin?: string;
}

export const team: TeamMember[] = [
	// Waiting on names, job titles, sentences and photographs from Ben.
	//
	// One filled-in example of the shape, kept commented out so that it can
	// never render:
	//
	// {
	// 	name: 'Ben Example',
	// 	role: 'Managing Director',
	// 	bio: 'Ben started XFour in 2018 after fifteen years of running IT for ' +
	// 		'other people. He still does most of the Dynamics work himself.',
	// 	photo: '/assets/img/team/ben-example.jpg',
	// 	linkedin: 'https://www.linkedin.com/in/ben-example/',
	// },
];

export function photoAltFor(member: TeamMember): string {
	return member.photoAlt ?? `${member.name}, ${member.role} at XFour`;
}
