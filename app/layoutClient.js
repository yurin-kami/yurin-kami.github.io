'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function LayoutClient({ children }) {
  const pathname = usePathname();
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  useEffect(() => {
    // 页面开始加载时显示进度条
    setShowProgress(true);
    setLoadingProgress(30); // 初始进度

    // 模拟加载过程
    const timer1 = setTimeout(() => setLoadingProgress(60), 300);
    const timer2 = setTimeout(() => setLoadingProgress(90), 600);
    const timer3 = setTimeout(() => {
      setLoadingProgress(100);
      setTimeout(() => setShowProgress(false), 300); // 加载完成后隐藏
    }, 900);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [pathname]); // 当路径变化时重新执行

  return (
    <>
      {/* 顶部进度条 */}
      {showProgress && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            height: '3px',
            backgroundColor: '#9370DB', // 淡紫色
            width: `${loadingProgress}%`,
            transition: 'width 0.3s ease-out',
            zIndex: 9999,
            boxShadow: '0 0 10px rgba(147, 112, 219, 0.5)'
          }}
        />
      )}
      
      <header>
        <nav>
          <Link href="/">首页</Link>
          <Link href="/posts">文章</Link>
          <Link href="/tags">标签</Link>
          <Link href="/search">搜索</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <p>© 2025 KAMISHOW!!!!</p>
      </footer>
    </>
  );
}