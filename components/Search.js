'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

export default function Search({ posts }) {
  const [query, setQuery] = useState('');

  const filteredPosts = useMemo(() => {
    if (!query) return posts;
    
    const lowerCaseQuery = query.toLowerCase();
    return posts.filter(post => 
      post.title.toLowerCase().includes(lowerCaseQuery) ||
      (post.excerpt && post.excerpt.toLowerCase().includes(lowerCaseQuery)) ||
      (post.tags && post.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery)))
    );
  }, [query, posts]);

  return (
    <div>
      <input
        type="text"
        placeholder="搜索文章..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      
      <ul>
        {filteredPosts.map((post) => (
          <li key={post.slug}>
            <Link href={`/posts/${post.slug}`}>
              <h2>{post.title}</h2>
            </Link>
            <p>日期: {post.date}</p>
            {post.excerpt && <p>{post.excerpt}</p>}
            {post.tags && (
              <div>
                标签: 
                {post.tags.map((tag) => (
                  <span key={tag}>
                    <Link href={`/tags/${tag}`}>{tag}</Link> 
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}