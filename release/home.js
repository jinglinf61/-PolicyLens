/* Homepage images and copy are bundled; external articles open only on request. */
const featureMenu = $('feature-menu');
function closeFeatureMenu(){if(featureMenu.open)featureMenu.close();$('menu-toggle').setAttribute('aria-expanded','false');}
$('menu-toggle').onclick=()=>{featureMenu.showModal();$('menu-toggle').setAttribute('aria-expanded','true');};
$('menu-close').onclick=closeFeatureMenu;
featureMenu.addEventListener('close',()=>$('menu-toggle').setAttribute('aria-expanded','false'));
featureMenu.addEventListener('click',e=>{const r=featureMenu.getBoundingClientRect();if(e.target===featureMenu&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))closeFeatureMenu();});
window.addEventListener('hashchange',()=>switchTab(location.hash.slice(1)||'home'));
document.querySelector('.site-header .brand').onclick=e=>{e.preventDefault();switchTab('home');window.scrollTo({top:0});};

(() => {
  const root=$('home-root');
  let index=0, timer=null, paused=false, pointer=false, focused=false;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let slideElements=[], dots=[];
  function stop(){clearTimeout(timer);timer=null;}
  function schedule(){stop();if(paused||pointer||focused||motion.matches||document.hidden||$('tab-home').hidden||slideElements.length<2)return;timer=setTimeout(()=>show(index+1),6500);}
  function show(next,announce=false){
    index=(next+slideElements.length)%slideElements.length;
    slideElements.forEach((s,i)=>s.hidden=i!==index);
    dots.forEach((b,i)=>{b.classList.toggle('selected',i===index);b.setAttribute('aria-pressed',String(i===index));});
    $('home-slide-number').textContent=String(index+1).padStart(2,'0')+' / '+String(slideElements.length).padStart(2,'0');
    if(announce)$('home-carousel-status').textContent='第'+(index+1)+'张：'+slideElements[index].querySelector('h1,h2').textContent;
    schedule();
  }
  document.addEventListener('visibilitychange',schedule);
  document.addEventListener('policylens-tab',schedule);
  motion.addEventListener('change',schedule);
  const go=(text,tab)=>{const b=make('button',text,'home-cta');b.type='button';b.onclick=()=>{switchTab(tab);window.scrollTo({top:0});};return b;};
  function eventSlide(event){
    const slide=make('article',undefined,'home-slide home-photo-slide');
    const img=make('img');img.src=event.image;img.alt=event.alt;img.className='home-hero-photo';img.fetchPriority='high';
    const copy=make('div',undefined,'home-slide-copy');
    copy.append(make('p','热门赛事 · 编辑精选','home-kicker'),make('h1',event.id==='challenge'?'把青春的创意，\n写进真实的世界。':'热爱上场，\n每一次全力以赴都闪光。'));
    copy.append(make('p',event.title,'home-slide-subtitle'));
    const link=safeLink(event.url,'了解赛事 ↗');link.className='home-cta';copy.append(link);
    const credit=make('p','图片：'+event.publisher+' · '+event.status,'home-photo-credit');
    slide.append(img,copy,credit);return slide;
  }
  function quoteSlide(title,subtitle,number){
    const slide=make('article',undefined,'home-slide home-quote-slide quote-'+number);
    const art=make('div',undefined,'home-orbit');art.setAttribute('aria-hidden','true');
    art.append(make('span','向上'),make('small','KEEP GROWING'));
    const copy=make('div',undefined,'home-slide-copy');
    copy.append(make('p','给正在努力的你 · TODAY’S ENCOURAGEMENT','home-kicker'),make('h2',title),make('p',subtitle,'home-slide-subtitle'),go('去经验社区，找到同行的人 →','community'));
    slide.append(art,copy);return slide;
  }
  function eventCard(event){
    const card=make('article',undefined,'home-event-card');
    const visual=make('div',undefined,'home-event-visual');
    const img=make('img');img.src=event.image;img.alt=event.alt;img.loading='lazy';img.width=700;img.height=470;
    const stamp=make('div',undefined,'home-date-stamp');stamp.append(make('strong',event.published.slice(8)),make('span',event.published.slice(0,7).replace('-','.')));
    visual.append(img,stamp);
    const copy=make('div',undefined,'home-event-copy');
    const meta=make('div',undefined,'home-event-meta');meta.append(make('span',event.status,'event-status'+(event.status==='进行中'?' is-live':'')),make('span',event.category));
    copy.append(meta,make('h3',event.title),make('p',event.summary,'home-event-summary'),make('p',event.status_note,'home-event-status-note'));
    const source=make('div',undefined,'home-event-source');source.append(make('span','报道 / '+event.publisher),safeLink(event.url,'查看报道 ↗'));copy.append(source);
    card.append(visual,copy);return card;
  }
  async function load(){
    try{
      const data=await api('/api/home');
      root.innerHTML=`<section id="home-carousel" class="home-carousel" aria-roledescription="轮播" aria-label="精选赛事与每日鼓励"><div id="home-slides"></div><div class="home-carousel-bar"><span class="home-carousel-caption">探索 · 实践 · 成长</span><div class="home-carousel-controls"><button id="home-prev" type="button" aria-label="上一张">←</button><div id="home-dots" class="home-dots" aria-label="选择轮播内容"></div><button id="home-next" type="button" aria-label="下一张">→</button><button id="home-pause" type="button" aria-label="自动轮播" aria-pressed="false">暂停</button><span id="home-slide-number"></span></div></div><p id="home-carousel-status" class="visually-hidden" role="status"></p></section>
        <section class="home-news" aria-labelledby="home-news-title"><div class="home-news-heading"><div><p class="home-section-kicker">ON CAMPUS / IN ACTION</p><h2 id="home-news-title">赛场内外<span>每一份热爱，都有回响。</span></h2></div><div id="home-event-filters" class="home-event-filters" role="group" aria-label="赛事状态筛选"></div></div><p id="home-news-date" class="home-news-note"></p><div id="home-event-grid" class="home-event-grid"></div><p id="home-events-empty" class="home-events-empty" role="status" hidden>当前收录内容中暂无此状态的赛事，请查看全部赛事。</p></section>
        <section class="home-community-invite"><div><p class="home-section-kicker">YOUR EXPERIENCE MATTERS</p><h2>走过的路，<br>也可以照亮后来的人。</h2><p>保研、考研、竞赛。让一次认真分享，成为另一个人的出发点。</p></div><div id="home-invite-action"></div><span class="home-invite-decoration" aria-hidden="true">一起<br>向前</span></section>`;
      const challenge=data.events.find(e=>e.id==='challenge'), league=data.events.find(e=>e.id==='league');
      slideElements=[eventSlide(challenge),quoteSlide('不必一开始就很厉害，\n开始，才会慢慢变厉害。','把大目标拆成今天的一小步。认真准备，也记得照顾好自己。',1),eventSlide(league),quoteSlide('每一次认真尝试，\n都在靠近更好的自己。','成绩值得庆祝，过程同样有价值。复盘、调整，然后继续出发。',2)];
      $('home-slides').replaceChildren(...slideElements);
      dots=slideElements.map((s,i)=>{const b=make('button');b.type='button';b.setAttribute('aria-label','第'+(i+1)+'张：'+s.querySelector('h1,h2').textContent);b.onclick=()=>show(i,true);return b;});
      $('home-dots').append(...dots);$('home-prev').onclick=()=>show(index-1,true);$('home-next').onclick=()=>show(index+1,true);
      $('home-pause').onclick=()=>{paused=!paused;$('home-pause').textContent=paused?'播放':'暂停';$('home-pause').setAttribute('aria-pressed',String(paused));schedule();};
      const carousel=$('home-carousel');
      carousel.onmouseenter=()=>{pointer=true;stop();};carousel.onmouseleave=()=>{pointer=false;schedule();};
      carousel.addEventListener('focusin',()=>{focused=true;stop();});carousel.addEventListener('focusout',e=>{focused=carousel.contains(e.relatedTarget);schedule();});
      carousel.onkeydown=e=>{if(e.key==='ArrowLeft'){e.preventDefault();show(index-1,true);}if(e.key==='ArrowRight'){e.preventDefault();show(index+1,true);}};
      const filters=['全部','进行中','已结束'];
      const render=filter=>{
        const events=data.events.filter(e=>filter==='全部'||e.status===filter);
        $('home-event-grid').replaceChildren(...events.map(eventCard));$('home-events-empty').hidden=!!events.length;
        for(const b of $('home-event-filters').children){b.classList.toggle('active',b.textContent===filter);b.setAttribute('aria-pressed',String(b.textContent===filter));}
      };
      for(const label of filters){const b=make('button',label);b.type='button';b.onclick=()=>render(label);$('home-event-filters').append(b);}
      $('home-news-date').textContent=`收录更新 ${data.updated_at} · 状态按 ${data.today} 判断；未公布结束日期的赛事以最近报道为准。图片及报道来自西南大学官网。`;
      $('home-invite-action').append(go('进入经验社区 ↗','community'));
      render('全部');show(0);
    }catch(error){root.replaceChildren(make('p','首页读取失败：'+error.message,'home-loading'));const retry=make('button','重新加载','button primary');retry.onclick=load;root.append(retry);}
  }
  switchTab(location.hash.slice(1)||'home');
  load();
})();
