/**
 * Content locale utilities
 *
 * Detects locale from content collection slugs and provides
 * locale-aware filtering with fallback support.
 */

import type { BlogPost } from 'types/blog';
import { allKnownLocales, defaultLocale } from '@/i18n/config';
import { transliterateSlug } from '@/lib/slug';

export interface SlugLocaleInfo {
  /** Detected locale code (e.g., 'en') or defaultLocale if none found */
  locale: string;
  /** Slug with locale prefix stripped (e.g., 'tools/getting-started') */
  localeFreeSlug: string;
}

/**
 * Extract locale info from a content collection slug.
 *
 * Convention: default-locale files live at root (slug = "tools/getting-started"),
 * translations live under `<locale>/` (slug = "en/tools/getting-started").
 *
 * Uses `allKnownLocales` (including disabled locales) to detect directory prefixes,
 * so posts in disabled locale directories are correctly excluded by filterPostsByLocale.
 *
 * @example
 * getSlugLocaleInfo('tools/getting-started')     // { locale: 'zh', localeFreeSlug: 'tools/getting-started' }
 * getSlugLocaleInfo('en/tools/getting-started')   // { locale: 'en', localeFreeSlug: 'tools/getting-started' }
 */
export function getSlugLocaleInfo(slug: string): SlugLocaleInfo {
  if (!slug) {
    console.warn(`[getSlugLocaleInfo] Called with undefined/empty slug from getPostLocale - check post.slug`);
    return { locale: defaultLocale, localeFreeSlug: '' };
  }

  // Normalize: strip 'content/blog/' prefix that Astro's glob loader may leave
  // when the collection base is './src/content/blog' but the loader doesn't
  // fully strip it from the generated slug (affects posts without a `link` field).
  slug = slug.replace(/^content\/blog\//, '');

  const firstSlash = slug.indexOf('/');
  if (firstSlash === -1) {
    // No slash → single-segment slug, always default locale
    return { locale: defaultLocale, localeFreeSlug: slug };
  }

  const firstSegment = slug.slice(0, firstSlash);

  if (firstSegment !== defaultLocale && allKnownLocales.has(firstSegment)) {
    return {
      locale: firstSegment,
      localeFreeSlug: slug.slice(firstSlash + 1),
    };
  }

  return { locale: defaultLocale, localeFreeSlug: slug };
}

/**
 * Get the locale of a blog post.
 */
export function getPostLocale(post: BlogPost): string {
  if (!post.slug) return defaultLocale;
  return getSlugLocaleInfo(post.slug).locale;
}

/**
 * Get the locale-free slug for a blog post.
 * Prefers `post.data.link` (custom permalink) over the computed locale-free slug.
 * When slug transliteration is enabled, non-ASCII slugs are converted to romanized form.
 *
 * Validates that `link` is a relative path, not an absolute URL, to prevent
 * broken routes like /post/https://other.com/my-post.
 */
export function getPostSlug(post: BlogPost): string | undefined {
  const link = post.data.link;
  if (link) {
    if (link.startsWith('http://') || link.startsWith('https://') || link.startsWith('//')) {
      console.warn(`[getPostSlug] Post "${post.id}" has an absolute URL as link: "${link}". Absolute URLs are not valid slugs. Falling back to transliterated slug.`);
      const info = getSlugLocaleInfo(post.slug);
      if (!info.localeFreeSlug) return undefined;
      return transliterateSlug(info.localeFreeSlug);
    }
    // Validate relative link: must not start with / (would be a path, not a slug)
    if (link.startsWith('/')) {
      console.warn(`[getPostSlug] Post "${post.id}" has a path-prefixed link: "${link}". This is not a valid slug. Falling back to file slug.`);
      const info = getSlugLocaleInfo(post.slug);
      if (!info.localeFreeSlug) return undefined;
      return transliterateSlug(info.localeFreeSlug);
    }
    return link;
  }
  const info = getSlugLocaleInfo(post.slug);
  if (!info.localeFreeSlug) {
    console.warn(`[getPostSlug] Post "${post.id}" has no valid slug (post.slug=${JSON.stringify(post.slug)}, post.id=${post.id})`);
    return undefined;
  }
  return transliterateSlug(info.localeFreeSlug);
}

/**
 * Filter posts by locale with fallback support.
 *
 * - `locale = undefined` → return all posts (backward-compatible)
 * - `locale = defaultLocale` → only default-locale posts
 * - `locale = 'en'` (non-default) → en translations + default-locale posts
 *   that have no en translation (fallback)
 */
export function filterPostsByLocale(posts: BlogPost[], locale?: string): BlogPost[] {
  if (locale === undefined) return posts;

  if (locale === defaultLocale) {
    // Only return posts whose locale is the default
    return posts.filter((post) => getPostLocale(post) === defaultLocale);
  }

  // Non-default locale: collect translations and fallback for untranslated
  const translatedSlugs = new Set<string>();
  const translated: BlogPost[] = [];
  const defaultPosts: BlogPost[] = [];

  for (const post of posts) {
    const postLocale = getPostLocale(post);
    if (postLocale === locale) {
      translated.push(post);
      const slug = getPostSlug(post);
      if (slug) translatedSlugs.add(slug);
    } else if (postLocale === defaultLocale) {
      defaultPosts.push(post);
    }
    // Posts in other non-default locales are excluded
  }

  // Add default-locale posts that have no translation as fallback
  const fallback = defaultPosts.filter((post) => {
    const slug = getPostSlug(post);
    return slug ? !translatedSlugs.has(slug) : true; // include posts without slug as fallback
  });

  // Merge and re-sort by date (newest first) to maintain consistent ordering
  const merged = [...translated, ...fallback];
  merged.sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  return merged;
}
