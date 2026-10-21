import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';

const base=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const root=decodeURIComponent(base);
const output=path.resolve(root,'../换届大会邀请函_定稿');
const qa=path.join(root,'批量检查');
const manifest=JSON.parse(await fs.readFile(path.join(root,'批量名单.json'),'utf8'));
await fs.mkdir(qa,{recursive:true});
const profile=path.join(qa,'chrome-profile');
await fs.mkdir(profile,{recursive:true});
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0',`--user-data-dir=${profile}`,'--allow-file-access-from-files','about:blank'
],{stdio:'ignore',windowsHide:true});
let ws;
let clientId=0;
const pending=new Map();
function call(method,params={},sessionId){
  const id=++clientId;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},30000);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function evaluate(expression,sessionId){
  const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try{
  let port;
  for(let i=0;i<100;i++){
    try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{}
    await new Promise(r=>setTimeout(r,150));
  }
  if(!port)throw new Error('Chrome failed to start');
  const info=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  ws=new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{
    const msg=JSON.parse(event.data);
    if(!msg.id)return;
    const request=pending.get(msg.id);if(!request)return;
    clearTimeout(request.timer);pending.delete(msg.id);
    if(msg.error)request.reject(new Error(JSON.stringify(msg.error)));else request.resolve(msg.result);
  });
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  await call('Page.enable',{},sessionId);
  await call('Emulation.setDeviceMetricsOverride',{width:1080,height:1528,deviceScaleFactor:1,mobile:false},sessionId);
  const report=[];
  for(const [kind,names] of Object.entries(manifest)){
    const directory=path.join(output,kind);await fs.mkdir(directory,{recursive:true});
    for(let i=0;i<names.length;i++){
      const name=names[i];
      const url=pathToFileURL(path.join(root,'数学建模协会邀请函.html'));
      url.search=new URLSearchParams({preview:'1',recipient:name,kind}).toString();
      await call('Page.navigate',{url:url.href},sessionId);
      let ready=false;
      for(let attempt=0;attempt<80;attempt++){
        ready=await evaluate(`document.readyState==='complete'&&document.getElementById('recipient')?.textContent===${JSON.stringify('尊敬的'+name+'：')}&&document.querySelectorAll('#surface-grid polyline').length===42`,sessionId);
        if(ready)break;
        await new Promise(r=>setTimeout(r,40));
      }
      if(!ready)throw new Error('Page not ready '+name);
      await evaluate(`document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))`,sessionId);
      const check=await evaluate(`(()=>{
        const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
        const img=document.querySelector('.badge img');
        return{recipient:document.getElementById('recipient').textContent,date:document.querySelector('.date').textContent,issued:document.querySelector('.issued').textContent,bodyText:document.querySelectorAll('.message')[1].textContent,notice:document.querySelector('.notice').textContent,badgeLoaded:img.complete&&img.naturalWidth>0,recipientBox:rect('.recipient'),closingBox:rect('.closing'),signatureBox:rect('.signature'),dateBox:rect('.date'),paperBox:rect('.body'),font:getComputedStyle(document.querySelector('.recipient')).fontSize};
      })()`,sessionId);
      if(!check.badgeLoaded||check.recipientBox.right>check.paperBox.right-40||check.closingBox.bottom+18>check.signatureBox.y||check.dateBox.right>check.paperBox.right-40)throw new Error('Layout failed '+name+' '+JSON.stringify(check));
      if(check.date!=='2026年10月24日18:00-20:00'||check.issued!=='2026年10月20日'||!check.notice.includes('提前十分钟'))throw new Error('Content failed '+name);
      const {data}=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);
      const filename=String(i+1).padStart(2,'0')+'_'+name+'_邀请函.png';
      const filepath=path.join(directory,filename);
      await fs.writeFile(filepath,Buffer.from(data,'base64'));
      report.push({kind,index:i+1,name,filepath,...check});
      console.log(`${kind} ${i+1}/${names.length} ${name}`);
    }
  }
  await fs.writeFile(path.join(qa,'检查结果.json'),JSON.stringify(report,null,2));
  await fs.writeFile(path.join(output,'生成清单.txt'),['2026年数学建模协会换届大会邀请函','活动：2026年10月24日18:00-20:00；北校电教馆','请到场代表提前十分钟入场；落款2026年10月20日','',...Object.entries(manifest).flatMap(([kind,names])=>[`${kind} 共${names.length}份`,...names.map((n,i)=>`${String(i+1).padStart(2,'0')} ${n}`),'']),'按所附名单完整生成，包含名单中数学建模协会本身；不含学院。'].join('\r\n'),'utf8');
  console.log('COMPLETE '+report.length+' invitations; layout/content checks passed.');
}finally{
  try{if(ws?.readyState===WebSocket.OPEN)await call('Browser.close');}catch{}
  ws?.close();chrome.kill();
}
