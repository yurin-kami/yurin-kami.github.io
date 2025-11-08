import Link from 'next/link';
import { getAllPosts } from '../../lib/posts';
import PostItemClient from '../../components/PostItemClient';

export const metadata = {
  title: '所有文章 - KAMISHOW!!!!!',
  description: '查看KAMISHOW!!!!!的所有文章，发现更多有趣的内容。',
  keywords: '文章, 博客文章, 内容',
  authors: [{ name: 'KAMISHOW' }],
  openGraph: {
    title: '所有文章 - KAMISHOW!!!!!',
    description: '查看KAMISHOW!!!!!的所有文章，发现更多有趣的内容。',
    type: 'website',
    locale: 'zh_CN',
  },
};

export default async function PostsPage() {
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

  return (
    <div>
      <h1>所有文章</h1>
      <ul>
        {postsWithThumbnails.map((post) => (
          <PostItemClient key={post.slug} post={post} />
        ))}
      </ul>
    </div>
  );
}