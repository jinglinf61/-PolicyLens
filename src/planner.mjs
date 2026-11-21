const DAY = 86_400_000;
const MINUTE = 60_000;
const collection = Object.freeze({ goal:'goals', habit:'habits', plan:'plans', record:'records' });
const limits = { goals:60, habits:60, plans:600, records:1200, checks:4000 };
const validDate = /^\d{4}-\d{2}-\d{2}$/;
const validId = /^[\da-f-]{36}$/i;

export class PlannerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function requireValue(condition, message, status) {
  if (!condition) throw new PlannerError(message,status);
}

function date(value) {
  requireValue(typeof value === 'string' && validDate.test(value), '请选择有效日期。');
  const parsed = new Date(value+'T00:00:00Z');
  requireValue(Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0,10) === value, '请选择有效日期。');
  return value;
}

function label(value) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  requireValue(cleaned.length >= 1 && cleaned.length <= 60, '名称请填写 1–60 字。');
  return cleaned;
}

function time(value, name) {
  requireValue(Number.isSafeInteger(value) && value >= Date.UTC(2000,0,1) && value < Date.UTC(2100,0,1), name+'时间有误。');
  return value;
}

function interval(data) {
  const start = time(data.start,'开始');
  const end = time(data.end,'结束');
  requireValue(end > start && end-start <= 7*DAY, '结束时间要晚于开始时间，单条记录最长 7 天。');
  return {start,end};
}

export function blankPlanner() {
  return {goals:[], habits:[], plans:[], records:[], checks:[], running:null};
}

function writeItem(state, type, data, now) {
  const rows = state[type];
  const index = data.id ? rows.findIndex(row => row.id === data.id) : -1;
  requireValue(!data.id || index >= 0, '这条记录已不存在，请刷新。',404);
  if (index < 0) requireValue(rows.length < limits[type], '已达到当前账号的记录上限。',409);
  const item = {id:index >= 0 ? rows[index].id : crypto.randomUUID(), title:label(data.title)};
  if (type === 'goals') {
    requireValue(['daily','weekly'].includes(data.period), '请选择目标周期。');
    const max = data.period === 'weekly' ? 10080 : 1440;
    requireValue(Number.isInteger(data.minutes) && data.minutes >= 1 && data.minutes <= max, '目标时长超出周期范围。');
    Object.assign(item,{minutes:data.minutes,period:data.period});
  }
  if (type === 'plans' || type === 'records') {
    Object.assign(item,interval(data));
    if (type === 'records') requireValue(item.end <= now, '实际用时只能记录已经发生的时段。');
    if (data.goalId) {
      requireValue(state.goals.some(goal => goal.id === data.goalId), '所选目标已不存在。',404);
      item.goalId = data.goalId;
    }
  }
  if (index < 0) rows.push(item);
  else rows[index] = item;
}

export function applyPlannerAction(state, data, now = Date.now()) {
  switch(data.action) {
    case 'save': {
      const type = Object.hasOwn(collection,data.kind) ? collection[data.kind] : '';
      requireValue(Boolean(type), '记录类型有误。');
      writeItem(state,type,data,now);
      return state;
    }
    case 'remove': {
      const type = Object.hasOwn(collection,data.kind) ? collection[data.kind] : '';
      requireValue(Boolean(type) && validId.test(data.id || ''), '请选择要删除的记录。');
      requireValue(state[type].some(row => row.id === data.id), '这条记录已不存在。',404);
      state[type] = state[type].filter(row => row.id !== data.id);
      if (type === 'habits') state.checks = state.checks.filter(row => row.habitId !== data.id);
      if (type === 'goals') {
        for (const row of [...state.plans,...state.records,state.running].filter(Boolean)) {
          if (row.goalId === data.id) delete row.goalId;
        }
      }
      return state;
    }
    case 'check': {
      const checkedDay = date(data.date);
      const today = new Date(now+8*60*MINUTE).toISOString().slice(0,10);
      requireValue(checkedDay <= today, '只能为今天或过去的日期打卡。');
      requireValue(state.habits.some(habit => habit.id === data.id), '该习惯已不存在。',404);
      requireValue(typeof data.done === 'boolean', '请选择打卡状态。');
      const index = state.checks.findIndex(item => item.date === checkedDay && item.habitId === data.id);
      if (data.done && index < 0) {
        requireValue(state.checks.length < limits.checks, '已达到当前账号的打卡上限。',409);
        state.checks.push({habitId:data.id,date:checkedDay});
      } else if (!data.done && index >= 0) state.checks.splice(index,1);
      return state;
    }
    case 'start': {
      requireValue(!state.running, '已有一项计时正在进行，请先结束。',409);
      const goal = state.goals.find(item => item.id === data.goalId);
      requireValue(!data.goalId || Boolean(goal), '所选目标已不存在。',404);
      state.running = {id:crypto.randomUUID(), title:label(goal?.title || data.title), start:now};
      if (goal) state.running.goalId = goal.id;
      return state;
    }
    case 'stop': {
      requireValue(state.running && state.running.id === data.id, '计时已结束或已在其他设备更改。',409);
      requireValue(state.records.length < limits.records, '请先移除一条旧记录再保存这次计时。',409);
      state.records.push({...state.running,end:Math.max(state.running.start+1,now)});
      state.running = null;
      return state;
    }
    case 'reset':
      return blankPlanner();
    default:
      throw new PlannerError('未知的时间管理操作。');
  }
}

export async function plannerRequest({db, user, post, body, open, encrypt}) {
  const query = (text,...args) => db.prepare(text).bind(...args);
  const saved = await query('SELECT version, ciphertext FROM planner_state WHERE account_id=?',user.id).first();
  const version = saved?.version ?? 0;
  const state = saved ? await open(saved.ciphertext) : blankPlanner();
  const now = Date.now();
  if (!post) return {state,version,now,expires:user.expires};
  requireValue(Number.isInteger(body.version) && body.version === version,
    '另一页面或设备已更新记录，请确认已同步的内容后重试。',409);
  const next = applyPlannerAction(state,body,now);
  const cipher = await encrypt(next);
  const row = await query(`INSERT INTO planner_state(account_id,version,ciphertext)
    SELECT ?,1,? WHERE EXISTS (
      SELECT 1 FROM sessions JOIN accounts ON accounts.id=sessions.account_id
      WHERE sessions.token_hash=? AND sessions.account_id=? AND sessions.expires>? AND accounts.expires>?
    )
    ON CONFLICT(account_id) DO UPDATE SET version=planner_state.version+1,ciphertext=excluded.ciphertext
    WHERE planner_state.version=? RETURNING version`,
    user.id,cipher,user.tokenHash,user.id,now,now,version).first();
  requireValue(row,'保存时登录失效或记录已同步，请刷新后重试。',409);
  return {state:next,version:row.version,now,expires:user.expires};
}
