/* Experience content is rendered as plain text, never as author-provided HTML. */
(() => {
  const c = {page: 1, tag: '', mode: 'feed', reviewStatus: 'pending', sequence: 0};
  const labels = {approved: '已发布', pending: '待审核', rejected: '已退回'};
  const root = $('community-root');
  root.innerHTML = `<div class="community-heading"><div><p class="eyebrow">LEARN · SHARE · GROW</p><h1>把走过的路，分享给后来的人。</h1><p class="lead">保研、考研与竞赛获奖经验。让具体的准备方法，成为彼此的参考。</p></div><button id="community-write" class="button primary" type="button">＋ 分享我的经验</button></div>
    <p class="community-note">本机经验社区 · 内置内容标注“公开资料整理”，可查看原文来源；同学发帖的昵称与经历由本人填写。</p>
    <div class="community-filter"><form id="community-search"><div class="community-search-row"><label>搜索经验<input id="community-query" maxlength="100" placeholder="学校、备考方法、赛事名称或标签"></label><label class="community-category">经验方向<select id="community-category"><option value="">全部方向</option><option>保研经验</option><option>考研经验</option><option>竞赛获奖</option></select></label><button class="button primary" type="submit">搜索</button><button id="community-reset" class="button secondary" type="button">重置</button></div></form><div id="community-tags" class="community-tags" aria-label="按标签筛选"></div></div>
    <div class="community-tabs"><button id="community-feed-tab" class="button primary" type="button">经验广场</button><button id="community-review-tab" class="button secondary" type="button">会话内审核</button></div>
    <div id="community-status" class="community-status" role="status" aria-live="polite"></div>
    <div class="community-layout"><div><div id="community-review-panel" class="community-review-panel" hidden><p class="community-note">仅供此电脑的使用者管理本机帖子。待审核和已退回的帖子不会进入经验广场。人工复核须阅读全文，并填写处理理由。</p><label>查看状态 <select id="community-review-filter"><option value="pending">待审核</option><option value="rejected">已退回</option><option value="approved">已发布（可撤回审核）</option></select></label></div><p id="community-total" class="community-count-title"></p><div id="community-posts"></div><div id="community-pager" class="community-pager"></div></div><aside class="community-sidebar"><h3>什么样的经验更有帮助？</h3><ul><li>说清自己的背景和准备时间</li><li>分享具体方法、资源与踩坑</li><li>用标签标注学校、方向和赛事</li></ul><h3>坦诚，也友善</h3><p>成功值得分享，失利和压力也可以认真聊。欢迎具体、尊重他人的复盘与建议。</p><p id="community-rule-note">发布前自动检查人身攻击、广告引流、隐私泄露和作弊等风险。疑似问题或审核不确定的帖子先待复核。自动审核可能误判，可在本机管理中人工复核。</p></aside></div>`;

  const topicsPanel=make('section',undefined,'community-topics-panel');
  topicsPanel.setAttribute('aria-labelledby','community-topics-title');
  topicsPanel.innerHTML=`<div class="community-topics-heading"><div><span class="community-hot-mark" aria-hidden="true">↗</span><h2 id="community-topics-title">社区关注</h2><span>发现值得聊的话题</span></div><button id="community-topics-refresh" class="text-button" type="button">刷新词条 ↻</button></div><div class="community-topic-group"><h3>本次会话关注</h3><div id="community-popular" class="community-hot-topics"></div></div><div class="community-topic-group"><h3>推荐关注</h3><div id="community-recommended" class="community-hot-topics"></div></div><p class="community-topics-note">仅统计当前会话的预设话题。新增帖及审核结果只在当前浏览器会话预览。</p><p id="community-topics-status" role="status"></p>`;
  root.querySelector('.community-filter').after(topicsPanel);
  let topicSequence=0;
  let searchSession=crypto.randomUUID();
  try{const stored=sessionStorage.getItem('policylens-search-session');if(stored&&/^[a-zA-Z0-9-]{16,64}$/.test(stored))searchSession=stored;else sessionStorage.setItem('policylens-search-session',searchSession);}catch{}
  function topicButton(topic,count,index){
    const b=make('button',undefined,'community-hot-topic');b.type='button';
    if(count!==undefined)b.append(make('span',String(index+1).padStart(2,'0'),'community-hot-rank'));
    b.append(make('span',topic));if(count!==undefined)b.append(make('small',count+' 次'));
    b.onclick=()=>{c.mode='feed';c.page=1;c.tag='';$('community-query').value=topic;$('community-category').value='';recordSearch(topic);loadCommunity();};return b;
  }
  async function loadTopics(){
    const sequence=++topicSequence;
    try{const data=await api('/api/community/topics');if(sequence!==topicSequence)return;
      $('community-popular').replaceChildren(...data.popular.map((t,i)=>topicButton(t.topic,t.count,i)));
      if(!data.popular.length)$('community-popular').append(make('span','还没有搜索记录，可以先看看推荐关注。','community-topic-empty'));
      $('community-recommended').replaceChildren(...data.recommended.map(t=>topicButton(t)));
      $('community-topics-status').textContent='';
    }catch(error){if(sequence===topicSequence)$('community-topics-status').textContent='词条暂时未能加载，可点击刷新重试。';}
  }
  async function recordSearch(query){
    if(!query.trim())return;
    try{await api('/api/community/search',{query,session:searchSession});loadTopics();}
    catch{$('community-topics-status').textContent='搜索已执行，本次热点统计未保存。';}
  }
  $('community-topics-refresh').onclick=loadTopics;

  const compose = make('dialog'); compose.id = 'community-compose-dialog';
  compose.innerHTML = `<div class="dialog-head"><h2>分享我的经验</h2><button id="community-compose-close" type="button" aria-label="关闭发帖">×</button></div><p class="community-note">不必只有成功故事。把过程、困难和改进方法写清楚，也能帮助别人。</p><form id="community-compose"><div class="settings-fields"><label>发布昵称<input id="community-author" maxlength="30" required placeholder="你希望大家如何称呼你"></label><label>经验方向<select id="community-post-category" required><option value="">请选择</option><option>保研经验</option><option>考研经验</option><option>竞赛获奖</option></select></label></div><label>帖子标题<input id="community-title" minlength="4" maxlength="80" required placeholder="例如：保研夏令营前，我如何安排三个月准备"></label><label>经验正文<textarea id="community-content" minlength="30" maxlength="5000" required placeholder="可以从这些方面写起：&#10;· 我的背景与目标&#10;· 准备时间线和实际做法&#10;· 遇到的困难与调整&#10;· 想给后来者的建议"></textarea></label><div id="community-counter" class="community-count">0 / 5000</div><label>标签（1—5个，逗号、空格或回车分隔）<input id="community-post-tags" maxlength="100" required placeholder="如：夏令营、计算机、复试准备"></label><div id="community-tag-preview" class="community-tags community-new-tags"></div><p class="muted">每个标签最多16字。可用中英文、数字、下划线、加号或短横线。</p><label class="checkbox-label"><input id="community-agreement" type="checkbox" required><span>我确认内容为本人经验或已获授权，已去除他人隐私，不发布广告、攻击他人或作弊内容。</span></label><div id="community-compose-status" class="community-status" role="status" aria-live="polite"></div><div class="settings-buttons"><button id="community-submit" class="button primary" type="submit">提交审核并发布</button></div></form>`;
  document.body.append(compose);
  const detail = make('dialog'); detail.id = 'community-detail-dialog';
  const detailHead = make('div', undefined, 'dialog-head');
  const detailTitle = make('h2'); const detailClose = make('button', '×');
  detailClose.type = 'button'; detailClose.setAttribute('aria-label', '关闭帖子');
  detailHead.append(detailTitle, detailClose); const detailBody = make('div');
  detail.append(detailHead, detailBody); document.body.append(detail);
  detailClose.onclick = () => detail.close();

  function setStatus(id, message, error = false) {$(id).textContent = message; $(id).classList.toggle('error', error);}
  function parts() {return [...new Set($('community-post-tags').value.split(/[,，、;；\s]+/u).map(t => t.trim().replace(/^#+/, '')).filter(Boolean))];}
  function dateLabel(value) {return new Date(value).toLocaleString('zh-CN', {hour12: false});}
  function sourceBlock(post) {
    const box = make('div', undefined, 'community-sources');
    box.append(make('strong', '公开资料整理 · '+post.prepared_at), make('p','以下为公开经验的摘要与整理建议，由 PolicyLens 整理发布。原作者未在本社区发帖；历史经验不代表当年招生或赛事要求。'));
    for(const source of post.sources || []) {
      const row=make('div',undefined,'community-source');
      row.append(safeLink(source.url,source.title+' ↗'),make('p',`${source.publisher || '原文来源'}${source.published?' · 原文日期 '+source.published:''} · 查阅 ${source.accessed || post.prepared_at}`,'metadata'));
      box.append(row);
    }
    return box;
  }
  function openPost(post) {
    detailTitle.textContent = post.title;
    detailBody.replaceChildren(make('p', `${post.author} · ${post.category} · ${dateLabel(post.created_at)}`, 'metadata'), make('div', post.content, 'community-content'));
    const tags = make('div', undefined, 'community-tags');
    tags.append(...post.tags.map(t => make('span', '#'+t, 'community-tag')));
    detailBody.append(tags, make('p', '个人经历仅供参考；涉及招生或赛事要求，请核对当年官方文件。', 'community-note'));
    if(post.origin==='public_summary')detailBody.append(sourceBlock(post));
    detail.showModal();
  }
  function card(post) {
    const el = make('article', undefined, 'community-card'); const top = make('div', undefined, 'community-card-top');
    top.append(make('span', post.category, 'community-category-badge'), make('span', `${post.author} · ${dateLabel(post.created_at)}`, 'metadata'));
    if(post.origin==='public_summary')top.append(make('span','内置 · 公开资料整理','community-category-badge'));
    el.append(top, make('h2', post.title));
    if (post.editorial) {
      el.classList.add('community-cover-card');
      const preview = make('div',undefined,'community-preview community-editorial');
      for (const paragraph of post.content.split('\n\n').filter(Boolean)) preview.append(make('p',paragraph));
      el.append(preview);
    } else {
      const preview = post.content.length > 180 ? post.content.slice(0,180)+'…' : post.content;
      el.append(make('p',preview,'community-preview'));
    }
    const tags = make('div', undefined, 'community-tags');
    for (const t of post.tags) {const b = make('button', '#'+t, 'community-tag'); b.type = 'button'; b.onclick = () => {c.tag=t; c.page=1; loadCommunity();}; tags.append(b);}
    el.append(tags);
    if (post.editorial && post.sources?.length) {
      const actions = make('div',undefined,'community-reading-actions');
      actions.append(safeLink(post.sources[0].url,'阅读全文 ↗'));
      el.append(actions);
    } else {
      const read = make('button','阅读全文 ↗','text-button');
      read.type='button';
      read.onclick=()=>openPost(post);
      el.append(read);
    }
    if(post.origin==='public_summary') {
      const line=make('p',undefined,'community-note');
      line.append(document.createTextNode('整理来源：'));
      (post.sources||[]).forEach((source,index)=>{if(index)line.append(document.createTextNode(' · '));line.append(safeLink(source.url,source.publisher||source.title));});
      el.append(line);
    }
    if (c.mode === 'review') {
      el.append(make('p', `${labels[post.status]} · ${post.moderation.method}\n${post.moderation.reasons.join('；')}`, 'community-review-reason'));
      const form = make('form', undefined, 'community-review-form'); const label = make('label','人工复核理由');
      const reason = make('textarea'); reason.required=true; reason.minLength=4; reason.maxLength=300; reason.setAttribute('aria-label','人工复核理由'); reason.placeholder='请阅读全文后记录处理原因'; label.append(reason); form.append(label);
      const actions = make('div', undefined, 'settings-buttons');
      for(const [decision, text] of [['approved','通过并发布'],['rejected','退回帖子'],['pending','转为待审核']]) {
        if(decision===post.status)continue;
        const b=make('button',text,'button secondary'); b.type='submit'; b.value=decision; actions.append(b);
      }
      const message = make('p',undefined,'community-status'); message.setAttribute('role','status'); form.append(actions,message);
      form.onsubmit=async e=>{e.preventDefault(); const decision=e.submitter?.value; if(!decision)return;
        const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);message.textContent='正在保存复核结果…';
        try{await api('/api/community/review',{id:post.id,version:post.version,decision,reason:reason.value});await loadCommunity();setStatus('community-status','复核结果已保存。');}
        catch(error){message.textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
      };
      el.append(form);
    }
    return el;
  }
  window.loadCommunity = async function() {
    loadTopics();
    const sequence=++c.sequence;
    setStatus('community-status','正在读取经验帖子…');$('community-posts').setAttribute('aria-busy','true');
    $('community-review-panel').hidden=c.mode!=='review';
    $('community-feed-tab').className='button '+(c.mode==='feed'?'primary':'secondary');
    $('community-review-tab').className='button '+(c.mode==='review'?'primary':'secondary');
    const params=new URLSearchParams({q:$('community-query').value.trim(),category:$('community-category').value,tag:c.tag,page:String(c.page)});
    if(c.mode==='review')params.set('status',c.reviewStatus);
    try{
      const data=await api('/api/community/'+(c.mode==='review'?'moderation':'posts')+'?'+params);
      if(sequence!==c.sequence)return;
      const pages=Math.max(1,Math.ceil(data.total/data.page_size));
      if(c.page>pages){c.page=pages;return loadCommunity();}
      $('community-posts').replaceChildren(...data.posts.map(card));
      $('community-total').textContent=`${c.mode==='feed'?'经验广场':labels[c.reviewStatus]} · ${data.total} 篇${c.tag?' · #'+c.tag:''}`;
      if(!data.posts.length){const empty=make('div',undefined,'community-empty');empty.append(make('strong',c.mode==='review'?'当前没有此状态的帖子':'还没有找到相关经验'),make('p',c.mode==='review'?'新提交且需要复核的帖子会显示在这里。':'可以试试其他关键词或标签，也欢迎写下你的第一篇经验。'));$('community-posts').append(empty);}
      const tags=$('community-tags');tags.replaceChildren();
      const all=make('button','全部标签','community-tag'+(!c.tag?' active':''));all.type='button';all.setAttribute('aria-pressed',String(!c.tag));all.onclick=()=>{c.tag='';c.page=1;loadCommunity();};tags.append(all);
      const choices=[...data.tags]; if(c.tag&&!choices.some(t=>t.tag===c.tag))choices.unshift({tag:c.tag,count:0});
      for(const t of choices){const b=make('button',`#${t.tag}${t.count?' · '+t.count:''}`,'community-tag'+(c.tag===t.tag?' active':''));b.type='button';b.setAttribute('aria-pressed',String(c.tag===t.tag));b.onclick=()=>{c.tag=t.tag;c.page=1;loadCommunity();};tags.append(b);}
      const pager=$('community-pager');pager.replaceChildren();
      if(data.total){for(const [delta,label]of[[-1,'上一页'],[1,'下一页']]){const b=make('button',label,'button secondary');b.type='button';b.disabled=delta<0?c.page<=1:c.page>=pages;b.onclick=()=>{c.page+=delta;loadCommunity();};if(delta>0)pager.append(make('span',`${c.page} / ${pages}`));pager.append(b);}}
      setStatus('community-status','');
    }catch(error){if(sequence===c.sequence){$('community-posts').replaceChildren();$('community-pager').replaceChildren();$('community-total').textContent='';setStatus('community-status',error.message,true);}}
    finally{if(sequence===c.sequence)$('community-posts').removeAttribute('aria-busy');}
  };
  $('community-write').onclick=()=>{compose.showModal();$('community-author').focus();};
  $('community-compose-close').onclick=()=>compose.close();
  $('community-search').onsubmit=e=>{e.preventDefault();c.page=1;c.tag='';if(c.mode==='feed')recordSearch($('community-query').value.trim());loadCommunity();};
  $('community-category').onchange=()=>{c.page=1;loadCommunity();};
  $('community-reset').onclick=()=>{$('community-query').value='';$('community-category').value='';c.tag='';c.page=1;loadCommunity();};
  $('community-feed-tab').onclick=()=>{c.mode='feed';c.page=1;loadCommunity();};
  $('community-review-tab').onclick=()=>{c.mode='review';c.page=1;loadCommunity();};
  $('community-review-filter').onchange=()=>{c.reviewStatus=$('community-review-filter').value;c.page=1;loadCommunity();};
  $('community-content').oninput=()=>{$('community-counter').textContent=`${$('community-content').value.length} / 5000`;};
  $('community-post-tags').oninput=()=>{$('community-tag-preview').replaceChildren(...parts().map(t=>make('span','#'+t,'community-tag')));};
  $('community-compose').onsubmit=async e=>{
    e.preventDefault();const button=$('community-submit');if(button.disabled)return;
    const tags=parts();if(tags.length<1||tags.length>5||tags.some(t=>t.length>16)){setStatus('community-compose-status','请填写1—5个标签，每个标签最多16字。',true);return;}
    button.disabled=true;button.textContent='正在审核，请稍候…';setStatus('community-compose-status','正在检查内容，通常需要几秒。审核未完成时，帖子不会出现在经验广场。');
    try{
      const post=await api('/api/community/posts',{author:$('community-author').value,title:$('community-title').value,category:$('community-post-category').value,content:$('community-content').value,tags,agreement:$('community-agreement').checked});
      const message=post.status==='approved'?'审核通过，可在本会话预览。':`帖子已保存，暂未发布：${post.moderation.reasons.join('；')} 可在“会话内审核”查看和复核。`;
      const nickname=$('community-author').value;$('community-compose').reset();$('community-author').value=nickname;$('community-counter').textContent='0 / 5000';$('community-tag-preview').replaceChildren();setStatus('community-compose-status','');compose.close();
      c.mode=post.status==='approved'?'feed':'review';c.reviewStatus='pending';$('community-review-filter').value='pending';c.page=1;c.tag='';$('community-query').value='';$('community-category').value='';
      await loadCommunity();setStatus('community-status',message);
    }catch(error){setStatus('community-compose-status','提交未完成：'+error.message+'。内容已保留，可稍后重试；也可先查看待审核列表。',true);}
    finally{button.disabled=false;button.textContent='提交审核并发布';}
  };
})();
