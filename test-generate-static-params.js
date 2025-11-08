const { getAllPosts } = require('./lib/posts');

async function testGenerateStaticParams() {
  console.log('Testing generateStaticParams logic:');
  
  // 模拟generateStaticParams函数
  const posts = getAllPosts(['slug']);
  console.log('Posts with slug field:');
  console.log(posts);
  
  // 模拟过滤和映射
  const result = (posts || [])
    .filter(post => post && post.slug && typeof post.slug === 'string')
    .map((post) => ({
      slug: post.slug,
    }));
    
  console.log('Generated params:');
  console.log(result);
}

testGenerateStaticParams().catch(console.error);