import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker,{cleanup,hash,randomToken} from './src/worker.mjs';

export function sqlite(path=':memory:') {
  const database=new DatabaseSync(path);
  const DB={
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results=statements.map(stmt=>stmt.execute());
        database.exec('COMMIT');
        return results;
      } catch (error) { database.exec('ROLLBACK'); throw error; }
    },
    prepare(sql) {
      return {bind(...params) {
        return {
          execute:()=>database.prepare(sql).run(...params),
          async run(){return this.execute();},
          async first(){return database.prepare(sql).get(...params) || null;},
          async all(){return {results:database.prepare(sql).all(...params)};},
        };
      }};
    },
  };
  return {DB,database};
}

const localState=new URL('.local/',import.meta.url);
const stateFile=new URL('demo.json',localState);
const fileMime={svg:'image/svg+xml',html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',mjs:'text/javascript; charset=utf-8',
  js:'text/javascript; charset=utf-8',json:'application/json',jpg:'image/jpeg',pdf:'application/pdf'};
const assets={async fetch(request) {
  const url=new URL(request.url);
  const path=url.pathname==='/'?'/index.html':url.pathname;
  if(!/^\/[a-z0-9_./-]+$/i.test(path)||path.includes('..'))return new Response('页面不存在',{status:404});
  try {
    return new Response(await readFile(new URL('release'+path,import.meta.url)),{
      headers:{'Content-Type':fileMime[path.split('.').at(-1)]||'application/octet-stream'},
    });
  }catch(error){
    if(error.code==='ENOENT')return new Response('页面不存在',{status:404});
    throw error;
  }
}};
const isDirect=process.argv[1] && new URL(import.meta.url).pathname.endsWith('/local.mjs')
  && process.argv[1].replaceAll('\\','/').endsWith('/local.mjs');
if(isDirect) await startPreview();
async function startPreview() {
  const {fileURLToPath}=await import('node:url');
  await mkdir(localState,{recursive:true});
  let state;
  try { state=JSON.parse(await readFile(stateFile,'utf8')); }
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    state={key:randomToken(),invite:randomToken(),id:crypto.randomUUID(),expires:process.env.POLICYLEN_PORTABLE==='1' ? Date.UTC(2099,11,31) : Date.now()+30*86400000};
    await writeFile(stateFile,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});
  }
  const {DB,database}=sqlite(fileURLToPath(new URL('preview.sqlite',localState)));
  database.exec(await readFile(new URL('schema.sql',import.meta.url),'utf8'));
  database.exec(await readFile(new URL('site-schema.sql',import.meta.url),'utf8'));
  database.exec(await readFile(new URL('planner-schema.sql',import.meta.url),'utf8'));
  database.prepare('INSERT OR IGNORE INTO accounts(id,invite_hash,expires) VALUES(?,?,?)')
    .run(state.id,await hash(state.invite),state.expires);
  const env={DB,ASSETS:assets,STORAGE_KEY:state.key,BRAVE_API_KEY:process.env.BRAVE_API_KEY};
  if(process.env.POLICYLEN_LOCAL_MODEL) {
    const endpoint=new URL(process.env.POLICYLEN_LOCAL_MODEL);
    if(endpoint.protocol!=='http:' || endpoint.hostname!=='127.0.0.1' || endpoint.username || endpoint.password) {
      throw new Error('本机预览仅可连接 127.0.0.1 的模型。');
    }
    env.AI={async run(_model,options){
      const response=await fetch(new URL('/v1/chat/completions',endpoint),{
        method:'POST',headers:{
          'Content-Type':'application/json',
          ...(process.env.POLICYLEN_LOCAL_MODEL_KEY ? {Authorization:'Bearer '+process.env.POLICYLEN_LOCAL_MODEL_KEY}:{}),
        },
        body:JSON.stringify({...options,model:process.env.POLICYLEN_LOCAL_MODEL_NAME||'policylens-local'}),
        signal:AbortSignal.timeout(25000),redirect:'error',
      });
      if(!response.ok)throw new Error('Local model unavailable');
      return response.json();
    }};
  }
  await cleanup(env);
  const portable=process.env.POLICYLEN_PORTABLE==='1';
  const port=Number(process.env.POLICYLEN_PREVIEW_PORT ?? (portable ? 0 : 8796));
  if(portable) await writeFile(new URL('本机邀请凭证.txt',import.meta.url),state.invite+'\n',{mode:0o600});
  const server=createServer(async (incoming,outgoing)=>{
    try {
      const base='http://127.0.0.1:'+server.address().port;
      if(incoming.headers.host!==new URL(base).host || !incoming.url.startsWith('/') || incoming.url.startsWith('//')) {
        outgoing.writeHead(403).end(); return;
      }
      const request=new Request(base+incoming.url,{
        method:incoming.method,headers:incoming.headers,
        ...(['GET','HEAD'].includes(incoming.method)?{}:{body:incoming,duplex:'half'}),
      });
      const result=await worker.fetch(request,env);
      outgoing.writeHead(result.status,Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch { outgoing.writeHead(500).end(); }
  });
  server.on('error',error=>{ console.error(error.message); process.exitCode=1; });
  server.listen(port,'127.0.0.1',()=>{
    const url='http://127.0.0.1:'+server.address().port+'/';
    console.log(url);
    if(portable && process.env.POLICYLEN_NO_BROWSER!=='1') {
      const browser=spawn('explorer.exe',[url],{stdio:'ignore',windowsHide:true});
      browser.on('error',()=>console.log('请在浏览器打开上面显示的本机地址。'));
      browser.unref();
    }
  });
}
