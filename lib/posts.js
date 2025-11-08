import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const postsDirectory = path.join(process.cwd(), 'content', 'posts');

export function getPostSlugs() {
  // 检查目录是否存在
  if (!fs.existsSync(postsDirectory)) {
    console.warn(`Posts directory does not exist: ${postsDirectory}`);
    return [];
  }
  
  const files = fs.readdirSync(postsDirectory);
  // 只返回.md文件
  return files.filter(file => path.extname(file) === '.md');
}

export function getPostBySlug(slug, fields) {
  // 确保slug是字符串
  if (!slug || typeof slug !== 'string') {
    console.error(`Invalid slug: ${slug}`);
    throw new Error(`Invalid slug: ${slug}`);
  }
  
  const realSlug = slug.replace(/\.md$/, '');
  const fullPath = path.join(postsDirectory, `${realSlug}.md`);
  
  // 检查文件是否存在
  if (!fs.existsSync(fullPath)) {
    console.error(`Post not found: ${fullPath}`);
    throw new Error(`Post not found: ${fullPath}`);
  }
  
  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);

  const items = {};

  // 确保只返回请求的字段
  fields.forEach((field) => {
    if (field === 'slug') {
      items[field] = realSlug;
    }
    if (field === 'content') {
      items[field] = content;
    }
    if (data[field] !== undefined) {
      items[field] = data[field];
    }
  });

  return items;
}

export function getAllPosts(fields) {
  const slugs = getPostSlugs();
  return slugs
    .map((slug) => {
      try {
        return getPostBySlug(slug, fields);
      } catch (error) {
        console.error(`Error processing post ${slug}:`, error);
        return null;
      }
    })
    .filter(post => post !== null)  // 过滤掉无效的帖子
    .sort((post1, post2) => (post1 && post2 ? (post1.date > post2.date ? -1 : 1) : 0));
}

export function getAllTags() {
  const posts = getAllPosts(['tags']);
  const tags = new Set();
  
  posts.forEach(post => {
    if (post && post.tags && Array.isArray(post.tags)) {
      post.tags.forEach(tag => tags.add(tag));
    }
  });
  
  return Array.from(tags);
}

// 提取Markdown中的标题和列表项作为大纲项目
export function extractHeaders(markdown) {
  const headers = [];
  const lines = markdown.split('\n');
  let listCounter = 1; // 用于跟踪列表项的编号
  let currentListLevel = 0; // 当前列表的层级
  let listStack = []; // 存储列表层级信息
  
  lines.forEach((line, index) => {
    // 检测标题（H1, H2, H3）
    const h1Match = line.match(/^# (.+)/);
    const h2Match = line.match(/^## (.+)/);
    const h3Match = line.match(/^### (.+)/);
    
    if (h1Match) {
      headers.push({
        type: 'header',
        level: 1,
        text: h1Match[1],
        id: h1Match[1].toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, '')
      });
      // 重置列表计数器，因为标题通常表示新的章节
      listCounter = 1;
      currentListLevel = 0;
      listStack = [];
    } else if (h2Match) {
      headers.push({
        type: 'header',
        level: 2,
        text: h2Match[1],
        id: h2Match[1].toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, '')
      });
      listCounter = 1;
      currentListLevel = 0;
      listStack = [];
    } else if (h3Match) {
      headers.push({
        type: 'header',
        level: 3,
        text: h3Match[1],
        id: h3Match[1].toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, '')
      });
      listCounter = 1;
      currentListLevel = 0;
      listStack = [];
    } else {
      // 检测列表项（有序或无序）
      const orderedListMatch = line.match(/^\s*(\d+)\. (.+)/); // 匹配有序列表
      const unorderedListMatch = line.match(/^\s*[*+-] (.+)/);  // 匹配无序列表
      const indentedUnorderedListMatch = line.match(/^\s+[*+-] (.+)/); // 匹配缩进的无序列表
      
      if (orderedListMatch || unorderedListMatch || indentedUnorderedListMatch) {
        // 计算缩进级别
        const trimmedLine = line.replace(/^\s*/, '');
        const indentLevel = (line.length - trimmedLine.length) / 2; // 每2个空格为一个缩进级别
        const isOrderedList = !!orderedListMatch;
        const listText = orderedListMatch ? orderedListMatch[2] : (unorderedListMatch ? unorderedListMatch[1] : indentedUnorderedListMatch[1]);
        
        // 创建列表项的ID
        const id = `list-${index + 1}`;
        
        headers.push({
          type: 'list',
          level: indentLevel + 4, // 列表项的层级从4开始，以区别于标题层级
          text: listText,
          id: id,
          isOrderedList: isOrderedList
        });
      }
    }
  });
  
  return headers;
}

export async function convertMarkdownToHtml(markdown) {
  const lines = markdown.split('\n');
  
  // 预处理Markdown，为列表项添加特殊ID标记
  let processedMarkdown = '';
  let listCounter = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    const orderedListMatch = line.match(/^\s*(\d+)\. (.+)/);
    const unorderedListMatch = line.match(/^\s*[*+-] (.+)/);
    const indentedUnorderedListMatch = line.match(/^\s+[*+-] (.+)/);
    
    if (headerMatch) {
      // 保持标题不变
      processedMarkdown += line + '\n';
    } else if (orderedListMatch || unorderedListMatch || indentedUnorderedListMatch) {
      // 为列表项添加特殊标记，稍后替换为ID
      const trimmedLine = line.replace(/^\s*/, '');
      const indentLevel = (line.length - trimmedLine.length);
      const listText = orderedListMatch ? orderedListMatch[2] : (unorderedListMatch ? unorderedListMatch[1] : indentedUnorderedListMatch[1]);
      
      // 构建新的行，包含特殊ID标记
      const originalIndent = line.match(/^\s*/)[0];
      const listPrefix = orderedListMatch ? `${orderedListMatch[1]}. ` : '* ';
      
      processedMarkdown += `${originalIndent}${listPrefix}{{LIST_ID:${listCounter}}}${listText}\n`;
      listCounter++;
    } else {
      processedMarkdown += line + '\n';
    }
  }
  
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)  // 添加GFM支持（包括表格、任务列表等）
    .use(remarkRehype)
    .use(rehypeHighlight)  // 添加代码高亮支持
    .use(rehypeStringify)
    .process(processedMarkdown);

  // 获取HTML内容
  let html = result.toString();
  
  // 替换列表项的特殊ID标记
  let listCounter2 = 0;
  html = html.replace(/\{\{LIST_ID:(\d+)\}\}/g, (match, index) => {
    const listId = `list-${parseInt(index) + 1}`;
    return `<span id="${listId}"></span>`;
  });
  
  // 为标题添加id属性，用于大纲导航
  html = html.replace(/<h1>(.*?)<\/h1>/g, (match, content) => {
    const id = content.toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, '');
    return `<h1 id="${id}">${content}</h1>`;
  });
  
  html = html.replace(/<h2>(.*?)<\/h2>/g, (match, content) => {
    const id = content.toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, '');
    return `<h2 id="${id}">${content}</h2>`;
  });
  
  html = html.replace(/<h3>(.*?)<\/h3>/g, (match, content) => {
    const id = content.toLowerCase().replace(/\s+/g, '-').replace(/[\w\-]+/g, '');
    return `<h3 id="${id}">${content}</h3>`;
  });
  
  // 为图片添加样式，限制最大宽度和高度，并处理远程图片
  html = html.replace(
    /<img([^>]*?)src="([^"]*?)"([^>]*?)alt="([^"]*?)"([^>]*?)title="(.*?)"([^>]*?)>/g,
    (match, prefix, src, middle, alt, title, suffix) => {
      // 移除现有的width和height属性，因为我们会设置自己的样式
      let cleanPrefix = prefix.replace(/width="[^"]*"/g, '').replace(/height="[^"]*"/g, '');
      let cleanMiddle = middle.replace(/width="[^"]*"/g, '').replace(/height="[^"]*"/g, '');
      let cleanSuffix = suffix.replace(/width="[^"]*"/g, '').replace(/height="[^"]*"/g, '');
      
      // 移除可能存在的class属性，因为我们会在外层容器添加样式
      cleanPrefix = cleanPrefix.replace(/class="[^"]*"/g, '');
      cleanMiddle = cleanMiddle.replace(/class="[^"]*"/g, '');
      cleanSuffix = cleanSuffix.replace(/class="[^"]*"/g, '');
      
      // 移除事件处理器，这些将在客户端组件中处理
      cleanPrefix = cleanPrefix.replace(/onload="[^"]*"/g, '').replace(/onerror="[^"]*"/g, '');
      cleanMiddle = cleanMiddle.replace(/onload="[^"]*"/g, '').replace(/onerror="[^"]*"/g, '');
      cleanSuffix = cleanSuffix.replace(/onload="[^"]*"/g, '').replace(/onerror="[^"]*"/g, '');
      
      // 返回img标签
      return `<img${cleanPrefix}src="${src}"${cleanMiddle}alt="${alt}" title="${title}"${cleanSuffix} style="max-width: 100%; height: auto; display: block; margin: 1rem auto;">`;
    }
  );

  // 修复没有title属性的图片标签
  html = html.replace(
    /<img([^>]*?)src="([^"]*?)"([^>]*?)alt="([^"]*?)"([^>]*?)>/g,
    (match, prefix, src, middle, alt, suffix) => {
      // 检查是否已经包含title属性
      if (match.includes('title=')) {
        return match; // 如果已经有title属性，则跳过
      }
      
      // 移除现有的width和height属性，因为我们会设置自己的样式
      let cleanPrefix = prefix.replace(/width="[^"]*"/g, '').replace(/height="[^"]*"/g, '');
      let cleanMiddle = middle.replace(/width="[^"]*"/g, '').replace(/height="[^"]*"/g, '');
      let cleanSuffix = suffix.replace(/width="[^"]*"/g, '').replace(/height="[^"]*"/g, '');
      
      // 移除可能存在的class属性，因为我们会在外层容器添加样式
      cleanPrefix = cleanPrefix.replace(/class="[^"]*"/g, '');
      cleanMiddle = cleanMiddle.replace(/class="[^"]*"/g, '');
      cleanSuffix = cleanSuffix.replace(/class="[^"]*"/g, '');
      
      // 移除事件处理器，这些将在客户端组件中处理
      cleanPrefix = cleanPrefix.replace(/onload="[^"]*"/g, '').replace(/onerror="[^"]*"/g, '');
      cleanMiddle = cleanMiddle.replace(/onload="[^"]*"/g, '').replace(/onerror="[^"]*"/g, '');
      cleanSuffix = cleanSuffix.replace(/onload="[^"]*"/g, '').replace(/onerror="[^"]*"/g, '');
      
      // 返回img标签
      return `<img${cleanPrefix}src="${src}"${cleanMiddle}alt="${alt}"${cleanSuffix} style="max-width: 100%; height: auto; display: block; margin: 1rem auto;">`;
    }
  );
  
  return html;
}