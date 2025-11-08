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

  // 响应式设计 - 检测屏幕宽度
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    // 初始检查
    checkIsMobile();
    
    // 监听窗口大小变化
    window.addEventListener('resize', checkIsMobile);
    
    // 清理事件监听器
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  return (
    <li key={post.slug} style={{
      display: 'flex',
      justifyContent: 'flex-start',
      alignItems: isMobile ? 'flex-start' : 'flex-start',
      gap: '1rem',
      marginBottom: '2rem',
      padding: '1.5rem',
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      borderRadius: '15px',
      boxShadow: '0 3px 10px rgba(255, 107, 157, 0.1)',
      transition: 'transform 0.3s ease, box-shadow 0.3s ease',
      backdropFilter: 'blur(5px)',
      overflowX: 'auto',
      maxWidth: '100%',
      boxSizing: 'border-box',
      flexDirection: isMobile ? 'column' : 'row'
    }}>
      <div className="content" style={{ 
        flex: 1, 
        minWidth: 0 
      }}>
        <Link href={`/posts/${post.slug}`} style={{
          color: '#ff6b9d',
          textDecoration: 'none',
          transition: 'color 0.3s ease'
        }}>
          <h2 style={{
            color: '#ff6b9d',
            fontFamily: "'FZXIANGSU16', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            marginTop: '0',
            marginBottom: '1rem'
          }}>{post.title}</h2>
        </Link>
        <p style={{ 
          color: '#333',
          margin: '0.5rem 0'
        }}>日期: {post.date}</p>
        {post.excerpt && <p style={{ 
          color: '#333',
          margin: '0.5rem 0'
        }}>{post.excerpt}</p>}
        {post.tags && (
          <div style={{ 
            margin: '0.5rem 0'
          }}>
            标签: 
            {post.tags.map((tag) => (
              <span key={tag} style={{
                marginRight: '0.5rem'
              }}>
                <Link href={`/tags/${tag}`} style={{
                  display: 'inline-block',
                  padding: '0.3rem 0.8rem',
                  backgroundColor: 'rgba(255, 230, 240, 0.8)',
                  color: '#ff6b9d',
                  borderRadius: '15px',
                  fontSize: '0.9rem',
                  transition: 'all 0.3s ease',
                  textDecoration: 'none'
                }}>{tag}</Link> 
              </span>
            ))}
          </div>
        )}
      </div>
      <img 
        src={thumbnail} 
        alt={`${post.title} 缩略图`} 
        className="thumbnail"
        style={{
          width: '100px',
          height: '100px',
          borderRadius: '10px',
          objectFit: 'cover',
          boxShadow: '0 4px 8px rgba(150, 130, 170, 0.3)',
          alignSelf: isMobile ? 'flex-start' : 'flex-start',
          flex: '0 0 auto',
          marginTop: isMobile ? '1rem' : '0',
          marginLeft: isMobile ? '0' : '1rem'
        }}
        onError={handleImageError}
      />
    </li>
  );
}