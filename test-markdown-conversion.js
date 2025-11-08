const { convertMarkdownToHtml } = require('./lib/posts');

async function testConvertMarkdownToHtml() {
  const markdownContent = `这是我的第一篇博客文章。欢迎来到 KAMISHOW!!!!!！

在这里，我将分享我的想法和经验。
![example video](https://www.bilibili.com/list/ml3363402368?oid=115450549637760&bvid=BV1rGyzBXEpT)

![示例图片](/images/sample.jpg)`;

  console.log('Original markdown:');
  console.log(markdownContent);
  console.log('\n---\n');
  
  try {
    const html = await convertMarkdownToHtml(markdownContent);
    console.log('Converted HTML:');
    console.log(html);
  } catch (error) {
    console.error('Error converting markdown to HTML:', error);
  }
}

testConvertMarkdownToHtml();