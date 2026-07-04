import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    link: z.string().optional(),
    date: z.union([z.string(), z.date()]),
    updated: z.union([z.string(), z.date()]).optional(),
    cover: z.string().optional(),
    tags: z.array(z.string()).optional(),
    subtitle: z.string().optional(),
    catalog: z.boolean().optional().default(true),
    categories: z.union([z.array(z.string()), z.array(z.array(z.string()))]).optional(),
    sticky: z.boolean().optional(),
    draft: z.boolean().optional(),
    tocNumbering: z.boolean().optional().default(true),
    excludeFromSummary: z.boolean().optional(),
    math: z.boolean().optional(),
    quiz: z.boolean().optional(),
    password: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  }),
});

export const collections = { blog };
