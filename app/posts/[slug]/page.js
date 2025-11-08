import { Suspense } from 'react';
import { getPostBySlug, convertMarkdownToHtml, extractHeaders, getAllPosts } from '../../../lib/posts';

// 服务端组件获取文章数据
async function PostContent({ params }) {
  // 等待params Promise解析
  const resolvedParams = await params;
  const post = getPostBySlug(resolvedParams.slug, [
    'title',
    'date',
    'slug',
    'content',
    'excerpt',
    'tags',
  ]);

  // 转换Markdown内容
  const content = await convertMarkdownToHtml(post.content || '');
  const headers = extractHeaders(post.content || '');

  // 客户端组件渲染文章内容
  const PostClient = (await import('./PostClient')).default;
  return <PostClient post={{...post, content, headers}} />;
}

// 服务端组件获取元数据
export async function generateMetadata({ params }) {
  // 等待params Promise解析
  const resolvedParams = await params;
  const post = getPostBySlug(resolvedParams.slug, ['title', 'excerpt', 'date', 'tags']);
  
  return {
    title: `${post.title} - KAMISHOW!!!!!`,
    description: post.excerpt || post.title,
    keywords: post.tags ? [...post.tags, '文章', '博客'] : ['文章', '博客'],
    authors: [{ name: 'KAMISHOW' }],
    openGraph: {
      title: post.title,
      description: post.excerpt || post.title,
      type: 'article',
      publishedTime: post.date,
      locale: 'zh_CN',
      tags: post.tags,
    },
  };
}

// 生成静态参数
export async function generateStaticParams() {
  const posts = getAllPosts(['slug']);
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

// 骨架屏组件
function PostSkeleton() {
  return (
    <div style={{ position: 'relative', padding: '2rem' }}>
      <div style={{ height: '2rem', backgroundColor: '#eee', marginBottom: '1rem', width: '60%' }}></div>
      <div style={{ height: '1.2rem', backgroundColor: '#eee', marginBottom: '0.5rem', width: '30%' }}></div>
      <div style={{ height: '1rem', backgroundColor: '#eee', marginBottom: '1rem', width: '70%' }}></div>
      <div style={{ height: '1rem', backgroundColor: '#eee', marginBottom: '0.5rem', width: '100%' }}></div>
      <div style={{ height: '1rem', backgroundColor: '#eee', marginBottom: '0.5rem', width: '90%' }}></div>
      <div style={{ height: '1rem', backgroundColor: '#eee', marginBottom: '0.5rem', width: '95%' }}></div>
    </div>
  );
}

export default function Post({ params }) {
  return (
    <Suspense fallback={<PostSkeleton />}>
      <PostContent params={params} />
    </Suspense>
  );
}