import type { CollectionEntry } from 'astro:content';

/**
 * Normalize a filename into a URL slug.
 * Replicates the original Next.js normalization behavior.
 */
export function slugify(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w一-龥-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extract the first image URL from markdown content
 */
export function extractFirstImage(content: string): string {
  const imageMatch = content.match(/!\[.*?\]\((.*?)\)/);
  if (!imageMatch || !imageMatch[1]) {
    return '/images/default-thumbnail.jpg';
  }

  const src = imageMatch[1];
  if (src.startsWith('/') || src.startsWith('http')) {
    return src;
  }
  return '/' + src;
}

/**
 * Extract outline (headers + list items) from markdown content
 */
export function extractHeaders(markdown: string) {
  const headers: { type: string; level: number; text: string; id: string }[] = [];
  const lines = markdown.split('\n');

  lines.forEach((line, index) => {
    const h1Match = line.match(/^# (.+)/);
    const h2Match = line.match(/^## (.+)/);
    const h3Match = line.match(/^### (.+)/);
    const orderedListMatch = line.match(/^\s*(\d+)\. (.+)/);
    const unorderedListMatch = line.match(/^\s*[*+-] (.+)/);
    const indentedUnorderedListMatch = line.match(/^\s+[*+-] (.+)/);

    if (h1Match) {
      headers.push({
        type: 'header',
        level: 1,
        text: h1Match[1],
        id: h1Match[1].toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, ''),
      });
    } else if (h2Match) {
      headers.push({
        type: 'header',
        level: 2,
        text: h2Match[1],
        id: h2Match[1].toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, ''),
      });
    } else if (h3Match) {
      headers.push({
        type: 'header',
        level: 3,
        text: h3Match[1],
        id: h3Match[1].toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, ''),
      });
    } else if (orderedListMatch || unorderedListMatch || indentedUnorderedListMatch) {
      const trimmedLine = line.replace(/^\s*/, '');
      const indentLevel = (line.length - trimmedLine.length) / 2;
      const listText = orderedListMatch
        ? orderedListMatch[2]
        : unorderedListMatch
          ? unorderedListMatch[1]
          : indentedUnorderedListMatch![1];

      headers.push({
        type: 'list',
        level: indentLevel + 4,
        text: listText,
        id: `list-${index + 1}`,
      });
    }
  });

  return headers;
}

/**
 * Get excerpt from post content (first paragraph)
 */
export function getExcerpt(content: string, maxLength = 150): string {
  // Remove markdown images, links, and formatting
  const cleaned = content
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '$1')
    .replace(/[#*_`]/g, '')
    .replace(/\n/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trimEnd() + '...';
}
