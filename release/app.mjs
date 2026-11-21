const $ = id => document.getElementById(id);
const composer = $('composer');
const memory = $('memory');
let previous = '';
let epoch = 0;
let revision = 0;

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
  card.append(element('p',question,'question'),element('p',result.mode,'muted'),element('p',result.answer,'answer'));
  if (result.modelStatus) card.append(element('p',result.modelStatus,'muted'));
  if (result.searchStatus && !result.answer.includes(result.searchStatus)) {
    card.append(element('p',result.searchStatus,'muted'));
  }
  renderSources(card,'本轮官网来源',result.sources);
  if(result.officialEntry) card.append(link(result.officialEntry,'打开官方栏目'));
  renderSources(card,'资料库补充',result.local);
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
  composer.elements.model.disabled=!data.modelAvailable;
  $('model-note').textContent=data.modelAvailable
    ? '启用模型时会发送经脱敏的提问和必要背景。'
    : '当前环境可查资料和续接规划，尚未连接模型。';
}
async function restore() {
  const data=await api('memory');
  applyMemory(data);
  $('conversation').replaceChildren();
  for(const row of data.history) turn(row.question,row.response);
  previous=data.history.at(-1)?.question || '';
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
composer.onsubmit=async event=>{
  event.preventDefault();
  const submit=composer.querySelector('button[type=submit]');
  if(submit.disabled)return;
  const question=composer.elements.question.value.trim();
  const activeEpoch=epoch;
  const model=composer.elements.model.checked;
  submit.disabled=true;
  $('status').textContent='正在整理资料…';
  try {
    const result=await api('chat',{question,context:previous,revision,model,search:composer.elements.search.checked});
    if(activeEpoch!==epoch)return;
    turn(result.question||question,result);
    previous=result.question||question;
    composer.elements.question.value='';
    $('status').textContent='';
    $('conversation').lastElementChild.scrollIntoView({block:'nearest'});
  } catch(error) { if(activeEpoch===epoch)report(error); }
  finally { submit.disabled=false; }
};
restore().catch(error=>{if(error.status!==401)report(error);});
