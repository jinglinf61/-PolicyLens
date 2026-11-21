import library from './library.json' with {type:'json'};

const contests = [
  ['蓝桥杯','lanqiao.cn','https://dasai.lanqiao.cn/'],
  ['含弘杯','swu.edu.cn','https://gqt.swu.edu.cn/tzgg.htm'],
  ['挑战杯','tiaozhanbei.net','https://www.tiaozhanbei.net/'],
  ['数学建模','mcm.edu.cn','https://www.mcm.edu.cn/'],
  ['ICPC','icpc.global','https://icpc.global/'],
];
const topics = [
  [/推免|保研|夏令营|预推免/, '推免'], [/考研|统考/, '硕士招生'],
  [/奖学金|评奖/, '奖学金'], [/竞赛|比赛|赛事/, '竞赛'],
  [/报名|申报/, '报名'], [/获奖|加分/, '加分'], [/复试/, '复试'],
  [/软件工程/, '软件工程'], [/计算机/, '计算机'], [/人工智能/, '人工智能'],
];
function matchTerm(text, term) {
  if (term === '推免') return /推免|推荐免[（(]?初?[）)]?试/.test(text);
  if (term === '报名') return /报名|申报/.test(text);
  return text.toUpperCase().includes(term.toUpperCase());
}
export function searchScope(message) {
  const school = [...library.schools].sort((a,b)=>b.name.length-a.name.length)
    .find(item => item.domain && message.includes(item.name));
  const contest = contests.find(([name]) => message.toUpperCase().includes(name.toUpperCase()));
  const terms = topics.filter(([pattern])=>pattern.test(message)).map(([,name])=>name);
  const year = message.match(/(?<!\d)20[2-4]\d(?=年|届)/)?.[0];
  const domain = contest && !school ? contest[1] : school?.domain || 'swu.edu.cn';
  let landing = contest && !school ? contest[2] : school?.url || 'https://www.swu.edu.cn/tzgg.htm';
  if (domain==='swu.edu.cn') {
    if (/软件学院|软件工程|计算机/.test(message)) landing='https://cis.swu.edu.cn/sylm/tzgg/gztz.htm';
    else if (/推免|保研|复试/.test(message)) landing='https://yz.swu.edu.cn/zsxx/xly_tm/tmtz.htm';
    else if (/含弘杯|竞赛/.test(message)) landing='https://gqt.swu.edu.cn/tzgg.htm';
    else if (/奖学金|评奖/.test(message)) landing='https://xsc.swu.edu.cn/';
  }
  return {domain, landing, school:school?.name, terms: [school?.name, contest?.[0], year, ...terms].filter(Boolean),
    focus: [contest?.[0], ...terms].filter(Boolean), relevant: Boolean(school || contest || terms.length), year};
}

export function localSearch(scope) {
  return library.documents.filter(row=>!scope.school || row.school===scope.school).map(row => {
    const indexed = [row.title,row.unit,row.school,...row.excerpts].join(' ');
    const score = scope.terms.reduce((n, term) => n + (matchTerm(row.title,term) ? 4 : matchTerm(indexed,term) ? 1 : 0),0);
    const match = scope.terms.some(term => term !== scope.year &&
      !library.schools.some(school => school.name === term) && matchTerm(indexed,term));
    return {row,score: match ? score : 0};
  }).filter(item=>item.score > 0).sort((a,b)=>b.score-a.score || (b.row.date||'').localeCompare(a.row.date||''))
    .slice(0,4).map(({row})=>({
      title:row.title,url:row.url,date:row.date || '',years:row.years || [],
      excerpt:[...row.excerpts].sort((a,b)=>
        scope.terms.filter(term=>b.includes(term)).length-scope.terms.filter(term=>a.includes(term)).length
      )[0]?.slice(0,280) || '',
    }));
}

function officialUrl(value, domain) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    if (url.hostname !== domain && !url.hostname.endsWith('.'+domain)) return null;
    url.hash='';
    return url;
  } catch { return null; }
}

function clean(text) {
  return text.replace(/<[^>]{1,500}>/g,' ').replace(/&(?:nbsp|amp|quot|lt|gt);/g,' ')
    .replace(/\s+/g,' ').trim();
}
const roster = /名单|成绩.*公示|评审结果|审核结果|拟录取公示|获奖公示|结果公示|拟推荐结果/;

async function officialPage(url, domain, transport) {
  if (!officialUrl(url,domain)) return '';
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 6000);
  try {
    return await readOfficialPage(url, transport, deadline.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function readOfficialPage(url, transport, signal) {
  const response = await transport(url, {redirect:'manual',signal,headers:{Accept:'text/html'}});
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return '';
  const reader = response.body.getReader();
  let total = 0;
  const decoder = new TextDecoder();
  let html = '';
  try {
    while (total < 250_000) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.length;
      html += decoder.decode(value.subarray(0,250_000-total+value.length),{stream:true});
    }
  } finally { void reader.cancel().catch(()=>{}); }
  return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

export async function onlineSearch(scope, key, transport = fetch) {
  if (!scope.relevant) return {sources:[], status:'请在问题中写明院校、赛事或要查的政策类型。'};
  const candidates = new Map();
  if (key) {
    const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
    endpoint.search = new URLSearchParams({q: scope.terms.join(' ')+' site:'+scope.domain,count:'7'});
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), 4200);
    try {
      const response = await transport(endpoint, {
        headers: {'X-Subscription-Token':key,Accept:'application/json'},
        signal:deadline.signal, redirect:'manual',
      });
      if (response.ok) {
        for (const row of (await response.json()).web?.results || []) {
          const link = officialUrl(row.url,scope.domain);
          if (link && typeof row.title === 'string' && !roster.test(row.title)) candidates.set(link.href, clean(row.title));
        }
      }
    } catch {} finally { clearTimeout(timer); }
  }
  if (!candidates.size) {
    try {
      const html = await officialPage(scope.landing,scope.domain,transport);
      for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const title = clean(match[2]).replace(/^(?:\d{1,2}\s+20\d{2}-\d{2}|20\d{2}-\d{2}-\d{2})\s+/, '');
        const link = officialUrl(new URL(match[1],scope.landing),scope.domain);
        if (link && title.length >= 8 && !roster.test(title) && (scope.focus.length ? scope.focus : scope.terms).some(term=>matchTerm(title,term))) {
          candidates.set(link.href,title);
        }
      }
    } catch {}
  }
  if (!candidates.size) {
    for (const row of localSearch(scope)) {
      if ((!scope.year || row.title.includes(scope.year) || row.years.map(String).includes(scope.year))
        && officialUrl(row.url,scope.domain)) candidates.set(row.url,row.title);
    }
  }
  const score = title=>scope.terms.filter(term=>matchTerm(title,term)).length;
  const ranked = [...candidates].sort((a,b)=>score(b[1])-score(a[1]));
  const pages = await Promise.allSettled(ranked.slice(0,3).map(async ([url,title])=>{
    const html = await officialPage(url,scope.domain,transport);
    if (!html) return null;
    const text = clean(html.match(/<article\b[^>]*>([\s\S]+?)<\/article>/i)?.[1] || html);
    const date = text.match(/(?:发布日期|发布时间|发表时间|时间)[：:\s]*(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)?.slice(1);
    const yearMatches = scope.year ? title.includes(scope.year) || text.includes(scope.year+'年') : true;
    const bodyStart = html.search(/<div\b[^>]*(?:id|class)=["'][^"']*v_news_content/i);
    const mainText = bodyStart >= 0 ? clean(html.slice(bodyStart, bodyStart + 16000)) : '';
    const index = text.indexOf(title);
    const excerpt = yearMatches
      ? (mainText || (index >= 0 ? text.slice(index + title.length) : '')).slice(0, 1250)
      : '';
    return {url,title,date:date ? date.map(v=>v.padStart(2,'0')).join('-') : '',excerpt,yearMatches};
  }));
  const sources = pages.flatMap(value=>value.status==='fulfilled' && value.value ? [value.value] : []);
  return {sources, landing:scope.landing,
    status: sources.some(row=>row.excerpt && row.yearMatches)
      ? '已读取官网网页，时间与适用条件以原文为准。'
      : '本次未能核对所问范围的官网正文。可打开官方入口继续查找。'};
}
