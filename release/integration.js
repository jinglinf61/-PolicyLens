const catalogCache = new Map();
function catalog(name) {
  if (!catalogCache.has(name)) {
    catalogCache.set(name, fetch('/catalog-data/'+name+'.json').then(r=>{
      if(!r.ok)throw Error('资料读取失败。');
      return r.json();
    }).catch(error=>{catalogCache.delete(name);throw error;}));
  }
  return catalogCache.get(name);
}
async function requestCloud(path,data) {
  const response=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const value=await response.json();
  if(!response.ok)throw Error(value.error||'服务暂不可用。');
  return value;
}
const sessionData={documents:{},drafts:{},posts:[],watch:[],counts:{}};
const cloudDay=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
const publicTime=()=>new Date().toISOString();
const shaText=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const normalized=value=>String(value??'').normalize('NFKC').toLowerCase();
function matches(value,query){const text=normalized(value);return normalized(query).trim().split(/\s+/).every(word=>text.includes(word));}
function slicePage(rows,page,size){return rows.slice((page-1)*size,page*size);}
function idFrom(query) {return query.get('id')||'';}
function found(row){if(!row)throw Error('没有找到这份资料。');return row;}

async function cloudApi(path,data) {
  const url=new URL(path,location.origin), params=url.searchParams;
  switch(url.pathname){
    case '/api/info': {
      const metadata=await catalog('info');
      return {...metadata,documents:[...metadata.documents,...Object.values(sessionData.documents).map(({sections,...doc})=>({...doc,paragraphs:sections.length}))]};
    }
    case '/api/home': {
      const home=await catalog('home'),today=cloudDay();
      return {...home,today,events:home.events.map(event=>({...event,status:event.end&&event.end<today?'已结束':event.start>today?'即将开始':'进行中'}))};
    }
    case '/api/document': return found(sessionData.documents[idFrom(params)]||(await catalog('documents'))[idFrom(params)]);
    case '/api/admissions/document': return found((await catalog('admission-documents'))[idFrom(params)]||sessionData.documents[idFrom(params)]);
    case '/api/template': return catalog('template');
    case '/api/admissions/catalog': return catalog('admissions');
    case '/api/admissions/2027': return archiveView(params);
    case '/api/admissions/compare': return admissionsCompare(data);
    case '/api/admissions/profile': return checkAdmissionProfile(data);
    case '/api/compare': return paragraphCompare(data);
    case '/api/community/posts': return data?createPost(data):communityFeed(params);
    case '/api/community/moderation': return communityFeed(params,true);
    case '/api/community/review': return moderatePost(data);
    case '/api/community/search': {
      for(const topic of communityTopics.filter(value=>data.query?.includes(value)))sessionData.counts[topic]=(sessionData.counts[topic]||0)+1;
      return {ok:true};
    }
    case '/api/community/topics': return {popular:Object.entries(sessionData.counts).map(([topic,count])=>({topic,count})),recommended:communityTopics};
    case '/api/discovery/local-search': {
      const docs={...(await catalog('documents')),...sessionData.documents};
      return textSearch(Object.values(docs),data.query);
    }
    case '/api/discovery/state': return discoveryState();
    case '/api/discovery/document': return found(sessionData.drafts[idFrom(params)]);
    case '/api/discovery/lookup': return textSearch([found(sessionData.drafts[data.id])],data.query);
    case '/api/discovery/discard': delete sessionData.drafts[data.id];return {ok:true};
    case '/api/discovery/preview': {
      const source=await requestCloud('/api/site/preview',{url:data.url});
      return draftDocument(source);
    }
    case '/api/discovery/commit': {
      if(!data.reviewed)throw Error('请先核对来源和适用范围。');
      const draft=found(sessionData.drafts[data.id]);
      const doc=await importDocument({...draft,...data.metadata,metadata_reviewed:true,provenance:'当前浏览器导入'});
      draft.status='imported';
      return doc;
    }
    case '/api/import': return importDocument(data);
    case '/api/delete':
      if(!Object.hasOwn(sessionData.documents,data.id))throw Error('仅可删除当前会话导入的文件。');
      delete sessionData.documents[data.id];return {ok:true};
    case '/api/discovery/watch': return saveWatch(data);
    case '/api/discovery/check': return checkWatch(data.id);
    case '/api/discovery/web-search': return requestCloud('/api/site/search',{query:data.query,scope:data.scope,domain:data.domain});
    case '/api/library/swu': {
      const cached=await catalog('swu');
      const response=await requestCloud('/api/site/swu',data);
      const records=new Map(cached.map(row=>[row.url,row]));
      for (const row of response.records)records.set(row.url,row);
      return {...response,records:[...records.values()]};
    }
    case '/api/admissions/watch': {
      if(data?.action==='preview')return cloudApi('/api/discovery/preview',{url:data.id});
      if(data?.action==='settings'){sessionData.admissionsEnabled=data.enabled===true;data=undefined;}
      if(data?.action==='seen'){(sessionData.seen??=new Set()).add(data.id);data=undefined;}
      const response=await requestCloud('/api/site/admissions',data);
      return {...response,enabled:sessionData.admissionsEnabled??true,events:response.events.map(event=>({...event,seen:sessionData.seen?.has(event.id)||false}))};
    }
    default: return requestCloud(path,data);
  }
}
async function archiveView(params) {
  const data=await catalog('archive'), programs=params.get('mode')==='programs',page=Math.max(1,Number(params.get('page'))||1);
  const school=params.get('school'), category=params.get('category'), query=params.get('q');
  const rows=(programs?data.programs:data.files).filter(r=>
    (!school||r['院校']===school)&&(!category||(r['类别']||r['层次'])===category)&&
    matches([r['院校'],r['文件'],r['招生院系'],r['专业代码'],r['专业名称'],r['类别']].join(' '),query));
  return {available:true,coverage:data.coverage,files:data.files.length,programs:data.programs.length,
    attachments:Object.keys(data.attachments).length,categories:[...new Set(data.files.map(r=>r['类别']))],
    items:slicePage(rows,page,20),page,page_size:20,total:rows.length};
}
async function admissionsCompare(data) {
  const ids=[...new Set(data.ids||[])];
  if(ids.length<2||ids.length>6)throw Error('请选择 2 至 6 份不同资料。');
  const records=(await catalog('admissions')).records.filter(r=>ids.includes(r.id)).sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
  if(records.length!==ids.length)throw Error('部分对照资料未找到。');
  const examples=await catalog('admission-examples');
  const precomputed=Object.entries(examples).find(([key])=>key.split('|').length===ids.length&&key.split('|').every(id=>ids.includes(id)))?.[1];
  if(precomputed)return {...precomputed,records,created_at:cloudDay()};
  const groups=new Map();
  for(const record of records)for(const point of [...record.fields.quotas,...record.verified_metrics]){
    if(!point.year||!Number.isFinite(point.value))continue;
    const key=JSON.stringify([record.school,record.unit,record.route,point.metric,point.scope,point.definition,point.unit]);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({year:point.year,value:point.value,document_id:record.id,section_id:point.section_id||point.section_ids?.[0]});
  }
  const charts=[];
  for(const [key,points] of groups){
    if(points.length<2||new Set(points.map(p=>p.year)).size!==points.length)continue;
    const [school,unit,,metric,scope,definition,measure]=JSON.parse(key);
    points.sort((a,b)=>a.year-b.year);
    charts.push({label:[school,unit,metric].join(' / '),scope:scope||unit,definition,unit:measure||'人',points,
      delta:Number((points.at(-1).value-points[0].value).toFixed(2)),notice:'只比较同口径的文件数据。'});
  }
  return {records,charts,created_at:cloudDay(),warnings:['核对目标院系、招生阶段、适用年度和例外条件。'],notice:'供历史资料对照与规划使用。'};
}
async function checkAdmissionProfile(data) {
  const records=(await catalog('admissions')).records.filter(r=>(data.ids||[]).includes(r.id));
  const profile=data.profile||{};
  const checks=records.map(record=>({title:record.title,items:[
    {label:'适用年度',status:record.years.includes(Number(profile.graduation_year))?'年份相符':'需核对',detail:'资料适用年度 '+record.years.join('、'),evidence:[]},
    {label:'专业排名',status:'核对原文',detail:profile.rank_percent?('本次填写排名前 '+profile.rank_percent+'%。请核对院系分组、专业和例外条款。'):'本次未填写排名。',evidence:record.fields.rank.slice(0,4)},
    {label:'英语',status:'核对原文',detail:['CET6','TOEFL','IELTS'].filter(key=>profile[key]).map(key=>key+' '+profile[key]).join(' · ')||'本次未填写英语成绩。',evidence:record.fields.english.slice(0,4)},
    {label:'论文与成果',status:'核对原文',detail:record.paper_status,evidence:record.fields.paper.slice(0,4)},
  ]}));
  return {checks,notice:'成绩仅用于本次浏览器核对。综合资格请结合原文和适用范围确认。'};
}
const scopes=[['school','适用学校'],['college','适用学院'],['doc_type','文件类型'],['policy_years','适用年度'],['edition','赛事届次'],['cohorts','入学年级'],['stage','业务阶段']];
async function paragraphCompare(data) {
  if(data.left_id===data.right_id)throw Error('请选择不同资料。');
  const left=await cloudApi('/api/document?id='+encodeURIComponent(data.left_id));
  const right=await cloudApi('/api/document?id='+encodeURIComponent(data.right_id));
  if(left.sections.some(s=>s.id==='SOURCE')||right.sections.some(s=>s.id==='SOURCE'))throw Error('请先导入两份包含正文的文件，再对照原文。');
  const counts={identical:0,similar:0,left_only:0,right_only:0};
  const pairs=[];
  const unused=new Set(right.sections.map((_,index)=>index));
  for(const section of left.sections){
    const exact=right.sections.findIndex((item,index)=>unused.has(index)&&item.text===section.text);
    if(exact>=0){unused.delete(exact);pairs.push(['identical',section,right.sections[exact]]);}
    else pairs.push(['left_only',section,null]);
  }
  for(const index of unused)pairs.push(['right_only',null,right.sections[index]]);
  for(const [kind] of pairs)counts[kind]++;
  pairs.sort((a,b)=>Number(a[0]==='identical')-Number(b[0]==='identical'));
  const ref=async (doc,section)=>section?{doc_id:doc.id,section_id:section.id,text:section.text,heading:section.heading||'',text_sha256:await shaText(section.text)}:null;
  const display_limit=80;
  const rows=await Promise.all(pairs.slice(0,display_limit).map(async ([kind,a,b])=>({kind,left:await ref(left,a),right:await ref(right,b)})));
  const scope=scopes.map(([field,label])=>{
    const a=left[field],b=right[field];
    const present=value=>Array.isArray(value)?value.length:Boolean(value);
    return {field,label,left:a,right:b,status:!present(a)||!present(b)?'unknown':JSON.stringify(a)===JSON.stringify(b)?'same':'different'};
  });
  return {left,right,rows,counts,display_limit,rows_omitted:Math.max(0,pairs.length-display_limit),pairing_limited:false,
    scope:{rows:scope,issues:scope.filter(r=>r.status==='different').map(r=>r.label+'不同'),notice:'网页版按原文段落匹配。'},
    notice:'仅在一侧出现的段落可能是改写或版式差异。'};
}
const communityTopics=['保研','考研','蓝桥杯','软件工程','合理安排','竞赛'];
async function communityFeed(params,moderation=false) {
  const seed=await catalog('community'),status=moderation?params.get('status')||'pending':'approved';
  const posts=[...sessionData.posts,...(moderation?[]:seed.posts.map(row=>({...row,id:row.key,status:'approved',
    origin:'public_summary',prepared_at:seed.prepared_at,created_at:seed.prepared_at})))].filter(r=>r.status===status &&
    (!params.get('category')||r.category===params.get('category'))&&matches([r.title,r.content,r.tags.join(' ')].join(' '),params.get('q')));
  const tally=new Map();
  for(const post of posts)for(const tag of post.tags)tally.set(tag,(tally.get(tag)||0)+1);
  const tag=params.get('tag'), chosen=tag?posts.filter(r=>r.tags.includes(tag)):posts;
  return {posts:slicePage(chosen,Number(params.get('page'))||1,10),total:chosen.length,page_size:10,
    tags:[...tally].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([tag,count])=>({tag,count}))};
}
function createPost(data) {
  if(!data.agreement||!data.title?.trim()||!data.content?.trim()||!data.author?.trim())throw Error('请完整填写内容并确认约定。');
  const post={id:crypto.randomUUID(),version:1,created_at:publicTime(),status:'pending',
    title:data.title,author:data.author,category:data.category,content:data.content,tags:data.tags,
    moderation:{method:'当前浏览器草稿',reasons:['待人工复核后在本会话预览。']}};
  sessionData.posts.unshift(post);
  return post;
}
function moderatePost(data) {
  const post=found(sessionData.posts.find(row=>row.id===data.id));
  if(data.version!==post.version)throw Error('记录已更新，请刷新。');
  if(!['approved','pending','rejected'].includes(data.decision)||data.reason?.trim().length<4)throw Error('请填写复核理由。');
  Object.assign(post,{status:data.decision,version:post.version+1,moderation:{method:'会话内手工复核',reasons:[data.reason]}});
  return post;
}
function textSearch(documents,query) {
  if(typeof query!=='string'||query.trim().length<2)throw Error('请输入至少两个字。');
  const results=documents.flatMap(doc=>{
    const section=doc.sections.find(s=>matches(s.text,query));
    if(!section&&!matches(doc.title,query))return [];
    return [{id:doc.id,section_id:section?.id||doc.sections[0]?.id,title:doc.title,url:doc.url,
      reviewed:doc.metadata_reviewed,snippet:(section?.text||doc.sections[0]?.text||'').slice(0,500)}];
  });
  return {status:'ok',results:results.slice(0,30),notice:'匹配标题和已收录正文。'};
}
function discoveryState(){return {watch:sessionData.watch,inbox:Object.values(sessionData.drafts)};}
async function draftDocument(source) {
  const sections=source.sections||String(source.text||'').trim().split(/\r?\n\s*\r?\n|\r?\n/).filter(Boolean)
    .slice(0,300).map((text,index)=>({id:'P'+(index+1),heading:'',text:text.slice(0,3000)}));
  if(!sections.length)throw Error('没有提取到可读正文。');
  const draft={...source,id:'collect-'+crypto.randomUUID(),status:'draft',source_sha256:await shaText(sections.map(x=>x.text).join('\n')),
    source_label:source.source_label||'浏览器内读取',fetched_at:publicTime(),warnings:[],attachments:[],previous_candidates:[],sections};
  sessionData.drafts[draft.id]=draft;
  return draft;
}
async function importDocument(doc) {
  if(!doc||typeof doc.title!=='string'||!doc.title.trim()||!Array.isArray(doc.sections)||!doc.sections.length)throw Error('资料必须包含标题和正文。');
  const ids=new Set();
  const sections=doc.sections.slice(0,300).map((section,index)=>{
    if(typeof section.text!=='string'||!section.text.trim())throw Error('正文段落不能为空。');
    let id=typeof section.id==='string'&&section.id.length<60?section.id:'';
    if(!id||ids.has(id))id='web-'+index;
    ids.add(id);
    return {id,heading:String(section.heading||''),text:section.text.slice(0,6000),page:section.page};
  });
  const id='web-'+crypto.randomUUID();
  sessionData.documents[id]={...doc,id,sections,school:String(doc.school||''),college:String(doc.college||''),
    title:doc.title.trim().slice(0,500),topics:Array.isArray(doc.topics)?doc.topics.filter(v=>typeof v==='string'):[],
    policy_years:Array.isArray(doc.policy_years)?doc.policy_years:[],provenance:'当前浏览器会话导入'};
  return {ok:true,id,reviewed:doc.metadata_reviewed===true};
}
function saveWatch(data) {
  const url=new URL(data.url);
  if(url.protocol!=='https:')throw Error('请填写 HTTPS 官网地址。');
  const existing=sessionData.watch.find(row=>row.id===data.id);
  const item={id:existing?.id||crypto.randomUUID(),name:String(data.name||url.hostname),url:url.href,
    enabled:data.enabled===true,interval_minutes:Math.min(1440,Math.max(15,Number(data.interval_minutes)||60)),
    last_check:existing?.last_check,last_result:existing?.last_result};
  if(existing)Object.assign(existing,item);else sessionData.watch.push(item);
  return discoveryState();
}
async function checkWatch(id) {
  const entry=found(sessionData.watch.find(row=>row.id===id));
  const result=await requestCloud('/api/site/column',{url:entry.url});
  entry.last_check=publicTime();
  const captured=[];
  for(const row of result.records.slice(0,6)){
    if(Object.values(sessionData.drafts).some(d=>d.url===row.url))continue;
    const preview=await requestCloud('/api/site/preview',{url:row.url}).catch(()=>null);
    if(preview)captured.push(await draftDocument(preview));
  }
  entry.last_result={checked:Math.min(6,result.records.length),new_or_changed:captured.length,errors:[]};
  return {state:discoveryState(),checked:entry.last_result.checked,found:captured,errors:[]};
}
function loadScript(source){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=source;script.onload=resolve;script.onerror=reject;document.head.append(script);
  });
}
async function cloudPreviewFile(file) {
  const extension=file.name.split('.').at(-1).toLowerCase();
  let text;
  if(extension==='docx'){
    if(!window.JSZip)await loadScript('/vendor/jszip.min.js');
    const zip=await JSZip.loadAsync(await file.arrayBuffer());
    const xml=await zip.file('word/document.xml')?.async('string');
    const parsed=new DOMParser().parseFromString(xml||'','application/xml');
    text=[...parsed.getElementsByTagNameNS('*','p')].map(p=>p.textContent.trim()).filter(Boolean).join('\n');
  }else if(extension==='pdf'){
    const pdfjs=await import('/vendor/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
    const pages=[];
    try{
      for(let i=1;i<=Math.min(pdf.numPages,30);i++){
        const page=await pdf.getPage(i), content=await page.getTextContent();
        pages.push(content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join(''));
      }
      text=pages.join('\n');
    }finally{await pdf.destroy();}
    if(!text.trim())throw Error('没有文本层，请在本机版识别扫描件。');
  }else{
    text=await file.text();
    if(extension==='html'||extension==='htm'){
      const parsed=new DOMParser().parseFromString(text,'text/html');
      parsed.querySelectorAll('script,style,nav').forEach(node=>node.remove());
      text=parsed.body.textContent;
    }
  }
  return draftDocument({title:file.name,text:text.slice(0,200000)});
}
