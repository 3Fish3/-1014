// 生成中文PDF，需npm ci与Playwright Chromium，或BROWSER_PATH指定已安装浏览器。
import {chromium} from 'playwright';
import {marked} from 'marked';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
const executablePath=process.env.BROWSER_PATH||(existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
mkdirSync('docs/pdf',{recursive:true});
try {
 for(const name of ['讲解文档','设计思路与流程','脚本使用说明']){
  const page=await browser.newPage();
  const markdown=readFileSync(`docs/${name}.md`,'utf8').replace(/!\[([^\]]*)\]\((media\/[^)]+\.png)\)/g,(_,alt,path)=>`<figure><img alt="${alt}" src="data:image/png;base64,${readFileSync(`docs/${path}`).toString('base64')}"><figcaption>${alt}</figcaption></figure>`);
  const body=marked.parse(markdown);
  await page.setContent(`<!doctype html><html lang="zh"><meta charset="utf-8"><style>@page{size:A4;margin:18mm}body{font:12px 'Noto Sans CJK SC',sans-serif;color:#182334;line-height:1.7}h1{font-size:24px;color:#075985}h2{font-size:18px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%;font-size:10px}td,th{border:1px solid #ccd;padding:5px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2f6;padding:12px}code{font-family:'Noto Sans Mono CJK SC',monospace}a{color:#0369a1}tr,img{break-inside:avoid}img{max-width:100%;height:auto}figure{break-inside:avoid;margin:12px 0}figcaption{font-size:10px;color:#456}p,li{overflow-wrap:anywhere}</style><body>${body}</body></html>`);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode()));});
  await page.pdf({path:`docs/pdf/${name}.pdf`,format:'A4',printBackground:true});
  await page.close();
 }
}finally{await browser.close();}
