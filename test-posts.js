const { getPostSlugs, getAllPosts, getPostBySlug } = require('./lib/posts');

console.log('Testing getPostSlugs:');
const slugs = getPostSlugs();
console.log(slugs);

console.log('\nTesting getAllPosts:');
const posts = getAllPosts(['title', 'date', 'slug']);
console.log(posts);

console.log('\nTesting getPostBySlug:');
if (slugs.length > 0) {
  const post = getPostBySlug(slugs[0], ['title', 'date', 'slug', 'content']);
  console.log(post);
}