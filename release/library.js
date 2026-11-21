const libraryState={topic:'',notices:[],limit:24,serial:0,accepting:false,watchKey:''};

function libraryKey(url){
 try{
  const u=new URL(url);
  if(u.hostname==='swu.edu.cn')u.hostname='www.swu.edu.cn';
  const keep=new URLSearchParams([...u.searchParams].filter(([key])=>!['eqid','from','utm_source','utm_medium'].includes(key.toLowerCase())));
  keep.sort();return u.hostname.toLowerCase()+u.pathname+(keep.size?'?'+keep:'');
 }catch{return '';}
}

function libraryTopic(row){
 const text=[row.title,...(row.topics||[])].join(' ');
 const result=[];
 if(/奖学金|奖助学金?|助学金|评优评奖|励志奖/.test(text))result.push('奖学金');
 if(/竞赛|大赛|挑战赛|含弘杯|挑战杯|蓝桥杯|黑客松|数学建模|赛事|ICPC|CCPC/i.test(text)||
    ['academic_competition','startup_competition','competition_policy','award_results'].includes(row.doc_type))result.push('竞赛');
 return result;
}

function libraryRows(){
 const rows=(info?.documents||[]).map(row=>({...row,unit:row.college,tags:libraryTopic(row)}));
 const indexed=new Map(libraryState.notices.map(row=>[libraryKey(row.url),row]));
 const titles=new Set();
 const noticesSeen=new Set();
 for(const row of rows){
  const key=libraryKey(row.url);
  const match=indexed.get(key);
  if(match&&!row.published)row.published=match.published;
  indexed.delete(key);
  if(row.school==='西南大学')titles.add(row.title.replace(/\s+/g,''));
 }
 for(const row of indexed.values()){
  if(titles.has(row.title.replace(/\s+/g,'')))continue;
  const identity=[row.unit,row.published,row.title.replace(/\s+/g,'')].join('|');
  if(noticesSeen.has(identity))continue;
  noticesSeen.add(identity);
  rows.push({...row,school:'西南大学',notice:true,tags:row.topics||libraryTopic(row)});
 }
 return rows.sort((a,b)=>(b.published||'').localeCompare(a.published||'')||
  Number(!!b.notice)-Number(!!a.notice)||(b.first_seen||'').localeCompare(a.first_seen||'')||
  a.title.localeCompare(b.title,'zh-CN'));
}

function libraryCard(row){
 const card=make('article',undefined,'document-card');
 card.dataset.published=row.published||'';
 card.dataset.title=row.title;
 const tags=make('div',undefined,'tags');
 tags.append(...row.tags.map(value=>tag(value)));
 if(row.notice)tags.append(tag('官网新发现 · 待核对',true));
 else tags.append(...(row.stage?[tag(stageLabel(row.stage))]:[]),tag(info.types[row.doc_type]||'资料'),
  tag(row.metadata_reviewed?'元数据已标注':'元数据待确认',!row.metadata_reviewed));
 card.append(tags,make('h3',row.title),make('p','发布 '+(row.published||'日期待核对')+' · '+(row.unit||row.school||'单位未标注')));
 const actions=make('div',undefined,'evidence-actions');
 if(!row.notice){
  const preview=make('button','查看原文快照','text-button');
  preview.type='button';preview.onclick=()=>openDocument(row.id);
  card.append(make('p','适用年度 '+((row.policy_years||[]).join(' / ')||'未确认')+' · '+row.paragraphs+' 段原文'));
  actions.append(preview);
 }else{
  const preview=make('button','预览与核对','text-button');
  preview.type='button';
  preview.onclick=async()=>{
   switchTab('find');$('collect-url').value=row.url;
   $('collect-status').textContent='正在读取官网正文…';
   try{
    openCollected(await api('/api/discovery/preview',{url:row.url}));
    $('commit-school').value='西南大学';$('commit-college').value=row.unit;
    await loadDiscovery();
    $('collect-status').textContent='已读取正文，可核对范围后入库。';
   }catch(error){$('collect-status').textContent=error.message;}
  };
  actions.append(preview);
 }
 actions.append(safeLink(row.url,'打开官方来源 ↗'));
 if(!row.notice&&row.provenance){
  const remove=make('button','删除','text-button');remove.type='button';
  remove.onclick=async()=>{
   if(!confirm('删除这份用户导入的本地资料？'))return;
   try{await api('/api/delete',{id:row.id});await loadInfo();}
   catch(error){$('library-status').textContent=error.message;}
  };
  actions.append(remove);
 }
 card.append(actions);
 return card;
}

function renderDocuments(){
 const rows=libraryRows(),unit=$('library-unit'),selected=unit.value;
 const names=[...new Set(rows.map(row=>row.unit).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 unit.replaceChildren(make('option','全部发布单位'),...names.map(name=>make('option',name)));
 unit.firstChild.value='';
 if(names.includes(selected))unit.value=selected;
 const words=$('library-query').value.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
 const filtered=rows.filter(row=>(!unit.value||row.unit===unit.value)&&(!libraryState.topic||row.tags.includes(libraryState.topic))&&
  words.every(word=>[row.title,row.unit,row.school,...row.tags].join(' ').normalize('NFKC').toLowerCase().includes(word)));
 $('documents').replaceChildren(...filtered.slice(0,libraryState.limit).map(libraryCard));
 $('library-count').textContent=filtered.length?'共 '+filtered.length+' 条，按发布日期从新到旧排列。':'当前筛选无匹配资料。';
 $('library-more').hidden=filtered.length<=libraryState.limit;
}

async function loadLibrary(action){
 const serial=++libraryState.serial;
 try{
  const data=await api('/api/library/swu',action);
  if(serial!==libraryState.serial)return;
  const ok=data.checks.filter(s=>!s.error).length,bad=data.checks.length-ok;
  const status=data.running?'正在检查官网…':data.last_checked?
   '最近检查 '+new Date(data.last_checked).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})+
   ' · '+ok+' 个入口成功'+(bad?' · '+bad+' 个入口未读到':''):'软件运行且联网时每天检查官网。';
  $('library-watch-status').textContent=status+(data.error?' · '+data.error:'');
  $('library-refresh').disabled=data.running;
  if(libraryState.watchKey!==data.last_checked||!libraryState.accepting){
   libraryState.accepting=true;libraryState.watchKey=data.last_checked;
   libraryState.notices=data.records;
   const checks=data.checks.map(check=>{
    const line=make('p');
    line.append(safeLink(check.url,check.unit),document.createTextNode(' · '+(check.error||check.count+' 条公开记录')));
    return line;
   });
   $('library-source-results').replaceChildren(...checks);
   renderDocuments();
  }
 }catch(error){
  if(serial===libraryState.serial)$('library-watch-status').textContent='读取官网检查状态失败。'+error.message;
 }
}

function initLibrary(){
 $('library-unit').onchange=$('library-query').oninput=()=>{libraryState.limit=24;renderDocuments();};
 $('library-refresh').onclick=()=>loadLibrary({action:'run'});
 $('library-more').onclick=()=>{libraryState.limit+=24;renderDocuments();};
 const topics=[...document.querySelectorAll('[data-library-topic]')];
 for(const button of topics)button.onclick=()=>{
  libraryState.topic=button.dataset.libraryTopic;
  libraryState.limit=24;
  for(const control of topics)control.setAttribute('aria-pressed',String(control===button));
  renderDocuments();
 };
 document.addEventListener('policylens-tab',event=>{if(event.detail==='library')loadLibrary();});
 if(!$('tab-library').hidden)loadLibrary();
 setInterval(()=>{if(!document.hidden&&!$('tab-library').hidden)loadLibrary();},10000);
}

initLibrary();

