const $ = id => document.getElementById(id);
const composer = $('composer');
const memory = $('memory');
let previous = '';
let epoch = 0;
let revision = 0;
let mode='policy', exercise='', planDraft=null, savingPlan=false, modelAvailable=false;
const studyForm=$('study-plan');

async function api(path,body) {
  const result = await fetch('/api/'+path, body===undefined ? {} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  });
  const data = await result.json();
  if (!result.ok) throw Object.assign(new Error(data.error),{status:result.status});
  return data;
}
function element(tag,content,className) {
  const node=document.createElement(tag);
  node.textContent=content;
  if(className) node.className=className;
  return node;
}
function link(url,title) {
  const anchor=element('a',title);
  try {
    const value=new URL(url);
    if(value.protocol==='https:' && !value.username && !value.password) {
      anchor.href=value.href;
      anchor.target='_blank';
      anchor.rel='noopener noreferrer';
    }
  } catch {}
  return anchor;
}
function renderSources(root,title,rows) {
  if (!rows?.length) return;
  root.append(element('h3',title));
  for (const row of rows) {
    const card=element('div','','source');
    card.append(link(row.url,row.title),element('p',[
      row.date ? '发布 '+row.date : '发布日期待核实',
      row.years?.length ? '适用年度 '+row.years.join('、') : '',
      row.yearMatches===false ? '所问年度待核实' : '',
    ].filter(Boolean).join(' · '),'muted'));
    if (row.excerpt) card.append(element('p',row.excerpt));
    root.append(card);
  }
}
function turn(question,result) {
  const card=element('article','','turn card');
  card.dataset.mode=result.coach?'coach':'policy';
  card.hidden=card.dataset.mode!==mode;
  card.append(element('p',question,'question'),element('p',result.mode,'muted'),element('p',result.answer,'answer'));
  if (result.modelStatus) card.append(element('p',result.modelStatus,'muted'));
  if (result.searchStatus && !result.answer.includes(result.searchStatus)) {
    card.append(element('p',result.searchStatus,'muted'));
  }
  renderSources(card,'本轮官网来源',result.sources);
  if(result.officialEntry) card.append(link(result.officialEntry,'打开官方栏目'));
  renderSources(card,'资料库补充',result.local);
  if(result.coach==='diagnose'){
    const reply=element('button','提交作答','quiet');
    reply.type='button';
    reply.onclick=()=>{
      if(composer.querySelector('[type=submit]').disabled)return;
      exercise=result.answer;
      composer.elements.question.value='';
      updateMode();
      composer.elements.question.focus();
    };
    card.append(reply);
  }
  $('conversation').append(card);
}
function loggedIn(show) {
  $('welcome').hidden=show;
  $('workspace').hidden=!show;
  $('logout').hidden=!show;
  if (!show) {
    epoch++;
    previous='';
    $('conversation').replaceChildren();
    composer.reset();
    memory.reset();
    studyForm.reset();
    clearStudyDraft();
    mode='policy';
    exercise='';
    updateMode();
  }
}
function applyMemory(data) {
  revision=data.revision;
  memory.elements.remember.checked=data.remember;
  memory.elements.saveChat.checked=data.saveChat;
  for (const [field,value] of Object.entries(data.profile)) memory.elements[field].value=value;
  $('profile').disabled=!data.remember;
  const date=new Date(data.expires).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'});
  $('expires').textContent='邀请账号有效至 '+date+'，到期后清理演示数据。';
  modelAvailable=data.modelAvailable;
  composer.elements.model.disabled=!modelAvailable;
  updateMode();
}
async function restore() {
  const data=await api('memory');
  applyMemory(data);
  $('conversation').replaceChildren();
  for(const row of data.history) turn(row.question,row.response);
  previous=data.history.findLast(row=>!row.response.coach)?.question || '';
  loggedIn(true);
}
function report(error) {
  if(error.status===401) loggedIn(false);
  $('status').textContent=error.message;
}
$('login').onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const submit=form.querySelector('button');
  submit.disabled=true;
  $('status').textContent='';
  try {
    await api('login',{invite:form.elements.invite.value.trim()});
    await restore();
    form.reset();
  } catch(error) { report(error); }
  finally { submit.disabled=false; }
};
$('logout').onclick=async()=>{
  try { await api('logout',{}); loggedIn(false); }
  catch(error) { report(error); }
};
memory.elements.remember.onchange=()=>{ $('profile').disabled=!memory.elements.remember.checked; };
memory.onsubmit=async event=>{
  event.preventDefault();
  $('memory-status').textContent='';
  const fields=memory.elements;
  try {
    const result=await api('memory',{remember:fields.remember.checked,saveChat:fields.saveChat.checked,
      profile:Object.fromEntries(['grade','major','target','progress'].map(k=>[k,fields[k].value]))});
    revision=result.revision;
    if (!fields.remember.checked) $('profile').querySelectorAll('input,select').forEach(input=>input.value='');
    $('memory-status').textContent='已保存隐私设置。';
  } catch(error) { report(error); }
};
$('erase').onclick=async()=>{
  if(!confirm('清空此账号的规划和历史对话？'))return;
  try {
    await api('erase',{});
    epoch++;
    await restore();
    $('status').textContent='';
    $('memory-status').textContent='已清空规划与历史记录。';
  } catch(error) { report(error); }
};
for(const button of document.querySelectorAll('[data-example]')) button.onclick=()=>{
  composer.elements.question.value=button.dataset.example;
  composer.elements.question.focus();
};

function updateMode(){
  const coach=mode==='coach';
  const review=coach&&Boolean(exercise);
  for(const button of $('assistant-modes').querySelectorAll('button')){
    button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  }
  for(const card of $('conversation').children)card.hidden=card.dataset.mode!==mode;
  $('coach-tools').hidden=!coach;
  $('policy-examples').hidden=coach;
  $('search-option').hidden=coach;
  $('exercise-context').hidden=!review;
  $('exercise-text').textContent=review?exercise:'';
  $('composer-label').textContent=review?'你的作答':coach?'练习主题':'你的问题';
  $('model-label').textContent=coach?'用模型出题和点评':'用模型整理回答';
  $('composer-send').textContent=review?'提交作答':coach?'生成诊断题':'发送';
  composer.elements.question.placeholder=review?'写出答案和你的解题过程':coach
    ?'例如，C 语言中指针和数组的区别'
    :'例如，帮我查四川大学计算机学院最新推免通知';
  $('model-note').textContent=modelAvailable
    ? (coach?'勾选后，会将经脱敏的练习主题、题目和作答发送给模型。':'启用模型时会发送经脱敏的提问和必要背景。')
    : (coach?'当前模型不可用，仍可制定复习日程。':'当前环境可查资料和续接规划，尚未连接模型。');
}

function clearStudyDraft(){
  planDraft=null;
  $('study-preview').hidden=true;
  $('study-slots').replaceChildren();
  $('study-status').textContent='';
}

for(const button of $('assistant-modes').querySelectorAll('button')){
  button.onclick=()=>{
    if(mode===button.dataset.mode||$('composer-send').disabled)return;
    mode=button.dataset.mode;
    composer.elements.question.value='';
    composer.elements.model.checked=false;
    $('status').textContent='';
    updateMode();
  };
}
$('exercise-cancel').onclick=()=>{
  if($('composer-send').disabled)return;
  exercise='';
  composer.elements.question.value='';
  updateMode();
};
$('study-diagnose').onclick=()=>{
  if($('composer-send').disabled||!studyForm.elements.topic.reportValidity())return;
  exercise='';
  composer.elements.question.value=studyForm.elements.topic.value;
  updateMode();
  composer.elements.question.focus();
};

studyForm.oninput=clearStudyDraft;
studyForm.onsubmit=async event=>{
  event.preventDefault();
  if(savingPlan)return;
  const fields=studyForm.elements;
  const submit=studyForm.querySelector('[type=submit]');
  const activeEpoch=epoch;
  const values=()=>JSON.stringify(Object.fromEntries(new FormData(studyForm)));
  const requested=values();
  clearStudyDraft();
  submit.disabled=true;
  $('study-status').textContent='正在查看可用时段…';
  try{
    const draft=await api('planner',{action:'preview-study',...JSON.parse(requested),minutes:fields.minutes.valueAsNumber});
    if(activeEpoch!==epoch||requested!==values())return;
    planDraft=draft;
    const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const endTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    $('study-slots').replaceChildren(...draft.slots.map(slot=>
      element('li',time.format(slot.start)+'–'+endTime.format(slot.end)+' · '+slot.title)));
    $('study-preview').hidden=!draft.slots.length;
    $('study-status').textContent=(draft.slots.length?'可加入 '+draft.slots.length+' 项日程。':'这个时段没有可加入的日程。')+
      (draft.conflicts.length?' 已避开 '+draft.conflicts.length+' 项冲突。':'');
  }catch(error){
    if(activeEpoch!==epoch||requested!==values())return;
    if(error.status===401)report(error);
    else $('study-status').textContent=error.message;
  }finally{submit.disabled=false;}
};
$('study-save').onclick=async()=>{
  if(!planDraft||savingPlan)return;
  savingPlan=true;
  $('study-save').disabled=true;
  const activeEpoch=epoch;
  const {slots,version}=planDraft;
  try{
    await api('planner',{action:'save-study',slots,version});
    if(activeEpoch!==epoch)return;
    clearStudyDraft();
    $('study-status').textContent='已将 '+slots.length+' 项复习任务加入「时间与习惯」。';
  }catch(error){
    if(activeEpoch!==epoch)return;
    if(error.status===401)report(error);
    else {
      if(error.status===409)clearStudyDraft();
      $('study-status').textContent=error.message;
    }
  }finally{
    savingPlan=false;
    $('study-save').disabled=false;
  }
};

composer.onsubmit=async event=>{
  event.preventDefault();
  const submit=composer.querySelector('button[type=submit]');
  if(submit.disabled)return;
  const question=composer.elements.question.value.trim();
  const activeEpoch=epoch;
  const model=composer.elements.model.checked;
  const coach=mode==='coach';
  const reviewing=coach&&Boolean(exercise);
  if(coach&&!model){
    $('status').textContent=modelAvailable?'请先勾选「用模型出题和点评」。':'当前模型不可用，仍可制定复习日程。';
    return;
  }
  submit.disabled=true;
  $('status').textContent=coach?(reviewing?'正在点评作答…':'正在生成诊断题…'):'正在整理资料…';
  try {
    const result=await api('chat',coach
      ? {question,model,coach:reviewing?'review':'diagnose',...(reviewing?{exercise}:{})}
      : {question,context:previous,revision,model,search:composer.elements.search.checked});
    if(activeEpoch!==epoch)return;
    turn(result.question||question,result);
    if(coach){exercise='';updateMode();}
    else previous=result.question||question;
    composer.elements.question.value='';
    $('status').textContent='';
    $('conversation').lastElementChild.scrollIntoView({block:'nearest'});
  } catch(error) { if(activeEpoch===epoch)report(error); }
  finally { submit.disabled=false; }
};
restore().catch(error=>{if(error.status!==401)report(error);});
