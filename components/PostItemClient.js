'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function PostItemClient({ post }) {
  const [thumbnail, setThumbnail] = useState(post.thumbnail);

  useEffect(() => {
    setThumbnail(post.thumbnail);
  }, [post.thumbnail]);

  const handleImageError = (e) => {
    // 如果图片加载失败，显示默认图片
    e.target.src = '/images/default-thumbnail.jpg';
    // 移除onError事件处理器，防止无限循环
    e.target.onerror = null;
  };

  return (
    <li key={post.slug}>
      <div className="content">
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
      </div>
      <img 
        src={thumbnail} 
        alt={`${post.title} 缩略图`} 
        className="thumbnail"
        onError={handleImageError}
      />
    </li>
  );
}