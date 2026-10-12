import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
	const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
		(a, b) => b.data.publishDate.valueOf() - a.data.publishDate.valueOf(),
	);

	return rss({
		title: 'XFour Blog',
		description: 'Dynamics 365, Power Platform and managed IT, written by the team who do the work.',
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishDate,
			link: `/blog/${post.id}`,
		})),
	});
}
