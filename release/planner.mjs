const panel=document.getElementById('tab-planner');
const $=id=>document.getElementById(id);
const MINUTE=60_000;
const DAY=86_400_000;
const offset=8*60*MINUTE;
const types={goal:'目标',habit:'习惯',plan:'日程',record:'实际用时'};
const model={data:null,date:'',view:'time',busy:false,loading:false,skew:0,editing:null};
const el=(tag,text,cls)=>{
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  return node;
};
function button(text,handler,cls='button secondary'){
  const node=el('button',text,cls);
  node.type='button';
  node.addEventListener('click',handler);
  return node;
}
const now=()=>Date.now()+model.skew;
const day=value=>new Date(value+offset).toISOString().slice(0,10);
const dayStart=date=>Date.parse(date+'T00:00:00+08:00');
const timeLabel=value=>new Date(value+offset).toISOString().slice(11,16);
const formTime=value=>day(value)+'T'+timeLabel(value);
const fromInput=value=>Date.parse(value+':00+08:00');
const duration=ms=>{
  const mins=Math.floor(Math.max(0,ms)/MINUTE);
  if(!mins&&ms>0)return '不足 1 分钟';
  return mins<60?mins+' 分钟':Math.floor(mins/60)+' 小时'+(mins%60?' '+mins%60+' 分钟':'');
};
const clock=ms=>{
  const seconds=Math.floor(Math.max(0,ms)/1000);
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
};

if(panel){
  panel.innerHTML=`
    <div class="planner-head">
      <div><p class="planner-kicker">据时 · 学习与生活</p><h1>时间与习惯</h1><p>规划今天，记录实际投入，回看习惯进度。</p></div>
      <button id="planner-logout" class="button secondary" type="button" hidden>退出登录</button>
    </div>
    <form id="planner-login" class="planner-card planner-login" hidden>
      <h2>邀请账号登录</h2>
      <p>登录后，日程、计时和打卡记录会随账号同步。</p>
      <label>邀请凭证<input name="invite" type="password" required autocomplete="off" maxlength="64"></label>
      <button class="button primary">登录并查看记录</button>
    </form>
    <p id="planner-status" class="planner-status" role="status" aria-live="polite"></p>
    <div id="planner-body" hidden>
      <div class="planner-topline">
        <div class="planner-date">
          <button id="planner-prev" class="button secondary" aria-label="前一天" type="button">‹</button>
          <label><span>查看日期</span><input id="planner-date" type="date" aria-label="查看日期"></label>
          <button id="planner-next" class="button secondary" aria-label="后一天" type="button">›</button>
          <button id="planner-today" class="button secondary" type="button">今天</button>
        </div>
        <span class="planner-meta">北京时间</span>
      </div>
      <div id="planner-active"></div>
      <nav class="planner-nav" aria-label="时间管理">
        <button type="button" data-view="time">时间记录</button>
        <button type="button" data-view="goals">时长目标</button>
        <button type="button" data-view="schedule">日程对照</button>
        <button type="button" data-view="habits">习惯打卡</button>
      </nav>
      <div id="planner-content"></div>
      <footer class="planner-footer"><span id="planner-expiry"></span><button id="planner-reset" type="button" class="text-button">清空时间与习惯数据</button></footer>
    </div>
    <dialog id="planner-dialog" class="planner-dialog">
      <form id="planner-form">
        <h2 id="planner-form-title"></h2>
        <label>名称<input name="title" maxlength="60" required></label>
        <div id="planner-period" class="planner-fields" hidden>
          <label>周期<select name="period"><option value="daily">每天</option><option value="weekly">每周</option></select></label>
          <label>目标分钟数<input name="minutes" type="number" min="1" max="1440" value="30"></label>
        </div>
        <div id="planner-interval" class="planner-fields" hidden>
          <label>开始时间<input name="start" type="datetime-local"></label>
          <label>结束时间<input name="end" type="datetime-local"></label>
        </div>
        <label id="planner-goal-field" hidden>计入时长目标<select name="goalId"></select></label>
        <p id="planner-form-status" class="planner-status" role="status"></p>
        <div class="planner-card-actions"><button id="planner-cancel" class="button secondary" type="button">取消</button><button class="button primary" type="submit">保存</button></div>
      </form>
    </dialog>`;
  bind();
  if(!panel.hidden)void loadPlanner();
}

async function api(path,body){
  const response=await fetch('/api/'+path,body===undefined?{}:{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
  });
  const value=await response.json();
  if(!response.ok)throw Object.assign(Error(value.error||'请求失败。'),{status:response.status});
  return value;
}
function setStatus(value){
  $('planner-status').textContent=value;
}
function displaySession(signedIn){
  $('planner-login').hidden=signedIn;
  $('planner-body').hidden=!signedIn;
  $('planner-logout').hidden=!signedIn;
  if(!signedIn){
    model.data=null;
    $('planner-content').replaceChildren();
    $('planner-active').replaceChildren();
    if($('planner-dialog').open)$('planner-dialog').close();
    $('planner-form').reset();
  }
}
function accept(payload){
  model.data=payload;
  model.skew=payload.now-Date.now();
  if(!model.date)model.date=day(now());
  displaySession(true);
  render();
}
async function loadPlanner(quiet=false){
  if(model.loading || model.busy)return;
  model.loading=true;
  if(!quiet)setStatus('正在读取已保存的记录…');
  try{
    accept(await api('planner'));
    if(!quiet)setStatus('');
  }catch(e){
    if(e.status===401){displaySession(false);setStatus('');}
    else if(!quiet)setStatus(e.message);
  }finally{model.loading=false;}
}
async function save(action, onSaved, formStatus){
  if(!model.data||model.busy||model.loading)return;
  const message=formStatus?$('planner-form-status'):$('planner-status');
  model.busy=true;
  message.textContent='正在保存…';
  try{
    accept(await api('planner',{...action,version:model.data.version}));
    message.textContent='';
    if(onSaved)onSaved();
    setStatus('已保存并同步。');
  }catch(error){
    if(error.status===401){
      displaySession(false);
      setStatus('登录已过期，请重新登录后继续。');
    }else{
      if(error.status===409){
        try{accept(await api('planner'));}catch{}
      }
      message.textContent=error.message;
    }
  }finally{model.busy=false;}
}
function setDay(value){
  if(!value)return;
  model.date=value;
  render();
}
function bind(){
  document.addEventListener('policylens-tab',event=>{
    if(event.detail==='planner')void loadPlanner(Boolean(model.data));
  });
  window.addEventListener('focus',()=>{if(!panel.hidden)void loadPlanner(true);});
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&!panel.hidden)void loadPlanner(true);
  });
  setInterval(()=>{
    if(!panel.hidden && !document.hidden && model.data)updateClock();
  },1000);
  $('planner-login').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget, submit=form.querySelector('button');
    if(submit.disabled)return;
    submit.disabled=true;
    try{
      await api('login',{invite:form.elements.invite.value.trim()});
      form.reset();
      await loadPlanner();
    }catch(error){setStatus(error.message);}
    finally{submit.disabled=false;}
  };
  $('planner-logout').onclick=async()=>{
    if(model.busy)return;
    try{await api('logout',{});displaySession(false);setStatus('已退出。');}
    catch(error){setStatus(error.message);}
  };
  $('planner-date').onchange=event=>setDay(event.currentTarget.value);
  $('planner-prev').onclick=()=>setDay(day(dayStart(model.date)-DAY));
  $('planner-next').onclick=()=>setDay(day(dayStart(model.date)+DAY));
  $('planner-today').onclick=()=>setDay(day(now()));
  $('planner-reset').onclick=()=>{
    if(confirm('清空本账号的日程、目标、计时和所有打卡记录？'))void save({action:'reset'});
  };
  for(const control of panel.querySelectorAll('[data-view]'))control.onclick=()=>{
    model.view=control.dataset.view;
    render();
  };
  $('planner-cancel').onclick=()=>$('planner-dialog').close();
  $('planner-form').onsubmit=event=>{
    event.preventDefault();
    const fields=event.currentTarget.elements,{kind,item}=model.editing;
    if(kind==='timer'){
      void save({action:'start',title:fields.title.value,goalId:fields.goalId.value},()=>$('planner-dialog').close(),true);
      return;
    }
    const action={action:'save',kind,id:item?.id,title:fields.title.value};
    if(kind==='plan'||kind==='record'){
      Object.assign(action,{start:fromInput(fields.start.value),end:fromInput(fields.end.value),goalId:fields.goalId.value});
    }
    if(kind==='goal')Object.assign(action,{minutes:Number(fields.minutes.value),period:fields.period.value});
    void save(action,()=>$('planner-dialog').close(),true);
  };
  $('planner-form').elements.period.onchange=event=>{
    $('planner-form').elements.minutes.max=event.target.value==='weekly'?'10080':'1440';
  };
}
function openEditor(kind,item){
  const form=$('planner-form'),fields=form.elements;
  model.editing={kind,item};
  form.reset();
  $('planner-form-title').textContent=kind==='timer'?'开始计时':(item?'编辑':'新增')+types[kind];
  $('planner-form-status').textContent='';
  const forGoal=kind==='goal';
  const interval=kind==='plan'||kind==='record';
  $('planner-period').hidden=!forGoal;
  $('planner-interval').hidden=!interval;
  $('planner-goal-field').hidden=!(interval||kind==='timer');
  fields.start.required=fields.end.required=interval;
  fields.minutes.required=forGoal;
  fields.title.required=true;
  fields.title.value=item?.title||'';
  fields.period.value=item?.period||'daily';
  fields.minutes.max=fields.period.value==='weekly'?'10080':'1440';
  fields.minutes.value=item?.minutes||30;
  const current=now();
  const defaultStart=kind==='record'&&model.date===day(current)?current-30*MINUTE:dayStart(model.date)+9*60*MINUTE;
  const defaultEnd=kind==='record'&&model.date===day(current)?current:defaultStart+30*MINUTE;
  fields.start.value=formTime(item?.start??defaultStart);
  fields.end.value=formTime(item?.end??defaultEnd);
  const options=[new Option('不关联目标',''),...model.data.state.goals.map(goal=>new Option(goal.title,goal.id))];
  fields.goalId.replaceChildren(...options);
  fields.goalId.value=item?.goalId||'';
  if(kind==='timer'){
    fields.goalId.onchange=()=>{
      const goal=model.data.state.goals.find(value=>value.id===fields.goalId.value);
      if(goal)fields.title.value=goal.title;
    };
  }else fields.goalId.onchange=null;
  $('planner-dialog').showModal();
  fields.title.focus();
}
function remove(kind,item){
  if(confirm('删除「'+item.title+'」'+(kind==='habit'?'及其打卡记录':'')+'？')){
    void save({action:'remove',kind,id:item.id});
  }
}
function render(){
  if(!model.data||!model.date)return;
  const state=model.data.state;
  $('planner-date').value=model.date;
  $('planner-expiry').textContent='记录随邀请账号保存至 '+day(model.data.expires);
  for(const control of panel.querySelectorAll('[data-view]'))control.setAttribute('aria-pressed',String(control.dataset.view===model.view));
  const content=$('planner-content');
  if(model.view==='goals')content.replaceChildren(renderGoals(state));
  else if(model.view==='habits')content.replaceChildren(renderHabits(state));
  else if(model.view==='schedule')content.replaceChildren(renderSchedule(state));
  else content.replaceChildren(renderTime(state));
  renderActive(state.running);
}
function renderActive(running){
  const active=$('planner-active');
  active.replaceChildren();
  if(!running)return;
  const block=el('div',undefined,'planner-active');
  const words=el('div');
  words.append(el('b',running.title),el('small',day(running.start)+' '+timeLabel(running.start)+' 开始'));
  const timer=el('time',clock(now()-running.start),'planner-clock');
  timer.id='planner-clock';
  block.append(words,timer,button('结束并记录',()=>save({action:'stop',id:running.id}),'button primary'));
  active.append(block);
}
function updateClock(){
  const timer=$('planner-clock'), running=model.data.state.running;
  if(timer&&running)timer.textContent=clock(now()-running.start);
}
function heading(root,title,actions=[]){
  const row=el('div',undefined,'planner-card-heading');
  row.append(el('h2',title),...actions);
  root.append(row);
}
function empty(root,message){root.append(el('p',message,'planner-empty'));}
function dateRows(rows){
  const start=dayStart(model.date);
  return rows.filter(row=>row.start<start+DAY&&row.end>start).sort((a,b)=>a.start-b.start);
}
function sliceDuration(row,start,end){
  return Math.max(0,Math.min(end,row.end)-Math.max(start,row.start));
}
function measured(rows,start,end){
  const intervals=rows.filter(row=>row.start<end&&row.end>start)
    .map(row=>[Math.max(start,row.start),Math.min(end,row.end)]).sort((a,b)=>a[0]-b[0]);
  let covered=0, last=start;
  for(const [from,to] of intervals){
    covered+=Math.max(0,to-Math.max(from,last));
    last=Math.max(last,to);
  }
  return covered;
}
function dayTime(row){
  const start=dayStart(model.date);
  return (row.start<start?'00:00':timeLabel(row.start))+' – '+(row.end>=start+DAY?'24:00':timeLabel(row.end));
}
function detailList(root,rows,kind,emptyMessage){
  if(!rows.length){empty(root,emptyMessage);return;}
  const list=el('div',undefined,'planner-list');
  const start=dayStart(model.date);
  for(const item of rows){
    const row=el('article',undefined,'planner-item');
    const description=el('div',undefined,'planner-description');
    description.append(el('b',item.title),el('small',dayTime(item)+' · '+duration(sliceDuration(item,start,start+DAY))));
    const actions=el('div',undefined,'planner-item-actions');
    actions.append(button('编辑',()=>openEditor(kind,item),'text-button'),button('删除',()=>remove(kind,item),'text-button'));
    row.append(description,actions);
    list.append(row);
  }
  root.append(list);
}
function timeline(plans,records){
  const box=el('div',undefined,'planner-timeline');
  const markers=el('div',undefined,'planner-timeline-labels');
  for(const value of ['00:00','06:00','12:00','18:00','24:00'])markers.append(el('span',value));
  box.append(markers);
  for(const [name,rows,cls] of [['计划',plans,'is-plan'],['实际',records,'is-actual']]){
    const track=el('div',undefined,'planner-track-row');
    const bar=el('div',undefined,'planner-track');
    const start=dayStart(model.date);
    const overlay=document.createElement('canvas');
    overlay.width=1440;
    overlay.height=18;
    overlay.setAttribute('aria-hidden','true');
    const context=overlay.getContext('2d');
    if(context){
      context.fillStyle=cls==='is-plan'?'#486eac':'#2b7a62';
      for(const row of rows){
        const x=Math.floor(Math.max(0,row.start-start)/MINUTE);
        const width=Math.ceil(sliceDuration(row,start,start+DAY)/MINUTE);
        context.fillRect(x,2,Math.max(1,width),14);
      }
    }
    bar.append(overlay);
    track.append(el('span',name),bar);
    box.append(track);
  }
  return box;
}
function renderTime(state){
  const card=el('section',undefined,'planner-card');
  const records=dateRows(state.records);
  const plans=dateRows(state.plans);
  const actions=[button('补记用时',()=>openEditor('record'))];
  if(!state.running)actions.push(button('开始计时',()=>openEditor('timer'),'button primary'));
  heading(card,'当天用时',actions);
  const start=dayStart(model.date), total=measured(records,start,start+DAY);
  const summary=el('div',undefined,'planner-summary');
  summary.append(el('strong',duration(total)),el('span','已记录 · '+records.length+' 条计时'));
  card.append(summary,timeline(plans,records));
  detailList(card,records,'record','当天还没有实际用时记录。');
  return card;
}
function renderSchedule(state){
  const card=el('section',undefined,'planner-card');
  heading(card,'日程安排与实际情况',[button('新增日程',()=>openEditor('plan'),'button primary')]);
  const plans=dateRows(state.plans),records=dateRows(state.records),start=dayStart(model.date);
  card.append(timeline(plans,records));
  const columns=el('div',undefined,'planner-columns');
  const planned=el('section',undefined,'planner-lane'),actual=el('section',undefined,'planner-lane');
  heading(planned,'日程计划 · '+duration(measured(plans,start,start+DAY)));
  heading(actual,'实际用时 · '+duration(measured(records,start,start+DAY)),[button('补记',()=>openEditor('record'),'text-button')]);
  detailList(planned,plans,'plan','当天还没有日程安排。');
  detailList(actual,records,'record','当天还没有实际用时记录。');
  columns.append(planned,actual);
  card.append(columns);
  return card;
}
function periodStart(date,period){
  const start=dayStart(date);
  if(period==='daily')return start;
  const weekday=new Date(start+offset).getUTCDay();
  return start-((weekday+6)%7)*DAY;
}
function renderGoals(state){
  const card=el('section',undefined,'planner-card');
  heading(card,'学习与生活目标',[button('新增目标',()=>openEditor('goal'),'button primary')]);
  if(!state.goals.length)empty(card,'可以添加「每天阅读 30 分钟」这样的时长目标。');
  const grid=el('div',undefined,'planner-grid');
  for(const goal of state.goals){
    const start=periodStart(model.date,goal.period), end=start+(goal.period==='weekly'?7:1)*DAY;
    const total=measured(state.records.filter(r=>r.goalId===goal.id),start,end);
    const maximum=goal.minutes*MINUTE;
    const percent=Math.min(100,Math.floor(total/maximum*100));
    const item=el('article',undefined,'planner-mini');
    item.append(el('h3',goal.title),el('p',(goal.period==='weekly'?'本周':'当天')+' '+duration(total)+' / '+duration(maximum)));
    const progress=el('progress');
    progress.value=percent;
    progress.max=100;
    progress.setAttribute('aria-label',goal.title+'完成率 '+percent+'%');
    item.append(progress,el('small',percent+'%'));
    const actions=el('div',undefined,'planner-card-actions');
    if(!state.running)actions.append(button('开始计时',()=>save({action:'start',goalId:goal.id}),'button secondary'));
    actions.append(button('编辑',()=>openEditor('goal',goal),'text-button'),button('删除',()=>remove('goal',goal),'text-button'));
    item.append(actions);
    grid.append(item);
  }
  card.append(grid);
  return card;
}
function streak(days,today){
  let cursor=dayStart(today);
  if(!days.has(today))cursor-=DAY;
  let count=0;
  while(days.has(day(cursor))){count++;cursor-=DAY;}
  return count;
}
function renderHabits(state){
  const card=el('section',undefined,'planner-card');
  heading(card,'我的习惯',[button('新增习惯',()=>openEditor('habit'),'button primary')]);
  if(!state.habits.length)empty(card,'添加一个习惯，记录每天是否完成。');
  const grid=el('div',undefined,'planner-grid');
  for(const habit of state.habits){
    const days=new Set(state.checks.filter(row=>row.habitId===habit.id).map(row=>row.date));
    const checked=days.has(model.date),today=day(now());
    const item=el('article',undefined,'planner-mini');
    item.append(el('h3',habit.title),el('p','累计 '+days.size+' 天 · 连续 '+streak(days,today)+' 天'));
    const dates=el('div',undefined,'planner-habit-days');
    for(let i=6;i>=0;i--){
      const stamp=day(dayStart(model.date)-i*DAY);
      const marker=el('span',stamp.slice(8),days.has(stamp)?'checked':'');
      marker.title=stamp+(days.has(stamp)?' 已完成':' 未打卡');
      dates.append(marker);
    }
    const actions=el('div',undefined,'planner-card-actions');
    const action=button(checked?'取消打卡':'打卡',()=>save({action:'check',id:habit.id,date:model.date,done:!checked}),
      checked?'button secondary':'button primary');
    action.disabled=model.date>today;
    actions.append(action,button('编辑',()=>openEditor('habit',habit),'text-button'),button('删除',()=>remove('habit',habit),'text-button'));
    item.append(dates,actions);
    grid.append(item);
  }
  card.append(grid);
  return card;
}
