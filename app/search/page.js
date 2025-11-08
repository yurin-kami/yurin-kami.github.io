import Search from '../../components/Search';
import { getAllPosts } from '../../lib/posts';

export const metadata = {
  title: '搜索 - KAMISHOW!!!!!',
  description: '在KAMISHOW!!!!!中搜索你感兴趣的内容，快速找到相关文章。',
  keywords: '搜索, 文章搜索, 内容搜索',
  authors: [{ name: 'KAMISHOW' }],
  openGraph: {
    title: '搜索 - KAMISHOW!!!!!',
    description: '在KAMISHOW!!!!!中搜索你感兴趣的内容，快速找到相关文章。',
    type: 'website',
    locale: 'zh_CN',
  },
};

export default async function SearchPage() {
  const posts = getAllPosts(['title', 'date', 'slug', 'excerpt', 'tags']);

  return (
    <div>
      <h1>搜索</h1>
      <Search posts={posts} />
    </div>
  );
}