import { getCollection } from 'astro:content';

const posts = await getCollection('blog');
console.log(`Total posts: ${posts.length}\n`);

for (const post of posts) {
  const slug = post.slug || post.id;
  const hasLink = post.data.link ? `link="${post.data.link}"` : 'no-link';
  const draft = post.data.draft ? ' [DRAFT]' : '';
  console.log(`slug: "${slug}" | id: "${post.id}" | ${hasLink}${draft} | title: ${post.data.title?.substring(0, 40)}`);
}
