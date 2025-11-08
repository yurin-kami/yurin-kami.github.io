const { convertMarkdownToHtml } = require('./lib/posts');

async function testTableConversion() {
  const markdown = `
| 姓名 | 年龄 | 城市 |
| ---- | ---- | ---- |
| 张三 | 25   | 北京 |
| 李四 | 30   | 上海 |
| 王五 | 28   | 广州 |
`;

  try {
    const html = await convertMarkdownToHtml(markdown);
    console.log('转换结果:', html);
  } catch (error) {
    console.error('转换失败:', error);
  }
}

testTableConversion();