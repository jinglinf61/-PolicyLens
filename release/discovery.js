let discoveryDraft=null,discoverySearching=false;
function discoveryMessage(id,text){$(id).textContent=text;}
async function loadDiscovery(){try{renderDiscoveryState(await api('/api/discovery/state'));}catch(e){discoveryMessage('watch-status',e.message);}}
function renderDiscoveryState(state){
 const list=$('watch-list');list.replaceChildren();
 for(const entry of state.watch){const card=make('article',undefined,'discovery-card');card.append(make('h3',entry.name),safeLink(entry.url,entry.url),make('p',`${entry.enabled?'自动监测已启用':'自动监测未启用'} · 每${entry.interval_minutes}分钟 · 最近检查：${entry.last_check||'尚未检查'}`,'metadata'));
 if(entry.last_result)card.append(make('p',`检查${entry.last_result.checked}个链接，新文件/变化${entry.last_result.new_or_changed}份。${(entry.last_result.errors||[]).join('\n')}`,'metadata'));
 const actions=make('div',undefined,'discovery-actions'),check=make('button','立即检查','button secondary');check.type='button';check.onclick=async()=>{check.disabled=true;discoveryMessage('watch-status','正在读取栏目并检查最多6份通知，可能需要一些时间…');try{const r=await api('/api/discovery/check',{id:entry.id});renderDiscoveryState(r.state);discoveryMessage('watch-status',`完成：检查${r.checked}份，新文件/变化${r.found.length}份。${r.errors.join('\n')}`);}catch(e){discoveryMessage('watch-status',e.message);}finally{check.disabled=false;}};
 const toggle=make('button',entry.enabled?'停用自动监测':'启用自动监测','button secondary');toggle.type='button';toggle.onclick=async()=>{try{renderDiscoveryState(await api('/api/discovery/watch',{...entry,enabled:!entry.enabled}));}catch(e){discoveryMessage('watch-status',e.message);}};actions.append(check,toggle);card.append(actions);list.append(card);}
 const inbox=$('discovery-inbox');inbox.replaceChildren();if(!state.inbox.length)inbox.append(make('p','暂无采集记录。可联网搜索、粘贴网址或上传文件，无需先入库。','muted'));
 for(const item of [...state.inbox].reverse()){const card=make('article',undefined,'discovery-card');card.append(make('h3',item.title),make('p',`${item.status==='imported'?'已核对入库':'待核验'} · ${item.source_label} · ${item.fetched_at}`,'metadata'),make('p',item.previous_candidates.length?'检测到同一来源的不同快照，历史内容保留；尚未认定替代关系。':'首次采集的快照。','metadata'));const actions=make('div',undefined,'discovery-actions'),read=make('button','预览与范围核对','button secondary');read.type='button';read.onclick=async()=>{try{openCollected(await api('/api/discovery/document?id='+encodeURIComponent(item.id)));}catch(e){discoveryMessage('collect-status',e.message);}};const discard=make('button','移出采集列表','text-button');discard.type='button';discard.onclick=async()=>{try{await api('/api/discovery/discard',{id:item.id});await loadDiscovery();}catch(e){discoveryMessage('collect-status',e.message);}};actions.append(read,discard);card.append(actions);inbox.append(card);}
}
$('discover-search').onsubmit=async e=>{
  e.preventDefault();
  if(discoverySearching)return;
  discoverySearching=true;
  $('discover-run').disabled=true;
  const local=$('discover-mode').value==='local';
  const scope=$('discover-scope').value;
  const domain=$('discover-domain').value.trim();
  const root=$('discover-results');
  root.replaceChildren();
  discoveryMessage('discover-status',local?'正在检索已入库正文…':'正在联网检索…');
  try{
    const result=await api('/api/discovery/'+(local?'local-search':'web-search'),{
      query:$('discover-query').value,scope,domain,
    });
    if(result.notice)root.append(make('p',result.notice,'eval-note'));
    for(const row of result.results){
      const card=make('article',undefined,'discovery-card');
      const source=local?(row.reviewed?'已入库，仍需核验适用范围':'元数据待确认'):row.source_label+' · '+row.domain;
      card.append(make('h3',row.title),safeLink(row.url,'打开来源网页 ↗'),make('p',source,'metadata'));
      if(row.snippet)card.append(make('p',row.snippet,'search-snippet'));
      if(local||row.preview_available!==false){
        const action=make('button',local?'定位匹配原文':'读取原文并预览','button secondary');
        action.type='button';
        action.onclick=()=>local?openDocument(row.id,row.section_id):collectUrl(row.url,action);
        card.append(action);
      }
      root.append(card);
    }
    if(result.fallback_url)root.append(safeLink(result.fallback_url,'在必应继续搜索 ↗'));
    let status=result.status==='unavailable'?'站内联网检索暂不可用。':`找到 ${result.results.length} 条结果。`;
    if(!local&&result.status!=='unavailable'&&!result.results.length&&scope!=='all')status+=' 可切换到全网扩大搜索范围。';
    if(result.warnings?.length)status+=' '+result.warnings.join('；');
    discoveryMessage('discover-status',status);
  }catch(error){
    discoveryMessage('discover-status',error.message);
  }finally{
    discoverySearching=false;
    $('discover-run').disabled=false;
  }
};
$('discover-example').onclick=()=>{$('discover-query').value='蓝桥杯';$('discover-mode').value='web';$('discover-domain').value='';$('discover-search').requestSubmit();};
async function collectUrl(url,button){if(button)button.disabled=true;discoveryMessage('collect-status','正在读取来源正文…');try{const d=await api('/api/discovery/preview',{url});openCollected(d);await loadDiscovery();discoveryMessage('collect-status','已读取并保存待核验快照，尚未加入核验证据。');}catch(e){discoveryMessage('collect-status',e.message);$('collect-status').scrollIntoView({block:'center'});}finally{if(button)button.disabled=false;}}
$('collect-form').onsubmit=e=>{e.preventDefault();if(!$('collect-url').value)return discoveryMessage('collect-status','请填写具体网页或文件网址。');collectUrl($('collect-url').value,$('collect-run'));};
$('collect-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('文件超过5 MB，请拆分。');discoveryMessage('collect-status','正在解析文件正文…');const encoded=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});openCollected(await cloudPreviewFile(file,encoded));await loadDiscovery();discoveryMessage('collect-status','文件已提取到待核验列表。');}catch(e){discoveryMessage('collect-status',e.message);}finally{e.target.value='';}};
function openCollected(d){discoveryDraft=d;$('collect-meta').replaceChildren(make('h3',d.title),safeLink(d.url,d.url||'本地文件'),make('p',`${d.source_label} · 采集于${d.fetched_at}\nSHA-256 ${d.source_sha256}`,'metadata'));$('collect-warnings').textContent=[...d.warnings,...(d.attachments.length?[`登记${d.attachments.length}个附件链接，尚未解析，可分别读取。`]:[])].join('\n');$('collect-body').replaceChildren(...d.sections.map(s=>{const p=make('div',undefined,'source-paragraph');p.append(make('small',s.id+(s.page?' · 第'+s.page+'页':'')+(s.origin==='ocr'?' · OCR待复核 · 识别分值'+s.ocr_confidence:'')),make('div',s.text));return p;}));$('preview-matches').replaceChildren();$('preview-query').value=$('discover-query').value;$('commit-title').value=d.title;$('commit-published').value=d.published||'';$('commit-school').value=d.source_label.includes('蓝桥杯')?'全国':d.source_label.includes('西南大学')?'西南大学':'';$('commit-college').value='全校';$('commit-topics').value=d.title.includes('蓝桥')?'蓝桥杯':'';$('commit-years').value='';$('commit-cohorts').value='';$('commit-edition').value='';$('commit-reviewed').checked=false;discoveryMessage('commit-status','');const t=$('commit-type');t.replaceChildren();for(const [value,label]of Object.entries(info.types)){const o=make('option',label);o.value=value;t.append(o);}t.value='competition_policy';const stage=$('commit-stage');stage.replaceChildren(make('option','未明确 / 不适用'));stage.firstChild.value='';for(const [value,label]of Object.entries(info.stages)){const o=make('option',label);o.value=value;stage.append(o);}if(!$('collect-dialog').open)$('collect-dialog').showModal();}
$('collect-close').onclick=()=>$('collect-dialog').close();
$('preview-find').onsubmit=async e=>{e.preventDefault();try{const r=await api('/api/discovery/lookup',{id:discoveryDraft.id,query:$('preview-query').value});const root=$('preview-matches');root.replaceChildren(make('p',r.notice));for(const row of r.results)root.append(make('div',row.snippet,'quote'));if(!r.results.length)root.append(make('p','未匹配到段落，请展开全文或调整关键词。'));}catch(e){$('preview-matches').textContent=e.message;}};
function yearList(id){const value=$(id).value.trim();if(!value)return [];return value.split(/[,，、\s]+/).map(Number);}
$('commit-form').onsubmit=async e=>{e.preventDefault();if(!discoveryDraft)return;$('commit-run').disabled=true;try{await api('/api/discovery/commit',{id:discoveryDraft.id,reviewed:$('commit-reviewed').checked,metadata:{title:$('commit-title').value.trim(),published:$('commit-published').value,school:$('commit-school').value.trim(),college:$('commit-college').value.trim(),doc_type:$('commit-type').value,topics:$('commit-topics').value.split(/[,，、]/).map(x=>x.trim()).filter(Boolean),policy_years:yearList('commit-years'),cohorts:yearList('commit-cohorts'),edition:$('commit-edition').value.trim(),stage:$('commit-stage').value}});await loadInfo();await loadDiscovery();discoveryMessage('commit-status','已加入资料库，可在收录资料全文搜索。');}catch(e){discoveryMessage('commit-status',e.message);}finally{$('commit-run').disabled=false;}};
$('watch-form').onsubmit=async e=>{e.preventDefault();try{renderDiscoveryState(await api('/api/discovery/watch',{name:$('watch-name').value,url:$('watch-url').value,interval_minutes:Number($('watch-interval').value),enabled:$('watch-enabled').checked}));discoveryMessage('watch-status','已保存。可在当前会话点击立即检查，新文件进入待核验列表。');}catch(e){discoveryMessage('watch-status',e.message);}};
$('inbox-refresh').onclick=loadDiscovery;
setInterval(()=>{if(!document.hidden&&!$('tab-find').hidden)loadDiscovery();},30000);
