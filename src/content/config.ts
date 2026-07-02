import { defineCollection, z } from 'astro:content';
import type { BlogSchema, BlogSchemaInput } from 'types/blog';

const blogCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    link: z.string().optional(),
    date: z.union([z.string(), z.date()]),
    updated: z.union([z.string(), z.date()]).optional(),
    cover: z.string().optional(),
    tags: z.array(z.string()).optional(),
    // 兼容老 Hexo 博客
    subtitle: z.string().optional(),
    catalog: z.boolean().optional().default(true),
    categories: z
      .union([z.array(z.string()), z.array(z.array(z.string()))])
      .optional(),
    sticky: z.boolean().optional(),
    draft: z.boolean().optional(),
    // 目录编号控制
    tocNumbering: z.boolean().optional().default(true),
    // 排除 AI 摘要生成
    excludeFromSummary: z.boolean().optional(),
    // Shoka features per-post toggle
    math: z.boolean().optional(),
    quiz: z.boolean().optional(),
    password: z.string().optional(),
    /** Keywords for SEO */
    keywords: z.array(z.string()).optional(),
  }) satisfies z.ZodType<BlogSchema, z.ZodTypeDef, BlogSchemaInput>,
});

export const collections = {
  blog: blogCollection,
};
