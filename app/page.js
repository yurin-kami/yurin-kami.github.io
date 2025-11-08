import Link from 'next/link';
import { Suspense } from 'react';
import { getAllPosts } from '../lib/posts';
import AvatarHeader from '../components/AvatarHeader';

export const metadata = {
  title: 'KAMISHOW!!!!!',
  description: '欢迎来到KAMISHOW!!!!!，',
  keywords: '博客, 学习记录, 分享',
  authors: [{ name: 'KAMISHOW' }],
  openGraph: {
    title: 'KAMISHOW!!!!!',
    description: '欢迎来到KAMISHOW!!!!!，',
    type: 'website',
    locale: 'zh_CN',
  },
};

// 首页内容组件
async function HomeContent() {
  // 获取所有文章数据
  const posts = getAllPosts(['title', 'date', 'slug', 'excerpt', 'tags', 'content']);

  // 从文章内容中提取第一张图片作为缩略图
  const postsWithThumbnails = posts.map(post => {
    let thumbnail = '/images/default-thumbnail.jpg'; // 默认缩略图
    
    // 尝试从文章内容中提取第一张图片
    if (post.content) {
      const imageMatch = post.content.match(/!\[.*?\]\((.*?)\)/);
      if (imageMatch && imageMatch[1]) {
        // 检查是否是相对路径（相对于public目录）
        if (imageMatch[1].startsWith('/')) {
          thumbnail = imageMatch[1];
        } else if (imageMatch[1].startsWith('http')) {
          // 外部图片链接
          thumbnail = imageMatch[1];
        } else {
          // 相对于public目录的路径
          thumbnail = '/' + imageMatch[1];
        }
      }
    }
    
    return {
      ...post,
      thumbnail
    };
  });

  // 懒加载的PostItem组件
  async function PostItem({ post }) {
    // 使用React.lazy实现组件懒加载
    const PostItemClient = (await import('../components/PostItemClient')).default;
    return <PostItemClient post={post} />;
  }

  return (
    <div>
      <AvatarHeader />
      <h2>最新文章</h2>
      <ul>
        {postsWithThumbnails.map((post) => (
          <Suspense key={post.slug} fallback={<PostItemSkeleton />}>
            <PostItem post={post} />
          </Suspense>
        ))}
      </ul>
    </div>
  );
}

// 骨架屏组件
function PostItemSkeleton() {
  return (
    <li>
      <div className="content">
        <div style={{ height: '1.5rem', backgroundColor: '#eee', marginBottom: '0.5rem', width: '70%' }}></div>
        <div style={{ height: '1rem', backgroundColor: '#eee', marginBottom: '0.5rem', width: '40%' }}></div>
        <div style={{ height: '1rem', backgroundColor: '#eee', marginBottom: '0.5rem', width: '90%' }}></div>
      </div>
      <div style={{ width: '100px', height: '100px', backgroundColor: '#eee', marginLeft: '1rem' }}></div>
    </li>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <HomeContent />
    </Suspense>
  );
}