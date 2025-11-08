'use client';

import { useState, useEffect, useRef } from 'react';

// 在客户端组件中仅处理内容渲染，不依赖服务端功能
export default function PostClient({ post }) {
  const [loading, setLoading] = useState(true);
  const contentRef = useRef(null);

  // 图片懒加载处理和错误处理
  useEffect(() => {
    if (contentRef.current) {
      // 为所有图片添加懒加载属性和错误处理
      const images = contentRef.current.querySelectorAll('img');
      images.forEach(img => {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
        
        // 添加onError处理，当图片加载失败时隐藏图片
        img.onerror = function() {
          this.style.display = 'none';
        };
        
        // 添加onLoad处理，确保图片正确加载
        img.onload = function() {
          this.onerror = null;
        };
      });
    }
    setLoading(false);
  }, []);

  if (!post) {
    return (
      <div style={{ position: 'relative', textAlign: 'center', padding: '2rem' }}>
        <p>文章未找到</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <article className="article-content">
        <h1>{post.title}</h1>
        <p>发布日期: {post.date}</p>
        {post.tags && (
          <div>
            标签: 
            {post.tags.map((tag) => (
              <span key={tag}>
                <a href={`/tags/${tag}`}>{tag}</a> 
              </span>
            ))}
          </div>
        )}
        
        {/* 大纲移到文章内容上方 */}
        {post.headers && post.headers.length > 0 && (
          <div className="toc">
            <h3>目录</h3>
            <ul>
              {post.headers.map((header, index) => (
                <li key={index} className={`toc-h${header.level}`}>
                  <a href={`#${header.id}`}>{header.text}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div 
          ref={contentRef}
          dangerouslySetInnerHTML={{ __html: post.content }} 
        />
      </article>
    </div>
  );
}