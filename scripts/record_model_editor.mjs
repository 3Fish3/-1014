// 可复现工具操作视频：固定帧采集，测试位移而非机械修复，非实时性能录像。
import {chromium} from 'playwright';
import {existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const output=process.env.OUTPUT_DIR||'.tmp/ci/model-editor';mkdirSync(output,{recursive:true});
const frames='.tmp/model-editor-video';mkdirSync(frames,{recursive:true});
const executablePath=process.env.BROWSER_PATH||(existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let count=0;
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('dialog',d=>d.accept());
 await page.goto(`${process.argv[2]||'http://127.0.0.1:8080'}/model-editor.html`);
 await page.locator('#load-course').click();await page.waitForFunction(()=>modelEditor?.source);
 await page.evaluate(()=>{const label=document.createElement('div');label.textContent='工具演示 · 测试位移，非实际装配修复 · 固定帧录制';label.style.cssText='position:fixed;right:10px;bottom:7px;background:white;color:#9a530d;font-size:13px;z-index:20';document.body.append(label);});
 const shot=async()=>{await page.screenshot({path:`${frames}/${String(count++).padStart(4,'0')}.png`});};
 const hold=async()=>{for(let i=0;i<4;i++)await shot();};
 await hold();
 const group=await page.evaluate(()=>{const s=modelEditor.source;const row=[...s.nodes].find(([i,o])=>s.parsed.document.nodes[i].name==='yaw轴3改'&&o.children.length>0);return row?.[0];});
 if(group===undefined)throw new Error('未找到演示装配组，拒绝猜测其他节点');
 await page.locator('#search').fill(String(group));await page.locator(`#tree button[data-node-index="${group}"]`).click();await page.locator('#focus').click();await hold();
 const original=Number(await page.locator('#px').inputValue());
 for(let i=1;i<=8;i++){await page.locator('#px').fill(String(original+i*.005));await page.locator('#apply').click();await shot();}
 await page.locator('#rotate').click();
 for(let i=1;i<=6;i++){await page.locator('#rz').fill(String(i*2));await page.locator('#apply').click();await shot();}
 await page.locator('#undo').click();await hold();await page.locator('#redo').click();await hold();
 await page.locator('#isolate').click();await hold();await page.locator('#show-all').click();
 const download=page.waitForEvent('download');await page.locator('#save-patch').click();await download;await hold();
 await page.locator('#reset-node').click();await hold();
}finally{await browser.close();}
const encoded=spawnSync('ffmpeg',['-y','-framerate','3','-i',`${frames}/%04d.png`,'-t',String(count/3),'-c:v','libx264','-pix_fmt','yuv420p','-r','24','-movflags','+faststart',`${output}/工作台操作演示-非实际修复.mp4`],{stdio:'inherit'});
if(encoded.error)throw encoded.error;if(encoded.status!==0)throw new Error('ffmpeg编码失败');
