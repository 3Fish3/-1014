// 以固定仿真步长采集网页画面，由系统ffmpeg编码教学仿真操作视频（无音轨）。
import {chromium} from 'playwright';
import {existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const executablePath=process.env.BROWSER_PATH||(existsSync('.tmp/browser/chrome-linux/chrome')?'.tmp/browser/chrome-linux/chrome':chromium.executablePath());
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
mkdirSync('.tmp/demo-frames',{recursive:true});mkdirSync('docs/media',{recursive:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
let frame=0;
async function shot(){await page.screenshot({path:`.tmp/demo-frames/${String(frame++).padStart(4,'0')}.png`});}
try {
 await page.goto(process.argv[2]||'http://localhost:8090');await page.waitForFunction(()=>window.app?.viewer?.diffCarModel);
 await page.evaluate(()=>{app.paused=true;document.querySelector('.scene-label').textContent='教学仿真／操作演示 · 固定步长采集 · 无音轨 · 非实车录像';});
 for(let i=0;i<10;i++){
  await page.evaluate(i=>{app.goToStep(i);app.viewer.isTransitioningCamera=false;app.viewer.camera.position.set(.4,.32,.42);app.viewer.controls.target.set(0,.03,0);},i);
  if(i===9){await page.waitForFunction(()=>app.viewer.heroRobotModel?.visible);await page.evaluate(()=>{app.viewer.camera.position.set(.72,.55,.95);app.viewer.controls.target.set(0,.15,0);});}
  await page.waitForTimeout(100);
  for(let j=0;j<5;j++)await shot();
 }
 await page.evaluate(()=>{app.goToStep(8);app.viewer.cameraMode='FOLLOW';app.viewer.isTransitioningCamera=false;app.kinematics.resetPose();app.kinematics.setWheelSpeeds(.3,.7);});
 for(let i=0;i<60;i++){
  await page.evaluate(()=>{for(let j=0;j<12;j++){let state=app.kinematics.update(1/60);app.viewer.render(state,1/60);}});
  await shot();
 }
}finally{await browser.close();}
const result=spawnSync('ffmpeg',['-y','-framerate','5','-i','.tmp/demo-frames/%04d.png','-c:v','libx264','-pix_fmt','yuv420p','-r','25','-movflags','+faststart','docs/media/教学仿真操作演示.mp4'],{stdio:'inherit'});
if(result.error)throw result.error;if(result.status!==0)throw new Error('ffmpeg编码失败');
