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

  const [isTocExpanded, setIsTocExpanded] = useState(true);
  const [tocTitle, setTocTitle] = useState('目录');

  // 根据大纲项目数量更新标题
  useEffect(() => {
    if (post.headers && post.headers.length > 0) {
      const headerCount = post.headers.filter(h => h.type === 'header').length;
      const listCount = post.headers.filter(h => h.type === 'list').length;
      let title = '目录';
      if (headerCount > 0 && listCount > 0) {
        title = `目录 (${headerCount} 个标题, ${listCount} 个列表)`;
      } else if (headerCount > 0) {
        title = `目录 (${headerCount} 个标题)`;
      } else if (listCount > 0) {
        title = `列表 (${listCount} 个项目)`;
      }
      setTocTitle(title);
    }
  }, [post.headers]);

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
          <div className="toc" style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            borderRadius: '10px',
            padding: '1rem',
            boxShadow: '0 4px 12px rgba(255, 107, 157, 0.2)',
            maxWidth: '100%',
            margin: '1.5rem 0',
            alignSelf: 'flex-start',
            backdropFilter: 'blur(8px)',
            overflowX: 'auto',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.8rem'
            }}>
              <h3 style={{
                margin: 0,
                color: '#ff6b9d',
                fontSize: '1.2rem',
                fontFamily: "'FZXIANGSU16', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
              }}>{tocTitle}</h3>
              <button
                onClick={() => setIsTocExpanded(!isTocExpanded)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ff6b9d',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  padding: '0.25rem',
                  borderRadius: '4px',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255, 107, 157, 0.1)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                {isTocExpanded ? '−' : '+'}
              </button>
            </div>
            {isTocExpanded && (
              <ul style={{
                listStyle: 'none',
                paddingLeft: 0,
                margin: 0
              }}>
                {post.headers.map((header, index) => (
                  <li key={index} className={`toc-${header.type}${header.level}`} style={{
                    marginBottom: '0.5rem',
                    paddingLeft: header.level > 3 ? `${(header.level - 3) * 1.5}rem` : `${header.level}rem`,
                    boxSizing: 'border-shadow',
                    display: 'block'
                  }}>
                    <a href={`#${header.id}`} style={{
                      color: '#333',
                      textDecoration: 'none',
                      fontSize: '0.9rem',
                      display: 'block',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '5px',
                      transition: 'all 0.2s ease',
                      backgroundColor: header.type === 'list' ? 'rgba(150, 130, 170, 0.1)' : 'transparent'
                    }}>{header.text}</a>
                  </li>
                ))}
              </ul>
            )}
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