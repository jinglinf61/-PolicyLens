import {onlineSearch,searchScope} from './search.mjs';
import library from './library.json' with {type:'json'};

const acceptedDomains = ['swu.edu.cn','lanqiao.cn','tiaozhanbei.net','mcm.edu.cn','icpc.global',
  ...library.schools.map(s=>s.domain).filter(Boolean)];
const excluded = /名单|成绩.{0,12}公示|拟录取.{0,12}公示|获奖.{0,12}公示/;
function verifiedLink(input,base) {
  try {
    const u=new URL(input,base);
    if(u.protocol!=='https:'||u.port||u.username||u.password||!acceptedDomains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))return null;
    u.hash='';
    return u;
  }catch{return null;}
}
function strip(value) {
  return value.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
}
async function sourceHtml(url) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7500);
  try{
    const response=await fetch(url,{redirect:'manual',signal:controller.signal});
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('此来源暂无法读取网页正文。');
    if(Number(response.headers.get('content-length'))>400000)throw Error('网页正文过大。');
    const reader=response.body.getReader();
    const text=new TextDecoder();
    let html='',size=0;
    try {
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.length;
        if(size>400000)break;
        html+=text.decode(value,{stream:true});
      }
      html+=text.decode();
    }finally{void reader.cancel().catch(()=>{});}
    return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  }finally{clearTimeout(timer);}
}
function dateFrom(value) {
  const split=value.match(/\b(\d{1,2})\s+(20\d{2})[-/.](\d{1,2})(?![-/.]\d)/);
  const full=value.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  const parts=split?[split[2],split[3],split[1]]:full?.slice(1);
  return parts ? parts.map(p=>p.padStart(2,'0')).join('-'):'';
}
function rowsFrom(html,parent,unit='') {
  const results=new Map(), today=new Date().toISOString().slice(0,10);
  for(const m of html.matchAll(/<a\b([^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi)){
    const link=verifiedLink(m[2].replace(/&amp;/gi,'&'),parent);
    if(!link||link.hostname!==new URL(parent).hostname||!(/\/info\/\d+\/|\/content(?:[_/]|_tz\.jsp)/i.test(link.pathname)))continue;
    const raw=strip(m[3]), hint=m[1].match(/\stitle=["']([^"']+)["']/i)?.[1];
    const title=strip(hint||raw).replace(/^(?:\d{1,2}\s+20\d{2}-\d{2}|20\d{2}-\d{2}-\d{2})\s+/,'');
    if(title.length<8||title.length>205||excluded.test(title))continue;
    const adjacent=strip(html.slice(m.index+m[0].length,m.index+m[0].length+90));
    const published=dateFrom(raw)||dateFrom(adjacent);
    results.set(link.href,{title,url:link.href,published:published<=today?published:'',unit,
      topics:[/奖学金|奖助学|评优评奖/.test(title)?'奖学金':'',/竞赛|大赛|含弘杯|挑战杯|蓝桥杯|数学建模/.test(title)?'竞赛':''].filter(Boolean)});
    if(results.size>=35)break;
  }
  return [...results.values()];
}
async function metadata(env,name) {
  const response=await env.ASSETS.fetch(new Request('https://assets.test/catalog-data/'+name+'.json'));
  if(!response.ok)throw Error('未找到栏目配置。');
  return response.json();
}
const DB=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
export async function scan(env,group,{all=false}={}) {
  const school=group==='admissions';
  const sources=school?(await metadata(env,'schools')).flatMap(s=>s.url?[[s.url,s.name]]:[])
    : await metadata(env,'swu-sources');
  const valid=sources.filter(([url])=>verifiedLink(url));
  if(!valid.length)return;
  const latest=await DB(env,'SELECT MAX(checked) AS checked FROM site_checks WHERE group_name=?',group).first();
  if(!all&&latest?.checked&&Date.now()-Date.parse(latest.checked)<5*60*1000)return;
  const offset=all ? 0 : (Math.floor(Date.now()/1800000)*4)%valid.length;
  const selected=all?valid.slice(0,4):Array.from({length:Math.min(4,valid.length)},(_,i)=>valid[(offset+i)%valid.length]);
  await Promise.all(selected.map(async ([url,unit])=>{
    const checked=new Date().toISOString();
    let records=[],error='';
    try{
      records=rowsFrom(await sourceHtml(url),url,unit);
      if(school)records=records.filter(row=>/推免|推荐免|预报名|夏令营/.test(row.title));
      if(!records.length)error='当前栏目没有匹配的通知。';
    }catch{error='官网暂无法读取。';}
    const statements=[DB(env,`INSERT INTO site_checks(group_name,url,unit,checked,count,error) VALUES(?,?,?,?,?,?)
      ON CONFLICT(group_name,url) DO UPDATE SET checked=excluded.checked,count=excluded.count,error=excluded.error`,
      group,url,unit,checked,records.length,error)];
    for(const row of records.slice(0,20)){
      statements.push(DB(env,`INSERT INTO site_records(group_name,url,unit,title,published,topics,first_seen) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(group_name,url) DO UPDATE SET title=excluded.title,published=COALESCE(NULLIF(excluded.published,''),site_records.published),
          topics=excluded.topics`,group,row.url,unit,row.title,row.published,JSON.stringify(row.topics),checked));
    }
    await env.DB.batch(statements);
  }));
}
async function monitor(env,group){
  const [{results:checks},{results:records}]=await Promise.all([
    DB(env,'SELECT url,unit,checked,count,error FROM site_checks WHERE group_name=? ORDER BY checked DESC',group).all(),
    DB(env,`SELECT url,unit,title,published,topics,first_seen FROM site_records WHERE group_name=?
      ORDER BY published DESC,first_seen DESC LIMIT 400`,group).all(),
  ]);
  const time=checks[0]?.checked||'';
  if(group==='swu')return {running:false,last_checked:time,checks,records:records.map(row=>({...row,topics:JSON.parse(row.topics)}))};
  const schools=(await metadata(env,'schools')).map(row=>{
    const check=checks.find(r=>r.unit===row.name);
    return {...row,checked:check?.checked,last_success:check&&!check.error?check.checked:'',total:check?1:0,
      success:check&&!check.error?1:0,failed:check?.error?1:0,
      errors:check?.error?[{title:'研招栏目',message:check.error,url:check.url}]:[]};
  });
  return {available:true,enabled:true,running:false,last_run:time,schools,
    events:records.slice(0,60).map(row=>({id:row.url,url:row.url,title:row.title,school:row.unit,kind:'new',time:row.first_seen,seen:false}))};
}

export async function siteRoute(env,route,body,spend) {
  if(route==='swu'||route==='admissions'){
    if(body.action==='run'){
      const slot=Math.floor(Date.now()/300000);
      if(await spend('portal/run/'+route+'/'+slot,1,(slot+1)*300000))await scan(env,route,{all:true});
    }
    return monitor(env,route);
  }
  const hour=Math.floor(Date.now()/3600000);
  if(!await spend('portal/fetch/'+hour,90,(hour+1)*3600000))throw Error('本时段联网检索额度已用完，请稍后再试。');
  if(route==='search'){
    if(typeof body.query!=='string'||body.query.trim().length<2||body.query.length>300)throw Error('请填写2到300字的查询。');
    const scope=searchScope(body.query);
    if(body.scope==='campus'){
      scope.domain='swu.edu.cn';
      if(!scope.landing.includes('swu.edu.cn'))scope.landing='https://www.swu.edu.cn/tzgg.htm';
    }
    const online=await onlineSearch(scope,env.BRAVE_API_KEY,(url,options)=>fetch(url,options));
    return {status:'ok',results:online.sources.map(row=>({...row,snippet:row.excerpt.slice(0,350),
      source_label:'官网来源',domain:new URL(row.url).hostname})),notice:online.status,fallback_url:online.landing};
  }
  if(route!=='preview'&&route!=='column')throw Error('没有找到此功能。');
  const url=verifiedLink(body.url);
  if(!url)throw Error('请填写已登记学校或赛事的 HTTPS 官网地址。');
  const html=await sourceHtml(url.href);
  if(route==='column')return {records:rowsFrom(html,url.href)};
  const title=strip(html.match(/<(?:h1|title)\b[^>]*>([\s\S]*?)<\/(?:h1|title)>/i)?.[1]||url.hostname);
  if(excluded.test(title))throw Error('本页可能含个人公示信息，请在官网查看。');
  const article=html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]||
    html.split(/<div\b[^>]*(?:id|class)=["'][^"']*v_news_content[^>]*>/i)[1]||html;
  const text=article.replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi,'\n').split('\n').map(strip)
    .filter(line=>line&&!/(?:学号|身份证号|考生编号)\s*[：:]?\s*\d{7,}/.test(line)).slice(0,160).join('\n').slice(0,35000);
  return {title,url:url.href,text,published:dateFrom(strip(html)),source_label:url.hostname.endsWith('.swu.edu.cn')?'西南大学官网':url.hostname};
}
