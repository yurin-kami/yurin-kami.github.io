import { NextResponse } from 'next/server';

// 简单的速率限制存储（在实际生产环境中应使用Redis等外部存储）
const rateLimitStore = new Map();

// 检查是否被速率限制
function isRateLimited(ip, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const requests = rateLimitStore.get(ip);
  
  // 清理过期的请求记录
  const validRequests = requests.filter(timestamp => timestamp > windowStart);
  rateLimitStore.set(ip, validRequests);
  
  // 检查是否超过限制
  if (validRequests.length >= maxRequests) {
    return true;
  }
  
  // 记录当前请求
  validRequests.push(now);
  return false;
}

// 检查User-Agent是否为常见的爬虫
function isKnownCrawler(userAgent) {
  const crawlers = [
    'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
    'python-requests', 'java', 'go-http-client', 'axios',
    'postman', 'httpclient'
  ];
  
  const lowerUA = userAgent.toLowerCase();
  return crawlers.some(crawler => lowerUA.includes(crawler));
}

export const dynamic = 'force-static';
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');
  
  // 获取客户端IP地址
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             request.connection?.remoteAddress || 
             'unknown';
  
  // 获取User-Agent
  const userAgent = request.headers.get('user-agent') || '';

  // 记录请求信息用于调试
  console.log('Image proxy request for:', imageUrl, 'from IP:', ip, 'User-Agent:', userAgent);

  // 检查是否为已知爬虫
  if (isKnownCrawler(userAgent)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  // 检查速率限制
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  try {
    // 验证URL是否为合法的HTTP/HTTPS URL
    const url = new URL(imageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
    }

    // 获取图片
    const response = await fetch(imageUrl, {
      headers: {
        // 设置User-Agent以避免某些站点的防盗链机制
        'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)'
      },
      // 设置超时时间
      signal: AbortSignal.timeout(10000) // 10秒超时
    });

    console.log('Image fetch response status:', response.status);

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${response.status} ${response.statusText}` }, { status: 500 });
    }

    // 获取响应的content-type
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // 记录content-type用于调试
    console.log('Image content-type:', contentType);
    
    // 返回图片数据
    const arrayBuffer = await response.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable' // 缓存1年
      }
    });
  } catch (error) {
    console.error('Error proxying image:', error);
    return NextResponse.json({ error: `Error proxying image: ${error.message}` }, { status: 500 });
  }
}