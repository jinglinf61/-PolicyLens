import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { sqlite } from './local.mjs';
import worker,{cleanup,hash,randomToken} from './src/worker.mjs';

const {DB,database}=sqlite();
database.exec(await readFile(new URL('schema.sql',import.meta.url),'utf8'));
database.exec(await readFile(new URL('planner-schema.sql',import.meta.url),'utf8'));
const outbound=[];
const inference=[];
const env={
  DB,STORAGE_KEY:randomToken(),BRAVE_API_KEY:'test-scope',
  AI:{async run(_name,body){inference.push(JSON.stringify(body));return {response:'测试回复'};}},
  SEARCH_FETCH:async url=>{
    const parsed=new URL(url);
    outbound.push(parsed);
    if(parsed.hostname==='api.search.brave.com') return Response.json({web:{results:[
      {url:'https://yz.swu.edu.cn/info/1005/3562.htm',title:'西南大学2027年推免预报名通知'},
      {url:'https://unrelated.example/',title:'其他结果'},
    ]}});
    return new Response('<article>西南大学2027年推免预报名通知 发布日期：2026-09-04 查看报名条件。</article>',{headers:{'Content-Type':'text/html'}});
  },
};
const origin='https://policylens.invalid';
async function send(path,body,cookie,requestOrigin=origin) {
  const headers=new Headers();
  if(cookie)headers.set('Cookie',cookie);
  if(body!==undefined){headers.set('Origin',requestOrigin);headers.set('Content-Type','application/json');}
  return worker.fetch(new Request(origin+'/api/'+path,body===undefined?{headers}:{
    method:'POST',headers,body:JSON.stringify(body),
  }),env);
}
async function invite(id,expires=Date.now()+3600000) {
  const token=randomToken();
  database.prepare('INSERT INTO accounts(id,invite_hash,expires) VALUES(?,?,?)').run(id,await hash(token),expires);
  return token;
}
async function login(invite) {
  const response=await send('login',{invite});
  assert.equal(response.status,200);
  const cookie=response.headers.get('Set-Cookie');
  assert.match(cookie,/HttpOnly; SameSite=Strict; Max-Age=\d+; Secure/);
  return cookie.split(';')[0];
}
const code=await invite('alice');
const a=await login(code), b=await login(await invite('bob')), anotherDevice=await login(code);
assert.equal((await send('planner')).status,401);
const planner=async (session,action,status=200)=>{
  const response=await send('planner',action,session);
  const data=await response.json();
  assert.equal(response.status,status,JSON.stringify(data));
  return data;
};
const initial=await planner(a);
assert.equal(initial.version,0);
const addedGoal=await planner(a,{version:0,action:'save',kind:'goal',title:'仅供测试的阅读目标',period:'daily',minutes:30});
const goal=addedGoal.state.goals[0];
const addedHabit=await planner(a,{version:1,action:'save',kind:'habit',title:'读书'});
const habit=addedHabit.state.habits[0];
const addedPlan=await planner(a,{version:2,action:'save',kind:'plan',title:'明天的练习',start:Date.now()+86_400_000,end:Date.now()+90_000_000,goalId:goal.id});
assert.equal(addedPlan.state.plans.length,1);
await planner(anotherDevice,{version:2,action:'start',goalId:goal.id},409);
const started=await planner(a,{version:3,action:'start',goalId:goal.id});
const reopened=await planner(anotherDevice);
assert.deepEqual(reopened.state.running,started.state.running);
assert.equal((await planner(b)).state.goals.length,0);
assert.equal((await planner(b)).state.running,null);
const stopped=await planner(anotherDevice,{version:4,action:'stop',id:reopened.state.running.id});
assert.equal(stopped.state.running,null);
assert.equal(stopped.state.records[0].goalId,goal.id);
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
await planner(a,{version:5,action:'check',id:habit.id,date:today,done:true});
const duplicate=await planner(anotherDevice,{version:6,action:'check',id:habit.id,date:today,done:true});
assert.equal(duplicate.state.checks.length,1);
assert.doesNotMatch(database.prepare('SELECT ciphertext FROM planner_state WHERE account_id=?').get('alice').ciphertext,/阅读目标|明天的练习/);
await planner(a,{version:7,action:'reset'});
assert.deepEqual((await planner(anotherDevice)).state,initial.state);
assert.equal((await send('memory')).status,401);
assert.equal((await send('memory',{},a,'https://external.invalid')).status,403);
assert.equal((await send('memory',{remember:true,saveChat:true,profile:{
  grade:'大一',major:'软件工程',target:'四川大学',progress:'准备复试',
}},a)).status,200);
const question='我是测试员，手机号：19912345678，学号：202612345678。帮我查西南大学2027年推免官网通知';
const response=await send('chat',{question,model:true,account_id:'bob'},a);
assert.equal(response.status,200);
const answer=await response.json();
assert.equal(answer.mode,'模型回答');
assert.equal(answer.sources[0].url,'https://yz.swu.edu.cn/info/1005/3562.htm');
assert.equal(answer.sources[0].date,'2026-09-04');
assert(outbound.every(item=>!item.href.includes('19912345678') && !item.href.includes('202612345678')));
assert(outbound.every(item=>item.hostname!=='unrelated.example'));
assert.equal(outbound[0].searchParams.get('q'),'西南大学 2027 推免 site:swu.edu.cn');
assert.doesNotMatch(inference[0],/19912345678|202612345678/);
assert.doesNotMatch(database.prepare('SELECT profile FROM accounts WHERE id=?').get('alice').profile,/四川大学/);
assert.doesNotMatch(database.prepare('SELECT question,response FROM messages').get().question,/推免/);
assert.equal((await (await send('memory',undefined,anotherDevice)).json()).history.length,1);
assert.equal((await (await send('memory',undefined,b)).json()).history.length,0);
assert.equal((await send('erase',{},a)).status,200);
const erased=await (await send('memory',undefined,anotherDevice)).json();
assert.deepEqual(erased.history,[]);
assert.equal(erased.profile.target,'');
const stale=await (await send('chat',{question:'继续上次的话题',context:'上次隐私记录',revision:1,model:true},anotherDevice)).json();
assert.equal(stale.mode,'模型回答');
assert.doesNotMatch(inference.at(-1),/上次隐私记录/);
await invite('expired',Date.now()-1000);
await cleanup(env);
assert.equal(database.prepare('SELECT id FROM accounts WHERE id=?').get('expired'),undefined);
console.log('PASS: account isolation, cross-device history, HTTPS cookie, origin check, encrypted storage, public-only search, model redaction, erasure and expiry');
