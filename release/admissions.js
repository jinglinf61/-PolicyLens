/* The server owns extracted evidence; source text is only inserted with textContent. */
let admissionsData=null,admissionsReport=null,admissionsProfile=null;
const admissionsSelected=new Set(['admissions-scu26','admissions-scu']);
const afields={rank:'排名与例外',english:'英语与替代考试',paper:'论文与成果',eligibility:'应届、资格与背景',assessment:'考核方式',dates:'时间节点',general:'其他条件候选'};
function aid(el,id){el.id=id;return el;}
function abutton(text,fn){const b=make('button',text,'button secondary');b.type='button';b.onclick=fn;return b;}
function alabel(text,id,type='text',value=''){const l=make('label',text),i=aid(make('input'),id);i.type=type;i.value=value;l.append(i);return l;}
function astatus(text){$('admissions-status').textContent=text;}
function aselected(){return [...admissionsSelected];}
async function loadAdmissions(){
 if(admissionsData)return;
 const root=$('admissions-root');root.textContent='正在整理院校与文档…';
 try{admissionsData=await api('/api/admissions/catalog');buildAdmissions();}catch(e){root.textContent=e.message;}
}
function buildAdmissions(){
 const d=admissionsData,root=$('admissions-root');root.replaceChildren(make('p','ADMISSIONS · EVIDENCE · CHANGE','eyebrow'),make('h1','让择校，回到具体条件。'),make('p','西南大学软件工程学习与申请规划 · 院校横向对比 / 历年政策纵向对照','lead'));
 const coverage=d.coverage;
 const infoBox=aid(make('div',undefined,'answer'),'adm-overview');
 const archiveSummary=make('p','正在读取2027年推免接收归档统计…');
 const sources=make('div',undefined,'evidence-actions');
 sources.append(
  safeLink('https://yz.swu.edu.cn/info/1005/3562.htm','西南大学2027年推免预报名通知 ↗'),
  safeLink('https://cis.swu.edu.cn/info/1145/5999.htm','计信院与软件学院2027年推免复试细则 ↗')
 );
 const details=make('details');
 details.append(
  make('summary','可对比资料覆盖与申请条件说明'),
  make('p',`计算机、软件和人工智能等方向的重点院系目录收录${coverage.departments_total}个招生单位，其中${d.department_year_coverage['2027_body']}个有2027年正文，${d.department_year_coverage.historical_only}个仅有更早年度正文。`),
  make('p',d.paper_guidance)
 );
 infoBox.append(
  make('strong','推免接收资料概览'),
  archiveSummary,
  make('p','申请目标院系前，先核对西南大学当年的推荐办法。申请接收时需按目标院系细则核对专业范围、材料和复试安排。'),
  sources,
  make('p','个人录取概率暂不提供。现有公示资料缺少可核对的完整申请样本。'),
  details
 );
 root.append(infoBox,admissionsWatchPanel(),tm2027Panel((data)=>{
  archiveSummary.textContent=data?.available
   ? `2027招生年度归档覆盖${data.coverage.length}所原985工程高校，含${data.files}条官网文件与目录、${data.programs}条专业索引，附件请从相应官网查看。报考其他年度请核对当年通知。`
   : '2027年推免接收归档暂无法读取，可先查看下方官网来源。';
 }));
 const directory=make('section',undefined,'llm-settings');directory.append(make('h2','39所985高校 · 官方资料覆盖'),make('p',d.roster_note),make('p','点击学校查看已有文件；正文待补的学校可打开官方入口或继续搜索。校级文件不能替代目标院系要求。'),aid(make('p',undefined,'eval-note'),'adm-coverage'),aid(make('div',undefined,'adm-universities'),'adm-universities'));root.append(directory);
 const tools=make('div',undefined,'llm-settings'),filters=make('div',undefined,'settings-fields');filters.append(alabel('搜索学校、院系或标题','adm-filter'));
 const rl=make('label','业务类型'),rs=aid(make('select'),'adm-route');for(const [v,t]of [['','所有类型'],...Object.entries(d.routes)]){const o=make('option',t);o.value=v;rs.append(o);}rl.append(rs);filters.append(rl);
 const ul=make('label','院校范围'),us=aid(make('select'),'adm-university');for(const u of [{id:'',school:'全部院校（含西南大学）'},...d.universities]){const o=make('option',u.school);o.value=u.id;us.append(o);}ul.append(us);filters.append(ul);tools.append(filters,make('p','勾选2—6份生成并列表格。默认选择四川大学连续两年章程；院校层次不能替代院系难度证据。','muted'),aid(make('div',undefined,'admissions-picks'),'adm-picks'));
 const dl=make('label','招生院系'),ds=aid(make('select'),'adm-department');dl.append(ds);filters.append(dl);const sl=make('label'),sc=aid(make('input'),'adm-school-rules');sc.type='checkbox';sl.append(sc,document.createTextNode('同时显示该校校级规则（单独标注）'));filters.append(sl);tools.append(aid(make('p',undefined,'eval-note'),'adm-unit-note'));
 const actions=make('div',undefined,'settings-buttons');actions.append(abutton('对比所选资料 ⇄',runAdmissions),abutton('示例：四川大学历年变化',()=>{admissionsSelected.clear();['admissions-scu26','admissions-scu'].forEach(x=>admissionsSelected.add(x));renderAdmissionPicks();runAdmissions();}),abutton('示例：西南与上海交大',()=>{admissionsSelected.clear();['cis-admission-2027','admissions-sjtu'].forEach(x=>admissionsSelected.add(x));renderAdmissionPicks();runAdmissions();}),abutton('示例：清华连续三年考核公式',()=>{admissionsSelected.clear();['admissions-unit-tsinghua-cs25','admissions-unit-tsinghua-cs26','admissions-unit-tsinghua-cs'].forEach(x=>admissionsSelected.add(x));$('adm-university').value='tsinghua';renderDepartmentOptions();$('adm-department').value='tsinghua-cs';$('adm-filter').value='';renderAdmissionPicks();runAdmissions();}),abutton('示例：清华与中南计算机院系',()=>{admissionsSelected.clear();['admissions-unit-tsinghua-cs','admissions-unit-csu-cs'].forEach(x=>admissionsSelected.add(x));$('adm-university').value='';$('adm-filter').value='';renderDepartmentOptions();renderAdmissionPicks();runAdmissions();}),abutton('刷新资料',async()=>{admissionsData=await api('/api/admissions/catalog');admissionsReport=null;admissionsProfile=null;$('adm-comparison').replaceChildren();$('adm-profile-result').replaceChildren();renderDepartmentOptions();renderUniversityDirectory();renderAdmissionPicks();}),abutton('找目标院系最新文件 ↗',()=>{switchTab('find');$('discover-query').value=($('adm-filter').value||'计算机 软件学院')+' 推免 接收 细则';$('discover-scope').value='all';}));tools.append(actions);root.append(tools,aid(make('p',undefined,'eval-note'),'admissions-status'));
 root.append(make('h2','个人条件核对'),make('p','用于规划与查缺，不给录取概率。成绩不持久化；未填写的条件保留为未知。'));
 const form=aid(make('form',undefined,'llm-settings'),'adm-profile-form'),fields=make('div',undefined,'settings-fields');
 for(const [t,id,type,v] of [['预计毕业年','adm-graduation','number','2030'],['专业排名百分比（前10%填10）','adm-rank','number',''],['CET6成绩','adm-CET6','number',''],['TOEFL成绩','adm-TOEFL','number',''],['IELTS成绩','adm-IELTS','number','']]){const l=alabel(t,id,type,v);l.lastChild.step=id==='adm-graduation'?'1':'0.1';l.lastChild.min=id==='adm-graduation'?'2020':'0';l.lastChild.max=({'adm-graduation':2100,'adm-rank':100,'adm-CET6':710,'adm-TOEFL':120,'adm-IELTS':9})[id];fields.append(l);}form.append(fields);const submit=make('button','核对所选院系条件','button primary');form.append(submit);form.onsubmit=async e=>{e.preventDefault();try{const profile={graduation_year:$('adm-graduation').value,rank_percent:$('adm-rank').value,...Object.fromEntries(['CET6','TOEFL','IELTS'].map(k=>[k,$('adm-'+k).value]))};admissionsProfile=await api('/api/admissions/profile',{ids:aselected(),profile});renderAdmissionProfile();astatus('已核对；没有将最低门槛换算为录取概率。');}catch(err){astatus(err.message);}};
 root.append(form,aid(make('div'),'adm-profile-result'),aid(make('div'),'adm-comparison'));
 root.append(make('h2','从大一开始准备'));for(const step of d.roadmap){const c=make('article',undefined,'discovery-card');c.append(make('h3',step.stage),make('p',step.tasks));root.append(c);}
 const research=aid(make('section',undefined,'llm-settings'),'adm-research-validation');research.append(make('h2','模型实测与数据边界'),make('p',`本地OCR：${d.ocr_status.available?'组件已就绪':'组件未就绪'}；扫描PDF最多${d.ocr_status.max_scanned_pages}页。`),make('p',d.ocr_status.notice));
 if(d.model_benchmark){const bench=d.model_benchmark;research.append(make('p',bench.task),make('p',`${bench.n}道开发标注题：开发${bench.development_n}题，按文件留出${bench.heldout_n}题；独立审核${bench.independent_reviewers}人。留出题在两轮比较中重复使用，结果仅作探索。`,'eval-note'));const wrap=make('div',undefined,'table-wrap'),table=make('table'),head=make('tr');for(const t of ['方法','开发标签一致','留出标签一致','留出引用格式有效','平均耗时'])head.append(make('th',t));table.append(head);for(const m of bench.methods){const row=make('tr'),a=m.metrics.dev,b=m.metrics.holdout;for(const t of [m.name,`${a.correct}/${a.n}`,`${b.correct}/${b.n}`,`${Math.round(b.quote_valid_rate*100)}%`,`${b.mean_ms}ms`])row.append(make('td',t));table.append(row);}wrap.append(table);research.append(wrap,make('p','这是给定原文下的窄范围条款分类，不含检索，也不代表通用模型或升学判断准确率。规则返回输入原文，引用格式列不能当作语义正确性指标。部分推理曾并发运行，耗时受负载影响，不用于可靠速度排名。云端模型未运行：'+bench.cloud_models.reason),abutton('导出模型对比原始统计 JSON',()=>download(bench,'PolicyLens-模型对比统计.json')));}
 const risk=d.difficulty_validation;if(risk.public_evidence)root.append(publicOutcomePanel(risk.public_evidence));research.append(make('h3','录取难度验证：'+(risk.status==='blocked'?'数据不足，尚未验证':'已离线评测，尚需独立验证')),make('p',risk.reasons.join('；'),'eval-note'),make('p',risk.notice));for(const requirement of risk.requirements)research.append(make('p','• '+requirement));research.append(abutton('导出验证状态 JSON',()=>download(risk,'PolicyLens-录取模型验证状态.json')));root.append(research);
 root.append(make('h2','如何核对新增资料？'),make('p','在“搜索与更新”搜索官网或上传PDF/DOCX，预览后确认学校、学院、年度、类型并入库，再回此页刷新即可勾选。统考文件请选“研究生统考招生”。39所目录已齐备；扫描件OCR已接入并需逐页复核；更多院系正文、连续年份数据及经过真实数据验证的录取难度模型仍待补充。','eval-note'));
 $('adm-filter').oninput=()=>{renderUniversityDirectory();renderAdmissionPicks();};$('adm-route').onchange=renderAdmissionPicks;$('adm-university').onchange=()=>{renderDepartmentOptions();renderAdmissionPicks();};ds.onchange=renderAdmissionPicks;sc.onchange=renderAdmissionPicks;renderDepartmentOptions();renderUniversityDirectory();renderAdmissionPicks();
}
function publicOutcomePanel(data){
 const panel=aid(make('section',undefined,'llm-settings'),'adm-public-outcomes');
 panel.append(make('h2','真实公示数据 · 分阶段历史参考'),make('p',`已归档${data.sources_downloaded}份官方材料，解析${data.parsed_observations}条阶段观察；可用于个人概率训练的完整记录${data.training_eligible_records}条。`),make('p',data.observation_note),make('p',data.notice,'eval-note'));
 const labels={assessment_published:'成绩已公示，录取未知',provisional_offer:'拟录取',shortlisted:'复试入选',nominated:'拟推荐资格',waitlisted:'候补，非拒绝',explicit_not_offered:'原文明示不予拟录取'};
 const controls=make('div',undefined,'settings-fields'),school=aid(make('select'),'adm-public-school'),degree=aid(make('select'),'adm-public-degree');
 for(const [select,values] of [[school,['全部学校',...new Set(data.groups.map(g=>g.school))]],[degree,['全部学位','硕士','博士','本科']]])for(const value of values){const o=make('option',value);o.value=value;select.append(o);}
 const sl=make('label','学校'),dl=make('label','学位 / 阶段');sl.append(school);dl.append(degree);controls.append(sl,dl);panel.append(controls);
 const chart=aid(make('div'),'adm-public-chart'),wrap=make('div',undefined,'table-wrap'),table=aid(make('table'),'adm-public-table');wrap.append(table);panel.append(chart,wrap);
 const render=()=>{const groups=data.groups.filter(g=>(school.value==='全部学校'||g.school===school.value)&&(degree.value==='全部学位'||g.degree===degree.value));table.replaceChildren();const head=make('tr');for(const text of ['学校 / 单位','招生年度','专业 / 学位','公示阶段','已解析记录','证据'])head.append(make('th',text));table.append(head);for(const g of groups){const row=make('tr');for(const text of [g.school+' / '+g.department,g.cohort||'招生年未明确（文件2024）',g.program+' / '+g.degree,labels[g.status]||g.status,g.n])row.append(make('td',String(text)));const link=make('td');link.append(safeLink(g.source_url,'官方原文 ↗'));row.append(link);table.append(row);}chart.replaceChildren(make('p','公示记录分布（所选范围）；各阶段不能相除计算录取率。'));const counts={};for(const g of groups)counts[g.status]=(counts[g.status]||0)+g.n;const max=Math.max(1,...Object.values(counts));for(const [status,n]of Object.entries(counts)){const row=make('div'),label=make('p',`${labels[status]||status}：${n}条`),bar=make('div');bar.style.cssText=`height:10px;background:#235844;width:${n/max*100}%;margin-bottom:12px`;row.append(label,bar);chart.append(row);}};
 school.onchange=degree.onchange=render;render();
 for(const audit of data.linkage_audits)panel.append(make('p',`${audit.school}${audit.cohort}年：复试入选${audit.shortlist_n}条，成绩表${audit.score_n}条，对齐${audit.matched}条；${audit.shortlist_without_score}条未匹配到成绩，结果保持未知。`),make('p',audit.notice,'eval-note'));
 const details=make('details');details.append(make('summary','采集台账与缺失原因'));for(const s of data.sources){const row=make('p');row.append(safeLink(s.url,s.school+' · '+s.id),document.createTextNode(' · '+(s.body_removed?'公示已结束，正文撤下':s.status)+(s.scope_note?' · '+s.scope_note:'')));details.append(row);}panel.append(details,abutton('导出真实数据统计 JSON',()=>download(data,'PolicyLens-真实公示数据统计.json')),make('p','尚缺：'+data.missing.join('；')));return panel;
}
function renderDepartmentOptions(){const root=$('adm-department'),old=root.value,school=$('adm-university').value;root.replaceChildren();for(const unit of [{id:'',name:'全部院系与校级资料'},...admissionsData.departments.filter(x=>!school||x.school_id===school)]){const years=(unit.years||[]).join('/'),pending=(unit.missing_years||[]).join('/');const o=make('option',unit.id?unit.school+' · '+unit.name+'（'+(years?years+'正文':'正文未取得')+(pending?'；'+pending+'待补':'')+'）':unit.name);o.value=unit.id;root.append(o);}root.value=[...root.options].some(o=>o.value===old)?old:'';}
function renderUniversityDirectory(){
 const root=$('adm-universities'),q=$('adm-filter').value.trim().toLowerCase();root.replaceChildren();
 const names={unit_body:'院系正文已采集',school_body:'校级正文 · 院系待补',pending_body:'正文待补'};
 for(const u of admissionsData.universities.filter(x=>!q||[x.school,x.focus_unit,x.domain].join(' ').toLowerCase().includes(q))){
  const c=make('article',undefined,'adm-university'),title=make('h3',u.school);c.dataset.school=u.id;
  c.append(title,make('strong',names[u.coverage]),make('p',u.focus_unit),make('p',u.coverage_note),safeLink(u.official_url,'官方入口 ↗'));
  for(const unit of u.departments){const box=make('div',undefined,'adm-unit');box.append(make('strong',unit.name),make('p',unit.status==='unit_body'?`${unit.document_ids.length}份院系正文 · ${(unit.years||[]).join('/')}招生年度`:unit.note));if(unit.status==='unit_body'&&(unit.missing_years||[]).length)box.append(make('p',unit.missing_years.join('/')+'年度仍待补','eval-note'));box.append(safeLink(unit.official_url,'院系官方入口 ↗'),abutton(unit.status==='unit_body'?'查看院系文件':'查看缺口与校级参考',()=>{$('adm-university').value=u.id;$('adm-filter').value='';renderDepartmentOptions();$('adm-department').value=unit.id;$('adm-school-rules').checked=unit.status==='pending_body';renderAdmissionPicks();$('adm-picks').scrollIntoView({behavior:'smooth',block:'start'});}));c.append(box);}
  if(u.document_ids.length)c.append(abutton(`查看该校${u.document_ids.length}份资料`,()=>{$('adm-university').value=u.id;$('adm-filter').value='';renderDepartmentOptions();$('adm-department').value='';renderUniversityDirectory();renderAdmissionPicks();$('adm-picks').scrollIntoView({behavior:'smooth',block:'start'});}));
  c.append(abutton('搜索该校最新文件',()=>{switchTab('find');$('discover-query').value=u.school+' 计算机 软件 人工智能 推免 接收 细则';$('discover-scope').value='all';}));root.append(c);
 }
 $('adm-coverage').textContent=`目录显示${root.children.length} / ${admissionsData.coverage.total}所；有正文不代表已覆盖该校全部专业、校区和年份。`;
}
function renderAdmissionPicks(){
 const q=$('adm-filter').value.trim().toLowerCase(),route=$('adm-route').value,root=$('adm-picks'),university=admissionsData.universities.find(u=>u.id===$('adm-university').value),unit=admissionsData.departments.find(x=>x.id===$('adm-department').value);root.replaceChildren();
 $('adm-unit-note').textContent=unit?unit.school+' · '+unit.name+'：'+unit.note+(unit.status==='pending_body'?' 尚不能据此判断院系申请资格。':''):'选择具体招生单位后只显示对应院系文件；勾选校级规则可同时核对学校通用要求。';
 for(const r of admissionsData.records.filter(x=>(!university||x.school===university.school)&&(!unit||unit.document_ids.includes(x.id)||($('adm-school-rules').checked&&unit.school_document_ids.includes(x.id)))&&(!route||x.route===route)&&(!q||[x.school,x.unit,x.title,...x.years].join(' ').toLowerCase().includes(q)))){
  const card=make('article',undefined,'adm-pick'),l=make('label'),c=make('input');c.type='checkbox';c.value=r.id;c.checked=admissionsSelected.has(r.id);c.onchange=()=>{if(c.checked&&admissionsSelected.size>=6){c.checked=false;astatus('最多选择6份。');return;}c.checked?admissionsSelected.add(r.id):admissionsSelected.delete(r.id);admissionsReport=null;admissionsProfile=null;$('adm-comparison').replaceChildren();$('adm-profile-result').replaceChildren();astatus(`已选${admissionsSelected.size}份；请重新生成对比。`);};l.append(c,make('strong',r.school+' · '+r.years.join('/')));card.append(l,make('p',r.unit+' / '+admissionsData.routes[r.route]+'\n'+r.title),abutton('原文与提取证据',()=>showAdmissionSource(r.id)));root.append(card);
  card.append(make('small',(r.scope_level==='school'?'校级规则':'院系文件')+' · '+(r.admission_stage||'业务阶段见原文')));
  if(r.key_points.length){const details=make('details',undefined,'adm-key-points');details.append(make('summary','关键条款 · 附原文证据'));for(const point of r.key_points){const row=make('div');row.append(make('strong',point.category),make('p',point.text),abutton('证据 '+point.section_ids.join(' / '),()=>showAdmissionSource(r.id,point.section_ids[0])));details.append(row);}details.append(make('small','开发整理，须核对原文与当年完整文件。'));card.append(details);}
  if(r.clause_checks.length){const details=make('details',undefined,'adm-clause-checks');details.append(make('summary','自动条款分类 · 待复核'));for(const x of r.clause_checks.slice(0,18))details.append(abutton(x.section_id+' · '+x.label_text,()=>showAdmissionSource(r.id,x.section_id)));details.append(make('small','只分类当前段落；PDF换行可能拆开限定条件，未知不等于没有要求。'));card.append(details);}
 }if(!root.children.length)root.append(make('p',unit&&unit.status==='pending_body'?'该院系正文尚未取得；可勾选校级参考，并通过院系官方入口补充。':'没有匹配资料；可前往搜索与更新补充。'));
}
function admissionTable(rows){const wrap=make('div',undefined,'table-wrap'),t=make('table'),h=make('tr');h.append(make('th','对比维度'));for(const r of rows)h.append(make('th',r.school+' / '+r.years.join('/')+' / '+r.unit));t.append(h);
 const fields=[['关键条款（开发整理）',r=>r.key_points.length?r.key_points.map(p=>p.category+'：'+p.text+'\n'+p.evidence.map(e=>e.section_id+' / '+e.quote).join('\n')).join('\n\n'):'本文件尚未整理关键条款，请查看原文与候选字段'],['范围',r=>admissionsData.routes[r.route]+'；'+r.program_scope],['发布与样例定位',r=>(r.published||'发布日期未提取')+'；历史样例，核对本人毕业年份'],['排名',r=>r.fields.rank.map(x=>x.quote).join('\n')||'本文件未明确；不能视为没有要求'],['英语',r=>r.fields.english.map(x=>x.quote).join('\n')||'本文件未明确数值，需核对院系细则'],['论文判断',r=>r.paper_status],['计划名额',r=>r.fields.quotas.map(x=>`${x.metric} ${x.value}人（${x.scope}，${x.definition}）`).join('\n')||'未整理出可比较数字；不填0'],['考核',r=>r.fields.assessment.slice(0,6).map(x=>x.quote).join('\n')||'未提取，见原文'],['时间节点',r=>r.fields.dates.map(x=>(x.date||'日历年待结合上下文')+' / '+(x.approximate?'暂定/约数 / ':'')+x.quote).join('\n')||'未提取明确日期'],['证据与完整性',r=>r.url+'\n'+r.review_status+'\n'+r.transport_note]];
 for(const [label,fn]of fields){const tr=make('tr');tr.append(make('th',label));for(const r of rows)tr.append(make('td',fn(r)));t.append(tr);}wrap.append(t);return wrap;
}
function admissionChart(chart){const card=make('article',undefined,'discovery-card');card.append(make('h3',chart.label),make('p',chart.scope+' / '+chart.definition));const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 800 ${Math.max(180,chart.points.length*75+35)}`);svg.setAttribute('role','img');svg.setAttribute('aria-label',chart.points.map(p=>p.year+'年'+p.value+chart.unit).join('，'));const max=Math.max(...chart.points.map(p=>p.value),1);
 chart.points.forEach((p,i)=>{const y=28+i*75,rect=document.createElementNS(ns,'rect');for(const [k,v]of Object.entries({x:80,y,width:500*p.value/max,height:30,fill:'#235844',rx:3}))rect.setAttribute(k,v);svg.append(rect);for(const [x,text]of [[8,p.year],[90+500*p.value/max,p.value+chart.unit]]){const t=document.createElementNS(ns,'text');t.setAttribute('x',x);t.setAttribute('y',y+21);t.setAttribute('font-size',14);t.textContent=text;svg.append(t);}});card.append(svg,make('p',`首末年份变化：${chart.delta>0?'+':''}${chart.delta}${chart.unit==='%'?'个百分点':chart.unit}。${chart.notice}`));for(const p of chart.points)card.append(abutton(`${p.year}年 · ${p.section_id} 证据`,()=>showAdmissionSource(p.document_id,p.section_id)));return card;}
async function runAdmissions(){try{admissionsProfile=null;$('adm-profile-result').replaceChildren();admissionsReport=await api('/api/admissions/compare',{ids:aselected()});const r=admissionsReport,root=$('adm-comparison');root.replaceChildren(make('h2','并列条件与历年变化'));for(const w of r.warnings)root.append(make('p',w,'eval-note'));const a=make('div',undefined,'settings-buttons');a.append(abutton('导出图表报告 HTML',()=>exportAdmissions('html')),abutton('导出表格 CSV',()=>exportAdmissions('csv')),abutton('导出证据 JSON',()=>download({comparison:admissionsReport,profile:admissionsProfile},'PolicyLens-院校对比.json')));root.append(a,admissionTable(r.records));if(r.charts.length){root.append(make('h2','计划趋势与考核公式对照'));for(const c of r.charts)root.append(admissionChart(c));}else root.append(make('p','当前选择没有同校、同范围、同定义的连续年份数值，未绘制趋势图。不会用未知值补0。','eval-note'));astatus('对比完成。表格差异是文件差异，不是录取难度排名。');}catch(e){astatus(e.message);}}
function renderAdmissionProfile(){const root=$('adm-profile-result');root.replaceChildren(make('p',admissionsProfile.notice,'eval-note'));for(const c of admissionsProfile.checks){const card=make('article',undefined,'discovery-card');card.append(make('h3',c.title));for(const x of c.items){const box=make('details');box.append(make('summary',x.label+' · '+x.status),make('p',x.detail));for(const e of x.evidence){box.append(make('blockquote',e.section_id+' / '+e.quote));}card.append(box);}root.append(card);}}
async function showAdmissionSource(id,focus){try{const d=await api('/api/admissions/document?id='+encodeURIComponent(id));$('dialog-title').textContent=d.title;$('dialog-meta').replaceChildren(make('p',d.school+' / '+(d.college||d.unit||'待核对')));$('dialog-source').replaceChildren(safeLink(d.url,'打开官方来源 ↗'));$('dialog-note').textContent=(d.transport_note||'自动提取，需核对原文与附件。')+'\nSHA-256：'+(d.source_sha256||'未记录');$('dialog-body').replaceChildren();for(const s of d.sections){const b=make('div',undefined,'source-paragraph'+(s.id===focus?' focus':''));b.append(make('small',s.id+(s.page?' · 第'+s.page+'页':'')+(s.origin==='ocr'?' · OCR待复核 · 识别分值'+s.ocr_confidence:'')),make('p',s.text));$('dialog-body').append(b);}$('document-dialog').showModal();}catch(e){astatus(e.message);}}
function exportAdmissions(format){if(!admissionsReport)return;const r=admissionsReport;
 if(format==='csv'){const rows=[['学校','院系','招生年度','业务','论文判断','来源'],...r.records.map(x=>[x.school,x.unit,x.years.join('/'),admissionsData.routes[x.route],x.paper_status,x.url])];const csv=rows.map(row=>row.map(v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');download('\ufeff'+csv,'PolicyLens-院校对比.csv','text/csv;charset=utf-8');return;}
 const article=make('article');article.append(make('h1','PolicyLens · 院校与历年文档对比报告'),make('p','生成日期：'+r.created_at+' / '+r.notice),make('p',admissionsData.difficulty_notice),make('p',admissionsData.paper_guidance));for(const w of r.warnings)article.append(make('p',w));article.append(admissionTable(r.records));for(const c of r.charts){const node=admissionChart(c);node.querySelectorAll('button').forEach(b=>b.remove());article.append(node);}for(const row of r.records){article.append(make('h2',row.title));for(const [key,label]of Object.entries(afields)){if(!row.fields[key].length)continue;article.append(make('h3',label));for(const e of row.fields[key])article.append(make('p',e.section_id+' / '+e.quote));}}
 if(admissionsProfile){article.append(make('h2','个人条件核对（本次输入）'));for(const c of admissionsProfile.checks){article.append(make('h3',c.title));for(const item of c.items)article.append(make('p',item.label+' / '+item.status+' / '+item.detail));}}
 article.append(make('h2','西南大学软件工程大一准备建议'));for(const step of admissionsData.roadmap)article.append(make('h3',step.stage),make('p',step.tasks));
 const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>院校对比报告</title><style>body{font:14px/1.7 "Microsoft YaHei",sans-serif;color:#23372f;margin:30px}table{border-collapse:collapse;width:100%;font-size:12px;table-layout:fixed}td,th{border:1px solid #ccc;padding:9px;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:top}svg{max-width:700px;width:100%}h2{margin-top:30px}.discovery-card{border:1px solid #ccc;padding:16px;margin:15px 0}@media print{@page{size:A4 landscape;margin:12mm}body{margin:0}h2,h3{break-after:avoid}tr{break-inside:avoid}}</style><p>浏览器打开后可使用打印 → 另存为PDF。以下为带证据的历史资料报告。</p>'+article.outerHTML+'</html>';
 download(html,'PolicyLens-院校对比图表报告.html','text/html;charset=utf-8');
}

function tm2027Panel(onArchiveLoaded) {
 const panel=aid(make('section',undefined,'llm-settings'),'adm-tm2027');
 const title=make('h2','2027 年推免接收资料 · 39 所 985');
 const count=make('p','正在读取归档…','muted'),note=make('p',undefined,'eval-note');
 const filters=make('form',undefined,'settings-fields');
 const school=make('select'),mode=make('select'),category=make('select'),q=make('input');
 q.type='search';q.maxLength=120;q.placeholder='例如：软件工程、085400';
 const option=(label,value=label)=>{const el=make('option',label);el.value=value;return el;};
 school.append(option('全部院校',''));
 mode.append(option('官网文件','files'),option('专业索引','programs'));
 category.append(option('全部类别',''));
 for(const [key,name,el]of [['school','院校',school],['mode','检索范围',mode],['category','类别',category],['query','关键词',q]]){
  el.id='adm-tm2027-'+key;
  el.setAttribute('aria-label',name);
  const label=make('label',name);label.htmlFor=el.id;label.append(el);filters.append(label);
 }
 const submit=make('button','搜索','button primary');submit.type='submit';filters.append(submit);
 const result=make('div'),pager=make('div',undefined,'settings-buttons'),status=make('p',undefined,'muted');
 status.setAttribute('role','status');
 const coverage=make('details');coverage.append(make('summary','按学校查看收录范围'));
 panel.append(title,count,make('p','含推免硕士、直博、校级办法与院系细则。专业索引来自部分可解析的推免目录，外校资格仍须核对院系细则及专项备注。','muted'),filters,note,status,result,pager,coverage);
 let sequence=0,metadata=null;
 function categories(){
  const current=category.value;
  category.replaceChildren(option('全部类别',''),...(mode.value==='files'?(metadata?.categories||[]):['硕士','直博']).map(v=>option(v)));
  if([...category.options].some(o=>o.value===current))category.value=current;
 }
 async function loadPage(page=1){
  const request=++sequence;
  try{
   const params=new URLSearchParams({school:school.value,mode:mode.value,category:category.value,q:q.value.trim(),page});
   const data=await api('/api/admissions/2027?'+params);
   if(request!==sequence)return;
   if(!data.available){onArchiveLoaded(null);panel.hidden=true;return;}
   if(!metadata){
    metadata=data;
    onArchiveLoaded(data);
    count.textContent=data.files+' 条官网文件和目录 · '+data.programs+' 条专业索引 · '+data.attachments+' 份站内附件';
    for(const row of data.coverage){
     school.append(option(row['院校']));
     coverage.append(make('p',row['院校']+' · '+row['文件数']+' 条来源 · '+row['已提取专业']+' 条专业索引。'+row['核对状态']));
    }
    categories();
   }
   const scope=data.coverage.find(s=>s['院校']===school.value);
   note.textContent=scope?.['核对状态']||'普通招生目录仅作参考。学校有资料不代表全部专业已核对。';
   status.textContent=data.total?'共 '+data.total+' 条':'当前条件无匹配。可换关键词或查看该校官网文件。';
   result.replaceChildren();pager.replaceChildren();
   if(!data.total)return;
   const program=mode.value==='programs';
   const columns=program?['院校','招生院系','专业代码','专业名称','层次','位置']:['院校','类别','文件','状态'];
   const wrapper=make('div',undefined,'table-wrap'),table=make('table'),head=make('tr');
   for(const name of [...columns,'来源'])head.append(make('th',name));
   table.append(head);
   for(const row of data.items){
    const tr=make('tr');
    for(const column of columns)tr.append(make('td',row[column]||'—'));
    const links=make('td');links.append(safeLink(row['官网'],'官网原文 ↗'));
    if(row['上级来源']&&row['上级来源']!==row['官网']) links.append(document.createElement('br'),safeLink(row['上级来源'],'发布页面 ↗'));
    if(/^\/admissions\/2027\/attachment\/\d+$/.test(row['下载']||'')){
     const download=make('a','下载原件');download.href=row['下载'];download.download='';
     links.append(document.createElement('br'),download);
    }
    tr.append(links);table.append(tr);
   }
   wrapper.append(table);result.append(wrapper);
   const pages=Math.ceil(data.total/data.page_size);
   const prev=abutton('上一页',()=>loadPage(page-1)),next=abutton('下一页',()=>loadPage(page+1));
   prev.disabled=page<=1;next.disabled=page>=pages;
   pager.append(prev,make('span','第 '+page+' / '+pages+' 页'),next);
  }catch(error){
   if(request===sequence){
    status.textContent=error.message;
    if(!metadata)onArchiveLoaded(null);
   }
  }
 }
 filters.onsubmit=event=>{event.preventDefault();loadPage();};
 school.onchange=category.onchange=()=>loadPage();
 mode.onchange=()=>{category.value='';categories();loadPage();};
 loadPage();
 return panel;
}


function admissionsWatchPanel(){
 const panel=aid(make('section',undefined,'llm-settings'),'adm-watch');
 const title=make('h2','985 高校推免 · 官网每日监测');
 const status=make('p','正在读取监测状态…','muted');
 status.setAttribute('role','status');
 const run=abutton('立即检查',()=>operation({action:'run'}));
 const toggle=abutton('暂停自动检查',()=>operation({action:'settings',enabled:!state.enabled}));
 const actions=make('div',undefined,'settings-buttons');actions.append(run,toggle);
 const filter=make('select');filter.id='adm-watch-school';filter.setAttribute('aria-label','监测院校');
 const label=make('label','查看院校');label.htmlFor=filter.id;label.append(filter);
 const option=make('option','全部院校');option.value='';filter.append(option);
 const changes=make('div'),schools=make('details');schools.append(make('summary','各校检查时间与失败详情'));
 panel.append(title,make('p','云端每天检查所列研招栏目和已归档附件。新公告与变化先供核对，学校的全部院系网页和登录后的系统资料可能需要另查。','muted'),actions,status,label,changes,schools);
 let state=null,serial=0,selectedInitialized=false,schoolDetails=new Set();
 const labels={new:'发现新公告或目录',changed:'网页内容变化',attachment:'原址附件内容变化'};
 const stamp=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'尚未检查';
 function render(){
  if(!state || !state.available){panel.hidden=true;return;}
  if(!selectedInitialized){
   for(const school of state.schools)filter.append(make('option',school.name));
   selectedInitialized=true;
  }
  run.disabled=state.running;
  toggle.textContent=state.enabled?'暂停自动检查':'启用自动检查';
  const pending=state.events.filter(x=>!x.seen);
  status.textContent=(state.running?'正在检查…':(state.enabled?'自动检查已开启':'自动检查已暂停'))+
   ' · 上轮完成 '+stamp(state.last_run)+' · '+pending.length+' 条未查看'+(state.error?' · '+state.error:'');
  const visible=state.events.filter(e=>!filter.value||e.school===filter.value);
  changes.replaceChildren(make('h3','变更记录'));
  if(!visible.length)changes.append(make('p','当前范围暂无变更记录。第一次检查会先记录现有网页作为基线。','muted'));
  for(const entry of visible.slice(0,40)){
   const card=make('article',undefined,'discovery-card'),row=make('div',undefined,'settings-buttons');
   card.append(make('p',entry.school+' · '+labels[entry.kind]+' · '+stamp(entry.time)+(entry.seen?' · 已查看':''),'metadata'),make('h3',entry.title));
   row.append(safeLink(entry.url,'打开官网 ↗'),abutton('预览并核对',async()=>{
    switchTab('find');
    $('collect-url').value=entry.url;
    discoveryMessage('collect-status','正在读取来源正文…');
    try{
     openCollected(await api('/api/admissions/watch',{action:'preview',id:entry.id}));
     $('commit-school').value=entry.school;
     $('commit-type').value='graduate_admission';
     await loadDiscovery();
     discoveryMessage('collect-status','已保存待核对快照。');
    }catch(error){
     discoveryMessage('collect-status',error.message);
     $('collect-status').scrollIntoView({block:'center'});
    }
   }));
   if(!entry.seen)row.append(abutton('标为已查看',()=>operation({action:'seen',id:entry.id})));
   card.append(row);changes.append(card);
  }
  if(visible.length>40)changes.append(make('p','显示最近 40 条变更，可选择院校查看。','muted'));
  schools.replaceChildren(make('summary','各校检查时间与失败详情'));
  for(const school of state.schools.filter(s=>!filter.value||s.name===filter.value)){
   const item=make('details');item.open=schoolDetails.has(school.name);
   item.ontoggle=()=>{if(item.open)schoolDetails.add(school.name);else schoolDetails.delete(school.name);};
   const last=school.checked?('检查 '+school.total+' 个来源 · '+school.success+' 个成功 · '+school.failed+' 个失败'):'待检查 '+school.planned+' 个来源';
   item.append(make('summary',school.name+' · '+last),make('p','最近检查 '+stamp(school.checked)+' · 最近至少有一项成功 '+stamp(school.last_success),'muted'));
   if(school.url)item.append(safeLink(school.url,'打开研招公告栏目 ↗'));
   for(const failure of school.errors||[]){
    const line=make('p',failure.title+' · '+failure.message+' ');
    line.append(safeLink(failure.url,'原网址 ↗'));item.append(line);
   }
   schools.append(item);
  }
 }
 async function pull(data){
  const request=++serial;
  try{
   const result=await api('/api/admissions/watch',data);
   if(request!==serial)return;
   state=result;
   render();
  }catch(error){if(request===serial)status.textContent=error.message;}
 }
 function operation(data){return pull(data);}
 filter.onchange=render;
 pull();
 setInterval(()=>{if(panel.isConnected&&!document.hidden&&!$('tab-admissions').hidden)pull();},12000);
 return panel;
}

