import { defineCollection, reference } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

// One record per author, referenced by id rather than typed into each post --
// a typo in a name is a build failure here, not a wrong byline in production.
const authors = defineCollection({
	loader: glob({ pattern: '**/*.json', base: './src/content/authors' }),
	schema: z.object({
		name: z.string(),
		jobTitle: z.string(),
		bio: z.string(),
		linkedin: z.string().url(),
	}),
});

// `description` has no `.optional()`: a post missing a meta description fails
// the whole build instead of shipping a page with no description tag.
const blog = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
	schema: z.object({
		title: z.string(),
		description: z.string(),
		publishDate: z.coerce.date(),
		author: reference('authors'),
		track: z.enum(['dynamics-365', 'managed-it']),
		// Defaults to true, so a post dropped into the folder without a
		// `draft` line never ships by accident.
		draft: z.boolean().default(true),
		updatedDate: z.coerce.date().optional(),
		tags: z.array(z.string()).optional(),
		ogImage: z.string().optional(),
	}),
});

export const collections = { blog, authors };
