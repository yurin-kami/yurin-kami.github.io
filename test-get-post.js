const { getPostBySlug } = require('./lib/posts');

function testGetPostBySlug() {
  try {
    const post = getPostBySlug('2023-10-05-my-first-post', ['title', 'content']);
    console.log('Post data:');
    console.log('Title:', post.title);
    console.log('Content type:', typeof post.content);
    console.log('Content length:', post.content ? post.content.length : 0);
    console.log('Content preview:', post.content ? post.content.substring(0, 200) : 'No content');
  } catch (error) {
    console.error('Error getting post by slug:', error);
  }
}

testGetPostBySlug();