import { ok, err, currentUser } from '../../lib/db.js';
import { ymd } from '../../lib/ids.js';

// GET /api/v1/dashboard — one aggregated "home glance". Every module contributes a
// small summary; modules with no data yet simply return zeros/nulls.
export async function onRequestGet({ env, data }) {
  const u = currentUser(data);
  if (!u) return err('not signed in', 401);
  const db = env.DB;
  const today = ymd();

  const out = {
    date: today,
    tasks:   { dueToday: 0, overdue: 0, next: [] },
    habits:  { active: 0, doneToday: 0 },
    health:  { doneToday: 0, weight: null },
    journal: { doneToday: false },
    money:   { nextBill: null, spentThisMonth: 0 },
    family:  { upcoming: null },
  };

  try {
    // Tasks due today / overdue + a few titles
    const t = await db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND done = 0 AND due_date = ?`
    ).bind(u.uid, today).first();
    out.tasks.dueToday = t?.n || 0;
    const ov = await db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND done = 0 AND due_date IS NOT NULL AND due_date < ?`
    ).bind(u.uid, today).first();
    out.tasks.overdue = ov?.n || 0;
    const nx = await db.prepare(
      `SELECT title, due_date FROM tasks WHERE user_id = ? AND done = 0
       ORDER BY (due_date IS NULL), due_date, priority DESC LIMIT 3`
    ).bind(u.uid).all();
    out.tasks.next = (nx.results || []).map(r => ({ title: r.title, due: r.due_date }));

    // Habits
    const ha = await db.prepare(`SELECT COUNT(*) AS n FROM habits WHERE user_id = ? AND active = 1`).bind(u.uid).first();
    out.habits.active = ha?.n || 0;
    const hd = await db.prepare(`SELECT COUNT(*) AS n FROM habit_logs WHERE user_id = ? AND date = ?`).bind(u.uid, today).first();
    out.habits.doneToday = hd?.n || 0;

    // Health — done check-ins today + latest weight
    const hc = await db.prepare(`SELECT COUNT(*) AS n FROM checkins WHERE user_id = ? AND date = ? AND done = 1`).bind(u.uid, today).first();
    out.health.doneToday = hc?.n || 0;
    const w = await db.prepare(
      `SELECT value FROM metrics WHERE user_id = ? AND metric = 'weight' ORDER BY date DESC LIMIT 1`
    ).bind(u.uid).first();
    out.health.weight = w ? w.value : null;

    // Journal done today?
    const j = await db.prepare(`SELECT 1 AS x FROM journal WHERE user_id = ? AND date = ?`).bind(u.uid, today).first();
    out.journal.doneToday = !!j;

    // Money — spend this month + next bill by due day
    const monthStart = today.slice(0, 8) + '01';
    const sp = await db.prepare(
      `SELECT COALESCE(SUM(-amount),0) AS spent FROM money_txns WHERE user_id = ? AND amount < 0 AND date >= ?`
    ).bind(u.uid, monthStart).first();
    out.money.spentThisMonth = Math.round((sp?.spent || 0) * 100) / 100;
    const dom = Number(today.slice(8, 10));
    const nb = await db.prepare(
      `SELECT name, amount, due_day FROM bills WHERE user_id = ? AND active = 1 AND due_day >= ?
       ORDER BY due_day LIMIT 1`
    ).bind(u.uid, dom).first();
    out.money.nextBill = nb ? { name: nb.name, amount: nb.amount, dueDay: nb.due_day } : null;

    // Family — next upcoming event on/after today
    const fam = await db.prepare(
      `SELECT title, date, kind, person FROM family WHERE user_id = ? AND date IS NOT NULL AND date >= ?
       ORDER BY date LIMIT 1`
    ).bind(u.uid, today).first();
    out.family.upcoming = fam ? { title: fam.title, date: fam.date, kind: fam.kind, person: fam.person } : null;
  } catch (e) {
    return err('could not build dashboard', 500);
  }

  return ok({ dashboard: out });
}
