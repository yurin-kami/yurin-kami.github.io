import Link from 'next/link';
import { getAllPosts, getAllTags } from '../../../lib/posts';

export default async function TagPosts({ params }) {
  const tag = params.tag;
  const allPosts = getAllPosts(['title', 'date', 'slug', 'tags']);
  const posts = allPosts.filter(post => post.tags && post.tags.includes(tag));

  return (
    <div>
      <h1>标签: {tag}</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/posts/${post.slug}`}>
              <h2>{post.title}</h2>
            </Link>
            <p>日期: {post.date}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function generateMetadata({ params }) {
  return {
    title: `标签: ${params.tag} - KAMISHOW!!!!!`,
    description: `包含标签 ${params.tag} 的所有文章`,
  };
}

export async function generateStaticParams() {
  const tags = getAllTags();
  
  return tags.map((tag) => ({
    tag: tag,
  }));
}