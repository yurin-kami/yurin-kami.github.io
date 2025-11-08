import Link from 'next/link';
import { getAllTags } from '../../lib/posts';

export const metadata = {
  title: '标签 - KAMISHOW!!!!!',
  description: '浏览KAMISHOW!!!!!的所有标签，快速找到你感兴趣的内容。',
  keywords: '标签, 分类, 内容分类',
  authors: [{ name: 'KAMISHOW' }],
  openGraph: {
    title: '标签 - KAMISHOW!!!!!',
    description: '浏览KAMISHOW!!!!!的所有标签，快速找到你感兴趣的内容。',
    type: 'website',
    locale: 'zh_CN',
  },
};

export default async function TagsPage() {
  const tags = getAllTags();

  return (
    <div>
      <h1>标签</h1>
      <ul>
        {tags.map((tag) => (
          <li key={tag}>
            <Link href={`/tags/${tag}`}>
              {tag}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}