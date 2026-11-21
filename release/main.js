function stageLabel(value){return info?.stages?.[value]||value||'未明确';}
const $=id=>document.getElementById(id);
let lastComparison=null,comparing=false;
const token=document.querySelector('meta[name="app-token"]').content;
let info=null,settingsDirty=false;
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const tag=(text,warn=false)=>make('span',text,'tag'+(warn?' warn':''));
function status(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';$('status').hidden=!text;}
async function api(path,data){if(typeof cloudApi==='function')return cloudApi(path,data);const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:{'X-App-Token':token,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});let body;try{body=await r.json();}catch{throw Error('服务返回无效，请检查启动窗口。');}if(!r.ok)throw Error(body.error||'请求失败。');return body;}
function safeLink(url,text){const a=make('a',text);try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{a.removeAttribute('href');a.textContent='本地资料，无外部链接';}return a;}
function download(data,name,type='application/json'){const blob=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type});const url=URL.createObjectURL(blob);const a=make('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function switchTab(tab){
  const names={home:'首页',find:'搜索与更新',library:'资料与版本',compare:'版本对照',admissions:'升学与院校对比',community:'经验社区',assistant:'校园成长助手',planner:'时间与习惯',evaluation:'原型评测',settings:'大模型设置'};
  if(tab==='search')tab='find';
  if(tab==='assistant'&&!$('assistant-frame').getAttribute('src'))$('assistant-frame').src='/assistant.html';
  if(!Object.hasOwn(names,tab))tab='home';
  for(const key of Object.keys(names))$(`tab-${key}`).hidden=key!==tab;
  document.querySelectorAll('.nav').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('tab-name').textContent=names[tab];document.body.classList.toggle('home-view',tab==='home');
  if(location.hash!=='#'+tab)history.replaceState(null,'','#'+tab);
  if(typeof closeFeatureMenu==='function')closeFeatureMenu();
  document.dispatchEvent(new CustomEvent('policylens-tab',{detail:tab}));
  if(tab==='admissions'&&typeof loadAdmissions==='function')loadAdmissions();
  if(tab==='community'&&typeof loadCommunity==='function')loadCommunity();
  if(tab==='evaluation')loadEvaluation();
  if(tab==='find'&&typeof loadDiscovery==='function')loadDiscovery();
}
document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
async function loadInfo(){
  info=await api('/api/info');
  if(typeof renderDocuments==='function')renderDocuments();
  populateComparison();
  if(info.llm)renderLlmSettings(info.llm);
}
async function openDocument(id,sectionId){try{const d=await api('/api/document?id='+encodeURIComponent(id));$('dialog-title').textContent=d.title;$('dialog-meta').replaceChildren(tag(info.types[d.doc_type]),tag('发布 '+(d.published||'未确认')),tag(d.college));$('dialog-source').replaceChildren(safeLink(d.url,d.url||'本地资料'));$('dialog-note').textContent=`${d.review_note||d.provenance||'范围标注由导入者提供。'}\n${d.transport_note||''}\n${d.source_sha256?'来源快照 SHA-256：'+d.source_sha256:''}`;$('dialog-body').replaceChildren();for(const s of d.sections){const row=make('div',undefined,'source-paragraph'+(s.id===sectionId?' focus':''));row.id='source-'+s.id;row.append(make('small',s.id+' / '+(s.heading||'原文段落')+(s.page?' · 第'+s.page+'页':'')+(s.origin==='ocr'?' · OCR待复核 · 识别分值'+s.ocr_confidence:'')),make('div',s.text));$('dialog-body').append(row);}$('document-dialog').showModal();if(sectionId)setTimeout(()=>document.getElementById('source-'+sectionId)?.scrollIntoView({block:'center'}),50);}catch(e){status(e.message,true);}}
$('close-dialog').onclick=()=>$('document-dialog').close();
$('template').onclick=async()=>{try{download(await api('/api/template'),'policy-import-template.json');}catch(e){$('library-status').textContent=e.message;}};
$('import-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2*1024*1024)throw Error('文件超过2 MB。');const d=JSON.parse(await f.text());const r=await api('/api/import',d);$('library-status').textContent=r.reviewed?'已导入。元数据确认是导入者声明，请继续核对来源。':'已导入，元数据待确认。';await loadInfo();}catch(error){$('library-status').textContent='导入失败：'+error.message;}finally{e.target.value='';}};
async function loadEvaluation(){try{const root=$('eval-content');root.replaceChildren();await loadCurrentAudit(root);root.append(make('h2','历史开发回归记录'),make('p','以下16题与24题结果对应扩库前的8份资料版本，保留用于追溯，不代表当前21份资料库表现。','eval-note'));const r=await api('/api/evaluation');if(r.status==='not_run')return;root.append(make('p',r.disclaimer,'eval-note'));const stats=make('div',undefined,'eval-stats');for(const [key,label]of [['bm25','原始BM25'],['scope_only','仅范围过滤'],['combined','范围＋问题锚点']]){const stat=make('div',undefined,'eval-stat');stat.append(make('strong',`${r.summary[key].passed} / ${r.summary[key].total}`),make('span',label+' · 预设证据检查通过数'));stats.append(stat);}root.append(stats);if(r.extended)root.append(make('p',`历史大创开发验证：${r.extended.passed} / ${r.extended.total}。${r.extended.disclaimer}`,'eval-note'));const wrap=make('div',undefined,'table-wrap');const table=make('table');const head=make('tr');for(const t of ['历史开发回归问题','原始检索','仅范围过滤','组合方案'])head.append(make('th',t));table.append(head);for(const c of r.cases){const row=make('tr');row.append(make('td',c.query));for(const k of ['bm25','scope_only','combined'])row.append(make('td',c[k].passed?'通过':'未通过',c[k].passed?'pass':'fail'));table.append(row);}wrap.append(table);root.append(wrap,make('p',r.metric_definition,'eval-note'),make('p','历史语料指纹：'+r.corpus_fingerprint.slice(0,24)+'…','eval-note'));await loadSemanticEvaluation(root);}catch(e){$('eval-content').textContent=e.message;}}
loadInfo().catch(e=>status('启动读取失败：'+e.message,true));

async function loadSemanticEvaluation(root){
 const r=await api('/api/semantic-evaluation');if(r.status==='not_run')return;
 root.append(make('h2','中文语义检索对照实验'),make('p',r.disclaimer,'eval-note'));
 const wrap=make('div',undefined,'table-wrap');const table=make('table');const head=make('tr');
 for(const text of ['方案','首条检查通过','可答题前4条命中','资料不足题拒答','热启动中位用时'])head.append(make('th',text));table.append(head);
 for(const [key,label]of [['rules','规则检索'],['dense','BGE语义检索'],['hybrid','BM25＋BGE融合']]){
  const x=r.summary[key];const row=make('tr');for(const text of [label,`${x.top1_passed}/${x.total}`,`${x.answerable_top4}/${x.answerable_total}`,`${x.refusal_passed}/${x.refusal_total}`,`${x.median_warm_ms} ms`])row.append(make('td',text));table.append(row);
 }wrap.append(table);root.append(wrap,make('p',r.metric_definition,'eval-note'),make('p','改进后的结果已在该探索集上调试，不能当作未见题表现。首次结果保存在项目 evaluation/semantic-first-run.json。未开展独立人工复核。','eval-note'));
 const failures=make('details');failures.append(make('summary','查看语义检索未通过的题目'));
 for(const c of r.cases.filter(c=>!c.dense.top1_passed)){const p=make('div',undefined,'trace-item');p.append(make('strong',c.id+' · '+c.query),make('p',c.expected.refuse?'预期应拒答，但仍返回了候选原文。':'首条未命中预设关键原文；人工核对仍有必要。'));failures.append(p);}root.append(failures);
}

function renderLlmSettings(c){if(!c)return;if(!settingsDirty){$('llm-provider').value=c.provider;$('llm-base').value=c.base_url;$('llm-model').value=c.model;$('llm-max-tokens').value=c.max_output_tokens;$('llm-max-requests').value=c.max_requests;$('llm-json').checked=c.json_mode;}$('llm-key-state').textContent=c.has_key?'服务端内存中已有密钥；输入框留空保留，接口不会返回密钥。':c.local_endpoint?'本机兼容服务可不填写密钥；请确保已加载模型。':'尚未填写API Key；密钥仅保存在本次运行内存中。';const u=c.usage;$('llm-usage').textContent=`本次运行已尝试调用 ${c.requests_used} / ${c.max_requests} 次。服务已报告输入 ${u.prompt_tokens}、输出 ${u.completion_tokens}、总计 ${u.total_tokens} token（收到 ${u.reports_received} 份usage）。未上报的用量不计入上述统计；本页不是账单。`;}
async function refreshLlm(){info.llm=await api('/api/llm/config');if(info.llm)renderLlmSettings(info.llm);}
function llmFormData(){return {provider:$('llm-provider').value,base_url:$('llm-base').value.trim(),model:$('llm-model').value.trim(),api_key:$('llm-key').value.trim(),max_output_tokens:Number($('llm-max-tokens').value),max_requests:Number($('llm-max-requests').value),json_mode:$('llm-json').checked};}
async function saveLlm(){const c=await api('/api/llm/config',llmFormData());$('llm-key').value='';settingsDirty=false;info.llm=c;renderLlmSettings(c);return c;}
$('llm-form').oninput=()=>{settingsDirty=true;};
$('llm-provider').onchange=()=>{const p=info.llm.presets[$('llm-provider').value];$('llm-base').value=p.base_url;$('llm-model').value=p.model;$('llm-key').value='';settingsDirty=true;};
$('llm-form').onsubmit=async e=>{e.preventDefault();try{await saveLlm();$('llm-settings-status').textContent='已保存在本次运行内存中；保存设置不会调用付费接口。';}catch(error){$('llm-settings-status').textContent=error.message;}};
$('llm-clear').onclick=async()=>{try{info.llm=await api('/api/llm/config',{...llmFormData(),clear_key:true});$('llm-key').value='';settingsDirty=false;if(info.llm)renderLlmSettings(info.llm);$('llm-settings-status').textContent='服务端内存中的密钥已清除。';}catch(error){$('llm-settings-status').textContent=error.message;}};
$('llm-test').onclick=async()=>{if($('llm-test').disabled)return;$('llm-test').disabled=true;$('llm-settings-status').textContent='正在测试连接（一次调用，不自动重试）…';try{await saveLlm();const r=await api('/api/llm/test',{});$('llm-settings-status').textContent=`连接测试通过 · ${r.trace.model_returned} · ${r.elapsed_ms} ms。`;}catch(error){$('llm-settings-status').textContent=error.message;}finally{$('llm-test').disabled=false;await refreshLlm();}};

const comparisonLabels={identical:'完全一致',similar:'相似段落 · 待核对',left_only:'仅 A 出现',right_only:'仅 B 出现'};
function clearComparison(){lastComparison=null;$('compare-results').hidden=true;$('compare-status').textContent='';$('compare-filter').value='differences';}
function populateComparison(){
 const previous=[$('compare-left').value,$('compare-right').value];
 for(const [index,id] of ['compare-left','compare-right'].entries()){
  const select=$(id);select.replaceChildren();
  for(const d of info.documents){const o=make('option',d.title);o.value=d.id;select.append(o);}
  select.value=info.documents.some(d=>d.id===previous[index])?previous[index]:info.documents[index]?.id||'';
 }clearComparison();
}
function scopeValue(key,value){
 if(Array.isArray(value))return value.length?value.join(' / '):'未明确';
 if(key==='doc_type')return info.types[value]||value;
 if(key==='stage')return info.stages?.[value]||'未标注 / 不适用';
 return value||'未标注 / 不适用';
}
function renderComparison(r){
 $('compare-results').hidden=false;$('compare-summary').textContent=r.scope.notice+' '+r.notice;
 const root=$('compare-scope'),wrap=make('div',undefined,'table-wrap'),table=make('table'),head=make('tr');
 for(const label of ['范围维度','资料 A','资料 B','核对结果'])head.append(make('th',label));table.append(head);
 for(const x of r.scope.rows){const row=make('tr');for(const text of [x.label,scopeValue(x.field,x.left),scopeValue(x.field,x.right),{same:'已标注一致',different:'不一致',unknown:'尚未明确'}[x.status]])row.append(make('td',text));row.lastChild.className=x.status==='same'?'pass':'fail';table.append(row);}
 wrap.append(table);root.replaceChildren(wrap);
 if(r.scope.issues.length)root.append(make('p','需要核对：'+r.scope.issues.join('；'),'eval-note'));
 $('compare-counts').replaceChildren(...Object.entries(r.counts).map(([k,n])=>tag(comparisonLabels[k]+' '+n,k!=='identical')));
 $('compare-limit').textContent=`已展示最多 ${r.display_limit} 组段落；另有 ${r.rows_omitted} 组未展示。${r.pairing_limited?'相似配对达到计算上限，未配对段落仍保留在各自一侧。':''} 相似配对使用段首最多2048字符；超过长度的原文仍完整保留。`;
 renderComparisonRows();
}
function comparisonSide(ref,segments,side){
 const column=make('div',undefined,'compare-side');column.append(make('strong',side==='left'?'资料 A':'资料 B'));
 if(!ref){column.append(make('p','该侧未对齐到段落','muted'));return column;}
 const locate=make('button','定位原文 '+ref.section_id,'text-button');locate.onclick=()=>openDocument(ref.doc_id,ref.section_id);column.append(locate);
 if(ref.heading)column.append(make('p',ref.heading,'muted'));
 const quote=make('div',undefined,'compare-quote');
 if(segments){for(const s of segments){if(!s[side])continue;quote.append(make(s.kind==='equal'?'span':'mark',s[side],s.kind==='equal'?'':side==='left'?'diff-left':'diff-right'));}}
 else quote.textContent=ref.text;
 column.append(quote,make('p','原文 SHA-256 · '+ref.text_sha256.slice(0,24)+'…','hash'));return column;
}
function renderComparisonRows(){
 if(!lastComparison)return;const mode=$('compare-filter').value,root=$('compare-paragraphs');root.replaceChildren();
 const rows=lastComparison.rows.filter(r=>mode==='all'||mode==='differences'&&r.kind!=='identical'||r.kind===mode);
 for(const r of rows){const card=make('article',undefined,'comparison-card');card.append(make('h3',comparisonLabels[r.kind]));
  const grid=make('div',undefined,'compare-grid');grid.append(comparisonSide(r.left,r.segments,'left'),comparisonSide(r.right,r.segments,'right'));card.append(grid);
  if(r.kind==='similar')card.append(make('p','相似度仅用于建议配对，不证明两段是修订关系。'+(r.inline_diff_omitted?'长段落省略字内高亮，完整原文保留。':''),'muted'));
  root.append(card);
 }if(!rows.length)root.append(make('p','当前显示范围内没有此类段落；请查看其他类型或两份完整原文。','eval-note'));
}
$('compare-form').onsubmit=async e=>{
 e.preventDefault();if(comparing)return;comparing=true;$('compare-run').disabled=true;
 const left=$('compare-left').value,right=$('compare-right').value;clearComparison();$('compare-status').textContent='正在本机核对范围与原文…';
 try{const r=await api('/api/compare',{left_id:left,right_id:right});
  if($('compare-left').value!==left||$('compare-right').value!==right){$('compare-status').textContent='选择已变化，请重新对照。';return;}
  lastComparison=r;renderComparison(r);$('compare-status').textContent='已完成原文对照；未调用大模型，未判定政策替代关系。';
 }catch(error){$('compare-status').textContent=error.message;}
 finally{comparing=false;$('compare-run').disabled=false;}
};
for(const id of ['compare-left','compare-right'])$(id).onchange=clearComparison;
$('compare-swap').onclick=()=>{const left=$('compare-left').value;$('compare-left').value=$('compare-right').value;$('compare-right').value=left;clearComparison();};
$('compare-filter').onchange=renderComparisonRows;
$('compare-export').onclick=()=>{if(lastComparison)download(lastComparison,'PolicyLens-范围原文对照.json');};
function comparisonExample(left,right){$('compare-left').value=left;$('compare-right').value=right;$('compare-form').requestSubmit();}
$('compare-example-stage').onclick=()=>comparisonExample('innovation-application-2026','innovation-taskbook-2026');
$('compare-example-edition').onclick=()=>comparisonExample('plant-hh9','hh10-academic');


$('compare-example-years').onclick=()=>comparisonExample('innovation-application-2024','innovation-application-2025');

async function loadCurrentAudit(root){const r=await api('/api/audit-evaluation');if(r.status==='not_run')return;
 root.append(make('h2','v0.6冻结资料库的60题开发审计（历史基线）'),make('p','该结果来自v0.6源码和21份固定资料，不代表新增采集资料或v0.7搜索功能的效果。41题可答、19题预期资料不足。题集在运行前冻结，由AI辅助编写和标注；未经过独立人工复核，不是盲测或泛化准确率。','eval-note'));
 const wrap=make('div',undefined,'table-wrap'),table=make('table'),head=make('tr');for(const t of ['方案','可答首条命中','可答前4条命中','资料不足题拒答','出现范围不符候选的问题'])head.append(make('th',t));table.append(head);
 for(const [key,label]of [['bm25','原始BM25'],['scope','BM25＋范围'],['rules','范围＋问题锚点'],['dense','BGE＋范围'],['hybrid','RRF融合＋范围']]){const x=r.summary[key],row=make('tr');for(const t of [label,`${x.answerable_top1}/41`,`${x.answerable_top4}/41`,`${x.unsupported_refused}/19`,`${x.wrong_scope_questions}/60`])row.append(make('td',t));table.append(row);}wrap.append(table);root.append(wrap,
 make('p','范围错误以程序解析的意图为参照，硬过滤后的0不证明意图识别正确。前4条命中只说明找到了候选，不能证明模型答案正确。7道资料不足题仍返回候选，失败记录全部保留。','eval-note'));
 const d=make('details');d.append(make('summary','查看本轮融合检索失败题'));for(const c of r.cases.filter(c=>!c.hybrid.top1_passed)){d.append(make('p',c.id+' '+c.query+'：'+(c.expected.refuse?'应拒答但仍返回候选':'首条未命中开发者预设证据'),'eval-note'));}root.append(d);
 const a=make('a','打开真实试用任务记录页');a.href='/study.html';a.target='_blank';root.append(make('p','真人试用尚未开展。以下入口用于匿名计时与导出记录，不会自动生成试用结果。','eval-note'),a);
}
