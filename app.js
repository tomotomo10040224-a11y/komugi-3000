
const BUDGET = 3000; // 1日の予算（本人が決めた目標額）

dash.calc('ledger', {
  inputs: ['receipt_items'],
  title: '日別・週別の食費',
  description: '最初のレシート日から最後のレシート日の60日後まで、1日ごとの税込合計とその日の残り（3,000円−当日分）、月曜始まりの週の予算（3,000円×日数）・使った額・残り、前の週までに確定した貯金（各週の予算−実績の合計。赤字の週は差し引き）。月ごとの枠（3,000円×その月の日数。記録開始前の日は除く）・使った額・残りと、残り日数で割った1日あたりのペース。買い物のない日は0円として数えます。',
  fn: (receipt_items) => {
    const BUDGET = 3000, AHEAD_DAYS = 60, DAY = 86400000, byDay = {};
    for (const r of receipt_items) {
      const day = String(r.date).slice(0, 10);
      byDay[day] = (byDay[day] || 0) + Number(r.amount);
    }
    const days = Object.keys(byDay).sort(), out = [];
    if (!days.length) return out;
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    const monday = (t) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
    const start = Date.parse(days[0]), end = Date.parse(days[days.length - 1]) + AHEAD_DAYS * DAY;
    let cum = 0, saved = 0, week = null, weekSpent = 0, weekElapsed = 0, month = null, monthSpent = 0;
    for (let t = start; t <= end; t += DAY) {
      const wStart = Math.max(monday(t), start), wEnd = monday(t) + 6 * DAY;
      if (wStart !== week) {
        if (week !== null) saved += BUDGET * weekElapsed - weekSpent;
        week = wStart; weekSpent = 0; weekElapsed = 0;
      }
      const spent = byDay[iso(t)] || 0;
      cum += spent; weekSpent += spent; weekElapsed += 1;
      const dt = new Date(t), mKey = iso(t).slice(0, 7);
      if (mKey !== month) { month = mKey; monthSpent = 0; }
      monthSpent += spent;
      const mStart = Math.max(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1), start), mEnd = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0);
      const monthDays = Math.round((mEnd - mStart) / DAY) + 1, monthAfter = Math.round((mEnd - t) / DAY);
      const monthLeft = BUDGET * monthDays - monthSpent;
      const weekDays = Math.round((wEnd - wStart) / DAY) + 1, daysAfter = Math.round((wEnd - t) / DAY);
      const weekLeft = BUDGET * weekDays - weekSpent;
      out.push({
        date: iso(t), day_no: out.length + 1, spent, budget: BUDGET, today_left: BUDGET - spent,
        week_start: iso(wStart), week_end: iso(wEnd), week_days: weekDays, week_budget: BUDGET * weekDays,
        week_spent: weekSpent, week_left: weekLeft, week_days_after: daysAfter,
        rest_per_day: daysAfter > 0 ? Math.floor(weekLeft / daysAfter) : null,
        month_start: iso(mStart), month_end: iso(mEnd), month_days: monthDays, month_budget: BUDGET * monthDays,
        month_spent: monthSpent, month_left: monthLeft, month_days_after: monthAfter,
        month_rest_per_day: monthAfter > 0 ? Math.floor(monthLeft / monthAfter) : null,
        saved, cum_spent: cum, avg_per_day: Math.round(cum / (out.length + 1)),
      });
    }
    return out;
  },
});

dash.calc('weeks', {
  inputs: ['ledger'],
  title: '週ごとの食費と貯金',
  description: '月曜始まりの週ごとに、予算（3,000円×日数）、使った額、差額、その週が終わった時点の旅行貯金と、1年で10万円に均等に届く場合の予定額。差額は週末に貯金へ加算し、赤字なら差し引きます。',
  fn: (ledger) => {
    const GOAL = 100000, PERIOD_DAYS = 365;
    return ledger.filter((d) => d.date === d.week_end).map((d) => ({
      week_start: d.week_start, week_end: d.week_end, days: d.week_days,
      budget: d.week_budget, spent: d.week_spent, result: d.week_left, saved_after: d.saved + d.week_left,
      expected_after: Math.round(GOAL * Math.min(d.day_no, PERIOD_DAYS) / PERIOD_DAYS),
    }));
  },
});

dash.calc('motivation', {
  inputs: ['ledger'],
  title: '家族旅行貯金と連続記録',
  description: '1日ごとに、前の週までに確定した貯金、記録開始から365日で10万円という目標までの残り・残り日数・必要な1日あたりの余り、次の節目（1,000円、5,000円、1万円、2.5万円、5万円、7.5万円、10万円）までの残りと進み具合、節目を等間隔に並べた道のり上の位置、これまでのペースが続いた場合の達成予定日（確定した貯金が2週間分以上あるときだけ）、その日の終わりに今週の枠がマイナスになっていない日の連続日数、週の予算を超えたとき1日2,500円・2,000円で過ごして取り戻すまでの日数。',
  fn: (ledger) => {
    const GOAL = 100000, PERIOD_DAYS = 365, BUDGET = 3000;
    const MILESTONES = [1000, 5000, 10000, 25000, 50000, 75000, 100000];
    let streak = 0, best = 0;
    return ledger.map((d) => {
      streak = d.week_left >= 0 ? streak + 1 : 0;
      best = Math.max(best, streak);
      const goal_left = Math.max(0, GOAL - d.saved);
      const days_left = Math.max(0, PERIOD_DAYS - d.day_no + 1);
      const next = MILESTONES.find((m) => m > d.saved) || GOAL;
      const prev = MILESTONES.filter((m) => m <= d.saved).pop() || 0;
      const passed = MILESTONES.filter((m) => m <= d.saved).length;
      const step = next > prev ? Math.max(0, Math.min(1, (d.saved - prev) / (next - prev))) : 1;
      const in_week = d.week_days - d.week_days_after, banked_days = d.day_no - in_week;
      const forecast_date = d.saved > 0 && d.saved < GOAL && banked_days >= 14
        ? new Date(Date.parse(d.date) + (Math.ceil(goal_left / (d.saved / banked_days)) - in_week) * 86400000).toISOString().slice(0, 10)
        : null;
      const week_over = Math.max(0, -d.week_left);
      return {
        date: d.date, saved: d.saved, goal: GOAL, goal_left,
        milestones_passed: passed, road_progress: Math.min(1, (passed + (passed < MILESTONES.length ? step : 0)) / MILESTONES.length), forecast_date,
        goal_progress: Math.max(0, Math.min(1, d.saved / GOAL)),
        prev_milestone: prev, next_milestone: next, to_milestone: Math.max(0, next - d.saved),
        milestone_progress: next > prev ? Math.max(0, Math.min(1, (d.saved - prev) / (next - prev))) : 1,
        days_left, needed_per_day: days_left > 0 ? Math.ceil(goal_left / days_left) : goal_left,
        streak_days: streak, best_streak_days: best, week_over,
        recover_days_2500: Math.ceil(week_over / (BUDGET - 2500)),
        recover_days_2000: Math.ceil(week_over / (BUDGET - 2000)),
      };
    });
  },
});

dash.calc('by_category', {
  inputs: ['receipt_items'],
  title: '分類別の食費',
  description: '記録開始からの税込金額を分類ごとに合計し、全体に占める割合を出したもの。',
  fn: (receipt_items) => {
    const sums = {};
    let total = 0;
    for (const r of receipt_items) {
      const amount = Number(r.amount);
      sums[r.category] = (sums[r.category] || 0) + amount;
      total += amount;
    }
    return Object.keys(sums)
      .map((category) => ({category, amount: sums[category], share: total ? sums[category] / total : 0}))
      .sort((a, b) => b.amount - a.amount);
  },
});

dash.calc('receipts', {
  inputs: ['receipt_items'],
  title: 'レシートごとの合計',
  description: 'レシート明細を日付とレシート番号でまとめ、税込金額を合計したもの。時刻はレシートに印字された会計時刻。',
  fn: (receipt_items) => {
    const groups = {};
    for (const r of receipt_items) {
      const date = String(r.date).slice(0, 10), key = date + '|' + r.receipt_no;
      if (!groups[key]) groups[key] = {date, time: r.time || '', receipt_no: String(r.receipt_no), store: r.store, total: 0, items: 0};
      groups[key].total += Number(r.amount);
      groups[key].items += 1;
    }
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || a.receipt_no.localeCompare(b.receipt_no));
  },
});

dash.calc('price_changes', {
  inputs: ['receipt_items'],
  title: '値上がりした品目',
  description: '同じ品目について、直近の購入日とその前の購入日の税抜価格を比べ、上がったものを出したもの。直近2週間に買った品が対象。重さで値段が変わる肉と魚は除く。',
  fn: (receipt_items) => {
    const byItem = {};
    let maxDate = '';
    for (const r of receipt_items) {
      const date = String(r.date).slice(0, 10), price = Number(r.price);
      if (date > maxDate) maxDate = date;
      if (r.category === '肉' || r.category === '魚' || r.category === '肉・魚') continue;
      const days = byItem[r.item] || (byItem[r.item] = {});
      days[date] = days[date] == null ? price : Math.min(days[date], price);
    }
    const since = maxDate ? new Date(new Date(maxDate + 'T00:00:00Z').getTime() - 13 * 86400000).toISOString().slice(0, 10) : '';
    const out = [];
    for (const item of Object.keys(byItem)) {
      const dates = Object.keys(byItem[item]).sort();
      if (dates.length < 2) continue;
      const last_date = dates[dates.length - 1], prev_date = dates[dates.length - 2];
      const last_price = byItem[item][last_date], prev_price = byItem[item][prev_date];
      if (last_price > prev_price && last_date >= since) out.push({item, prev_date, prev_price, last_date, last_price, diff: last_price - prev_price});
    }
    return out.sort((a, b) => b.diff - a.diff);
  },
});

dash.calc('restock', {
  inputs: ['receipt_items'],
  title: '買い足しの目安',
  description: '別々の日に3回以上買った品目について、買う間隔の平均と、前回の購入日にその間隔を足した次の目安日を出したもの。',
  fn: (receipt_items) => {
    const DAY = 86400000, t = (s) => new Date(s + 'T00:00:00Z').getTime();
    const byItem = {};
    for (const r of receipt_items) (byItem[r.item] || (byItem[r.item] = {}))[String(r.date).slice(0, 10)] = true;
    const out = [];
    for (const item of Object.keys(byItem)) {
      const dates = Object.keys(byItem[item]).sort();
      if (dates.length < 3) continue;
      const last_date = dates[dates.length - 1];
      const avg_days = Math.max(1, Math.round((t(last_date) - t(dates[0])) / DAY / (dates.length - 1)));
      out.push({item, times: dates.length, avg_days, last_date, next_date: new Date(t(last_date) + avg_days * DAY).toISOString().slice(0, 10)});
    }
    return out.sort((a, b) => a.next_date.localeCompare(b.next_date) || a.item.localeCompare(b.item));
  },
});

dash.calc('week_habits', {
  inputs: ['receipt_items'],
  title: '週ごとの買い物の回数と内訳',
  description: '月曜〜日曜の週ごとに、買い物の回数（レシートの枚数）、1回あたりの税込金額、惣菜・お菓子・飲料・お酒が税込金額に占める割合を出したもの。',
  fn: (receipt_items) => {
    const DAY = 86400000, byWeek = {};
    for (const r of receipt_items) {
      const date = String(r.date).slice(0, 10), d = new Date(date + 'T00:00:00Z'), amount = Number(r.amount);
      const week_end = new Date(d.getTime() + ((7 - d.getUTCDay()) % 7) * DAY).toISOString().slice(0, 10);
      const w = byWeek[week_end] || (byWeek[week_end] = {week_end, spent: 0, easy_spent: 0, seen: {}});
      w.spent += amount;
      if (r.category === '惣菜' || r.category === 'お菓子' || r.category === '飲料' || r.category === 'お酒') w.easy_spent += amount;
      w.seen[date + '|' + r.receipt_no] = true;
    }
    return Object.keys(byWeek).sort().map((k) => {
      const w = byWeek[k], trips = Object.keys(w.seen).length;
      return {week_end: w.week_end, trips, spent: w.spent, per_trip: Math.round(w.spent / trips), easy_spent: w.easy_spent, easy_share: w.spent ? w.easy_spent / w.spent : 0};
    });
  },
});

dash.calc('point_use', {
  inputs: ['receipt_items', 'point_days'],
  title: 'ポイントデーの活用率',
  description: '月ごとに、税込金額のうちポイント3倍・5倍の日に買った分の割合を出したもの。ポイントデーが登録されている月だけが対象。',
  fn: (receipt_items, point_days) => {
    const isPoint = {}, months = {};
    for (const p of point_days) {
      if (!(Number(p.multiplier) > 1) || p.limited) continue;
      const date = String(p.date).slice(0, 10), month = date.slice(0, 7);
      isPoint[date] = true;
      if (!months[month]) months[month] = {month, spent: 0, point_spent: 0};
    }
    for (const r of receipt_items) {
      const date = String(r.date).slice(0, 10), m = months[date.slice(0, 7)];
      if (!m) continue;
      m.spent += Number(r.amount);
      if (isPoint[date]) m.point_spent += Number(r.amount);
    }
    return Object.keys(months).sort().map((k) => ({...months[k], share: months[k].spent ? months[k].point_spent / months[k].spent : 0}));
  },
});

dash.calc('by_weekday', {
  inputs: ['receipt_items'],
  title: '曜日ごとの平均',
  description: '最初のレシートの日から最後のレシートの日までを対象に、曜日ごとの税込金額の合計を、その曜日の日数で割ったもの。',
  fn: (receipt_items) => {
    if (!receipt_items.length) return [];
    const DAY = 86400000, NAMES = ['日', '月', '火', '水', '木', '金', '土'];
    const t = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z').getTime();
    const totals = [0, 0, 0, 0, 0, 0, 0], days = [0, 0, 0, 0, 0, 0, 0];
    let first = Infinity, last = -Infinity;
    for (const r of receipt_items) {
      const time = t(r.date);
      first = Math.min(first, time);
      last = Math.max(last, time);
      totals[new Date(time).getUTCDay()] += Number(r.amount);
    }
    for (let time = first; time <= last; time += DAY) days[new Date(time).getUTCDay()] += 1;
    const span_days = Math.round((last - first) / DAY) + 1;
    return [1, 2, 3, 4, 5, 6, 0].map((n) => ({weekday: n, weekday_name: NAMES[n], days: days[n], total: totals[n], avg: days[n] ? Math.round(totals[n] / days[n]) : 0, span_days}));
  },
});

dash.calc('buy_days', {
  inputs: ['point_days', 'weekly_events'],
  title: '日ごとのお買い得情報',
  description: '登録済みの最初のポイントデーから最後のポイントデーの35日後まで、1日ごとにポイント倍率と、その曜日の定例企画を並べたもの。最後のポイントデーより先の日は、ポイントを「未登録」とします。',
  fn: (point_days, weekly_events) => {
    const AHEAD_DAYS = 35, DAY = 86400000, points = {}, weekly = {};
    for (const p of point_days) points[String(p.date).slice(0, 10)] = p;
    for (const w of weekly_events) weekly[Number(w.weekday)] = w.event;
    const dates = Object.keys(points).sort(), out = [];
    if (!dates.length) return out;
    const end = Date.parse(dates[dates.length - 1]) + AHEAD_DAYS * DAY;
    for (let t = Date.parse(dates[0]); t <= end; t += DAY) {
      const date = new Date(t).toISOString().slice(0, 10), p = points[date];
      const points_label = p ? p.label : (date > dates[dates.length - 1] ? '未登録' : '');
      out.push({date, multiplier: p ? Number(p.multiplier) : 0, points: points_label, limited: p ? (p.limited || '') : '', weekly: weekly[new Date(t).getUTCDay()] || ''});
    }
    return out;
  },
});

dash.calc('price_points', {
  inputs: ['receipt_items', 'flyer_items'],
  title: '品目ごとの価格の記録',
  description: '買ったときの税抜価格（同じ日に複数あれば安いほう）と、チラシに載った税抜価格を、品目ごとに日付順に並べたもの。チラシの品は、同じ商品を買ったことがあればその品目名にそろえます。',
  fn: (receipt_items, flyer_items) => {
    const out = [], seen = {};
    for (const r of receipt_items) {
      const date = String(r.date).slice(0, 10), k = r.item + '|' + date, price = Number(r.price);
      if (seen[k] == null) { seen[k] = out.length; out.push({id: 'buy|' + k, item: r.item, category: r.category, date, date_to: date, price, source: 'buy', unit: ''}); }
      else if (price < out[seen[k]].price) out[seen[k]].price = price;
    }
    for (const f of flyer_items) {
      out.push({id: 'flyer|' + f.id, item: f.match_item || f.item, category: f.category, date: String(f.valid_from).slice(0, 10), date_to: String(f.valid_to).slice(0, 10), price: Number(f.price), source: 'flyer', unit: f.unit || ''});
    }
    return out.sort((a, b) => a.item.localeCompare(b.item, 'ja') || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  },
});

dash.calc('flyer_deals', {
  inputs: ['flyer_items', 'price_points'],
  title: 'チラシの特売品と、これまでの最安',
  description: 'チラシの特売品に、同じ品のこれまでの最安（買った価格と、ほかのチラシの価格。税抜）を並べ、チラシ価格がそれ以下かを出したもの。',
  fn: (flyer_items, price_points) => {
    const by = {};
    for (const p of price_points) (by[p.item] || (by[p.item] = [])).push(p);
    return flyer_items.map((f) => {
      const key = f.match_item || f.item, price = Number(f.price);
      let min_price = null;
      for (const p of by[key] || []) if (p.id !== 'flyer|' + f.id && (min_price == null || p.price < min_price)) min_price = p.price;
      return {
        id: f.id, key, valid_from: String(f.valid_from).slice(0, 10), valid_to: String(f.valid_to).slice(0, 10),
        item: f.item, category: f.category, price, unit: f.unit || '', note: f.note || '',
        bought: !!f.match_item, min_price, good: min_price != null && price <= min_price,
      };
    });
  },
});

const root = document.querySelector('.fd');
const $ = (id) => root.querySelector('#' + id);
const ACCENT = dash.colors[0];
const CRIT = 'var(--cds-chart-status-critical)';
const SAVE = 'var(--color-ok)';
const REF = 'var(--cds-chart-reference)';
root.style.setProperty('--fd-accent', ACCENT);
const skelBuy = [...root.querySelectorAll('#card-buy .dash-skeleton')];
const skelMain = [...root.querySelectorAll('.dash-skeleton')].filter((e) => !skelBuy.includes(e));
const fmt = d3.format(',');
const pct = d3.format('.1%');
const yen = (v) => (v < 0 ? '-' : '') + '¥' + fmt(Math.abs(Math.round(v)));
const signed = (v) => (v < 0 ? '-' : '+') + '¥' + fmt(Math.abs(Math.round(v)));
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_MS = 86400000;
const toDate = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const addDays = (s, n) => new Date(toDate(s).getTime() + n * DAY_MS).toISOString().slice(0, 10);
const md = (s) => { const d = toDate(s); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); };
const wd = (s) => WD[toDate(s).getUTCDay()];
const mdw = (s) => md(s) + '(' + wd(s) + ')';
const jpDate = (s) => { const d = toDate(s); return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日(' + wd(s) + ')'; };
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY_MS);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const rowsOf = (d) => (d.status === 'ok' && Array.isArray(d.data) ? d.data : []);
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 見出しの時刻: 今日を表示しているときだけ、端末の現在時刻を出す
let clockOn = false;
function tick() {
  const d = new Date();
  $('v-time').textContent = clockOn ? d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') : '';
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function put(id, text, cls, date) {
  const e = $(id);
  e.textContent = text;
  e.classList.remove('fd-ok', 'fd-bad');
  if (cls) e.classList.add(cls);
  if (date) e.setAttribute('data-where', 'date=' + date);
}

function chip(id, text, bad) {
  const e = $(id);
  e.hidden = !text;
  e.textContent = text || '';
  e.classList.toggle('fd-pill-bad', !!bad);
}

// 状態は絵文字で出す（読み上げ用に言葉も持たせる）。okLabel が空なら、オーバーのときだけ出す
function statusChip(id, over, okLabel) {
  const e = $(id), label = over ? 'オーバー' : okLabel;
  e.hidden = !label;
  e.textContent = label ? (over ? '😣' : '😊') : '';
  if (label) { e.setAttribute('role', 'img'); e.setAttribute('aria-label', label); }
}

// 動き: 最初にデータがそろったとき1回だけ再生する（画面幅が変わっても再生し直さない）
let played = false;
const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const stagger = (i, step) => i * step + 'ms';

// 数字のカウントアップ。本来の数字は隠したまま保ち、飾りの数字を上に重ねて動かす
function countUp(id, to, format) {
  const target = $(id);
  if (!target || reduceMotion) return;
  const ghost = el('span', target.classList.contains('fd-bad') ? 'fd-bad' : '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = format(0);
  target.classList.add('fd-hide');
  target.after(ghost);
  const t0 = performance.now(), dur = 900;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - k, 3);
    ghost.textContent = format(to * eased);
    if (k < 1) requestAnimationFrame(tick);
    else { ghost.remove(); target.classList.remove('fd-hide'); }
  };
  requestAnimationFrame(tick);
}

function meter(id, share, over) {
  const b = $(id);
  b.style.width = clamp01(share) * 100 + '%';
  b.classList.toggle('fd-meter-over', !!over);
}

function fail(box) {
  const d = el('div', 'fd-fail');
  d.append(el('span', 'fd-dot'), el('span', '', '読み込めませんでした'));
  box.replaceChildren(d);
}

function svgIn(box, W, H, label) {
  return d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', label);
}

function textWidth(svg, strs) {
  const t = svg.append('text').attr('class', 'fd-tick');
  let w = 0;
  for (const s of strs) {
    t.text(s);
    w = Math.max(w, t.node().getComputedTextLength());
  }
  t.remove();
  return w;
}

function makeTip(box) {
  const tip = el('div', 'fd-tip');
  box.appendChild(tip);
  return {
    show(event, lines) {
      tip.replaceChildren();
      for (const l of lines) {
        const row = el('div', l.date ? 'fd-tip-date' : 'fd-tip-line');
        if (l.color) {
          const sw = el('span', 'fd-sw');
          sw.style.background = l.color;
          row.append(sw);
        }
        row.append(el('span', '', l.text));
        tip.append(row);
      }
      tip.style.display = 'block';
      const b = box.getBoundingClientRect();
      const px = event.clientX - b.left, py = event.clientY - b.top;
      tip.style.left = Math.max(0, Math.min(px + 12, b.width - tip.offsetWidth)) + 'px';
      tip.style.top = Math.max(0, py - tip.offsetHeight - 8) + 'px';
    },
    hide() { tip.style.display = 'none'; },
  };
}

function yAxis(svg, y, ticks, x1, x2) {
  svg.append('g').selectAll('line').data(ticks).join('line')
    .attr('x1', x1).attr('x2', x2).attr('y1', (d) => y(d)).attr('y2', (d) => y(d))
    .attr('stroke', (d) => (d === 0 ? 'var(--cds-chart-axis)' : 'var(--cds-chart-grid)'))
    .attr('stroke-width', 1).attr('stroke-dasharray', (d) => (d === 0 ? null : '2 5'));
  svg.append('g').selectAll('text').data(ticks).join('text')
    .attr('class', 'fd-tick').attr('text-anchor', 'end').attr('dy', '0.32em')
    .attr('x', x1 - 6).attr('y', (d) => y(d)).text((d) => yen(d));
}

// 今週の毎日: 月曜〜日曜の7枠。記録前の日は薄い印、これからの日は点線の枠
function drawDays(box, slots, isCurrent) {
  box.replaceChildren();
  if (!slots.length) return;
  const W = Math.max(box.clientWidth, 240), H = 170, mt = 24, mb = 40, mr = 6;
  const svg = svgIn(box, W, H, '今週の日別の食費');
  const y = d3.scaleLinear([0, Math.max(BUDGET, d3.max(slots, (d) => d.spent)) * 1.15], [H - mb, mt]);
  const ticks = y.ticks(3);
  const ml = textWidth(svg, ticks.map(yen)) + 10;
  const x = d3.scaleBand(slots.map((d) => d.date), [ml, W - mr]).padding(0.28);
  const bw = Math.min(40, x.bandwidth());
  const cx = (d) => x(d.date) + x.bandwidth() / 2;
  yAxis(svg, y, ticks, ml, W - mr);
  svg.append('g').selectAll('rect').data(slots.filter((d) => d.state === 'future')).join('rect')
    .attr('x', (d) => cx(d) - bw / 2).attr('width', bw).attr('y', y(BUDGET)).attr('height', y(0) - y(BUDGET))
    .attr('fill', 'none').attr('stroke', REF).attr('stroke-width', 1).attr('stroke-dasharray', '3 4');
  svg.append('g').selectAll('rect').data(slots.filter((d) => d.state === 'before' || (d.state === 'past' && d.spent === 0))).join('rect')
    .attr('x', (d) => cx(d) - bw / 2).attr('width', bw).attr('y', y(0) - 5).attr('height', 5)
    .attr('fill', (d) => (d.state === 'before' ? 'var(--cds-chart-grid)' : ACCENT)).attr('opacity', (d) => (d.state === 'before' ? 1 : 0.4));
  svg.append('g').selectAll('rect').data(slots.filter((d) => (d.state === 'past' || d.state === 'today') && d.spent > 0)).join('rect')
    .attr('x', (d) => cx(d) - bw / 2).attr('width', bw)
    .attr('y', (d) => y(d.spent)).attr('height', (d) => Math.max(0, y(0) - y(d.spent)))
    .attr('fill', (d) => (d.spent > BUDGET ? CRIT : ACCENT))
    .attr('opacity', (d) => (d.state === 'today' || !isCurrent ? 1 : 0.55))
    .attr('class', 'fd-grow-y').style('animation-delay', (d, i) => stagger(i, 60));
  // 今週は今日の金額だけ、過去の週は入るなら全部の日の金額を出す
  const fits = textWidth(svg, slots.map((d) => yen(d.spent))) + 4 <= x.step();
  svg.append('g').selectAll('text').data(slots.filter((d) => d.spent > 0 && (isCurrent ? d.state === 'today' : fits))).join('text')
    .attr('class', isCurrent ? 'fd-val fd-fade' : 'fd-tick fd-tick-on').style('animation-delay', '600ms').attr('text-anchor', 'middle').attr('x', cx).attr('y', (d) => y(d.spent) - 6).text((d) => yen(d.spent));
  const cls = (d) => 'fd-tick' + (d.state === 'today' ? ' fd-tick-on' : '');
  svg.append('g').selectAll('text').data(slots).join('text')
    .attr('class', cls).attr('text-anchor', 'middle').attr('x', cx).attr('y', H - mb + 17).text((d) => wd(d.date));
  svg.append('g').selectAll('text').data(slots).join('text')
    .attr('class', cls).attr('text-anchor', 'middle').attr('x', cx).attr('y', H - mb + 34).text((d) => toDate(d.date).getUTCDate());
  const tip = makeTip(box);
  svg.append('g').selectAll('rect').data(slots).join('rect')
    .attr('x', (d) => x(d.date)).attr('width', x.bandwidth()).attr('y', mt).attr('height', H - mb - mt)
    .attr('fill', 'transparent')
    .on('pointermove', (event, d) => {
      const lines = [{date: true, text: mdw(d.date)}];
      if (d.state === 'before') lines.push({text: '記録を始める前の日'});
      else if (d.state === 'future') lines.push({text: 'これからの日（枠 ' + yen(BUDGET) + '）'});
      else lines.push({text: '食費 ' + yen(d.spent)}, {text: '3,000円との差 ' + signed(d.today_left)});
      tip.show(event, lines);
    })
    .on('pointerleave', () => tip.hide());
}

// Weekly: Dailyと同じ縦棒。終わった週・今週・これからの週を並べ、点線の枠がその週の予算
function weekLabel(d) {
  const range = d.week_start === d.week_end ? mdw(d.week_start) + 'のみ' : mdw(d.week_start) + '〜' + mdw(d.week_end);
  return (d.state === 'current' ? '今週 ' : '') + range;
}

function drawWeeks(box, rows, onPick) {
  box.replaceChildren();
  const real = rows.filter((d) => !d.empty);
  if (!real.length) return;
  const W = Math.max(box.clientWidth, 240), H = 170, mt = 24, mb = 26, mr = 6;
  const svg = svgIn(box, W, H, '週ごとの食費');
  const y = d3.scaleLinear([0, d3.max(real, (d) => Math.max(d.spent, d.budget)) * 1.15], [H - mb, mt]);
  const ticks = y.ticks(3);
  const ml = textWidth(svg, ticks.map(yen)) + 10;
  const x = d3.scaleBand(rows.map((d) => d.week_start), [ml, W - mr]).padding(0.28);
  const bw = Math.min(40, x.bandwidth());
  const cx = (d) => x(d.week_start) + x.bandwidth() / 2;
  yAxis(svg, y, ticks, ml, W - mr);
  svg.append('g').selectAll('rect').data(real.filter((d) => d.spent > 0)).join('rect')
    .attr('x', (d) => cx(d) - bw / 2).attr('width', bw)
    .attr('y', (d) => y(d.spent)).attr('height', (d) => Math.max(0, y(0) - y(d.spent)))
    .attr('fill', (d) => (d.spent > d.budget ? CRIT : ACCENT))
    .attr('opacity', (d) => (d.selected ? 1 : 0.5))
    .attr('class', 'fd-grow-y').style('animation-delay', (d, i) => stagger(i, 60));
  svg.append('g').selectAll('text').data(real.filter((d) => d.selected && d.spent > 0)).join('text')
    .attr('class', 'fd-val fd-fade').style('animation-delay', '600ms').attr('text-anchor', 'middle')
    .attr('x', cx).attr('y', (d) => y(d.spent) - 6).text((d) => yen(d.spent));
  const label = (d) => (d.state === 'current' ? '今週' : md(d.week_start) + '〜');
  const lw = textWidth(svg, real.map(label));
  const k = Math.max(1, Math.ceil((lw + 6) / Math.max(x.step(), 1)));
  const forced = real.map((d, i) => (d.selected || d.state === 'current' ? i : -1)).filter((i) => i >= 0);
  const shown = real.filter((d, i) => forced.includes(i) || ((real.length - 1 - i) % k === 0 && forced.every((j) => Math.abs(i - j) >= k)));
  svg.append('g').selectAll('text').data(shown).join('text')
    .attr('class', (d) => 'fd-tick' + (d.selected ? ' fd-tick-on' : '')).attr('text-anchor', 'middle')
    .attr('x', cx).attr('y', H - mb + 17).text(label);
  const tip = makeTip(box);
  svg.append('g').selectAll('rect').data(real).join('rect')
    .attr('x', (d) => x(d.week_start)).attr('width', x.bandwidth()).attr('y', mt).attr('height', H - mb - mt)
    .attr('fill', 'transparent').style('cursor', 'pointer')
    .on('click', (event, d) => { if (onPick) onPick(d); })
    .on('pointermove', (event, d) => tip.show(event, [
      {date: true, text: weekLabel(d) + (d.state === 'current' ? '（途中）' : '')},
      {text: '使った額 ' + yen(d.spent)},
      {text: '週の枠 ' + yen(d.budget)},
      {text: (d.state === 'current' ? 'いまの残り ' : '貯金へ ') + signed(d.result)},
    ]))
    .on('pointerleave', () => tip.hide());
}

// 家族旅行までの道のり: 節目を等間隔に並べた道。貯金が増えると「いまここ」の目印が右へ進む
const STOPS = [0, 1000, 5000, 10000, 25000, 50000, 75000, 100000];
const STOP_LABELS = ['', '1千', '5千', '1万', '2.5万', '5万', '7.5万', '10万'];

function drawRoad(box, m) {
  box.replaceChildren();
  if (!m) return;
  const W = Math.max(box.clientWidth, 260), H = 124, padL = 20, padR = 24, mid = 58, amp = 12;
  const svg = svgIn(box, W, H, '家族旅行までの道のり');
  const n = STOPS.length - 1;
  const pt = (t) => [padL + (W - padL - padR) * t, mid + amp * Math.sin(t * Math.PI * 3)];
  const curve = (t1) => d3.line().curve(d3.curveCatmullRom)(d3.range(0, 61).map((i) => pt((i / 60) * t1)));
  const prog = clamp01(m.road_progress), passed = m.milestones_passed, reached = m.goal_left === 0;
  svg.append('path').attr('d', curve(1)).attr('fill', 'none').attr('stroke', 'var(--fd-track)').attr('stroke-width', 10).attr('stroke-linecap', 'round');
  if (prog > 0) {
    svg.append('path').attr('class', 'fd-draw').attr('d', curve(prog)).attr('fill', 'none').attr('stroke', SAVE).attr('stroke-width', 10).attr('stroke-linecap', 'round')
      .each(function () { this.style.setProperty('--len', Math.ceil(this.getTotalLength())); });
  }
  const stops = STOPS.map((v, i) => ({v, i, p: pt(i / n), state: i <= passed ? 'passed' : (i === passed + 1 ? 'next' : 'future')}));
  svg.append('g').selectAll('circle').data(stops.filter((s) => s.i > 0)).join('circle')
    .attr('cx', (s) => s.p[0]).attr('cy', (s) => s.p[1]).attr('r', (s) => (s.i === n ? 8 : 6.5))
    .attr('fill', (s) => (s.state === 'passed' ? SAVE : 'var(--color-panel)'))
    .attr('stroke', (s) => (s.state === 'passed' ? SAVE : (s.state === 'next' ? 'var(--color-warn)' : 'var(--fd-muted)')))
    .attr('stroke-width', 2);
  svg.append('g').selectAll('text').data(stops.filter((s) => s.i > 0)).join('text')
    .attr('class', (s) => 'fd-tick' + (s.state === 'next' ? ' fd-road-next' : (s.state === 'passed' ? ' fd-tick-on' : '')))
    .attr('text-anchor', (s) => (s.i === n ? 'end' : 'middle'))
    .attr('x', (s) => (s.i === n ? s.p[0] + 12 : s.p[0])).attr('y', (s) => s.p[1] + 25).text((s) => STOP_LABELS[s.i]);
  svg.append('text').attr('class', 'fd-road-emoji').attr('text-anchor', 'middle').attr('x', stops[0].p[0]).attr('y', stops[0].p[1] - 14).text('🏠');
  svg.append('text').attr('class', 'fd-road-emoji').attr('text-anchor', 'middle').attr('x', stops[n].p[0]).attr('y', stops[n].p[1] - 15).text('✈️');
  const mp = pt(prog);
  svg.append('circle').attr('class', 'fd-pulse').attr('cx', mp[0]).attr('cy', mp[1]).attr('r', 9).attr('fill', SAVE)
    .style('transform-box', 'fill-box').style('transform-origin', 'center');
  svg.append('circle').attr('cx', mp[0]).attr('cy', mp[1]).attr('r', 6.5).attr('fill', SAVE).attr('stroke', 'var(--color-fg)').attr('stroke-width', 2);
  if (!reached) {
    const atStart = prog < 0.03; // 出発地点では家の絵と重ならないよう、下に出す
    svg.append('text').attr('class', 'fd-end').attr('text-anchor', mp[0] < 50 ? 'start' : (mp[0] > W - 50 ? 'end' : 'middle'))
      .attr('x', mp[0] < 50 ? mp[0] - 9 : mp[0]).attr('y', atStart ? mp[1] + 26 : mp[1] - 15).text('いまここ');
  }
  const tip = makeTip(box);
  svg.append('g').selectAll('circle').data(stops.filter((s) => s.i > 0)).join('circle')
    .attr('cx', (s) => s.p[0]).attr('cy', (s) => s.p[1]).attr('r', 16).attr('fill', 'transparent')
    .on('pointermove', (event, s) => tip.show(event, [
      {date: true, text: (s.i === n ? 'ゴール ' : '節目 ') + yen(s.v)},
      {text: s.state === 'passed' ? '通過しました' : 'あと ' + yen(s.v - m.saved)},
    ]))
    .on('pointerleave', () => tip.hide());
}

// 週ごとの貯金: 終わった週ごとに、貯金へ回った金額（赤字の週は下向き）
function drawSavedWeeks(box, rows) {
  box.replaceChildren();
  if (!rows.length) return;
  const W = Math.max(box.clientWidth, 240), H = 104, mt = 22, mb = 22, ml = 4, mr = 4;
  const svg = svgIn(box, W, H, '週ごとの貯金');
  const lo = Math.min(0, d3.min(rows, (d) => d.result)), hi = Math.max(1, d3.max(rows, (d) => d.result));
  const y = d3.scaleLinear([lo, hi * 1.05], [H - mb, mt]);
  const x = d3.scaleBand(rows.map((d) => d.week_start), [ml, W - mr]).padding(0.3);
  const bw = Math.min(40, x.bandwidth());
  const cx = (d) => x(d.week_start) + x.bandwidth() / 2;
  svg.append('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)').attr('stroke-width', 1);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('class', 'fd-grow-y').style('animation-delay', (d, i) => stagger(i, 60))
    .attr('x', (d) => cx(d) - bw / 2).attr('width', bw)
    .attr('y', (d) => Math.min(y(d.result), y(0))).attr('height', (d) => Math.max(2, Math.abs(y(d.result) - y(0))))
    .attr('fill', (d) => (d.result < 0 ? CRIT : SAVE));
  const vw = textWidth(svg, rows.map((d) => signed(d.result)));
  const showAll = vw + 6 <= x.step();
  svg.append('g').selectAll('text').data(rows.filter((d, i) => showAll || i === rows.length - 1)).join('text')
    .attr('class', 'fd-tick fd-tick-on').attr('text-anchor', 'middle').attr('x', cx)
    .attr('y', (d) => Math.min(y(d.result), y(0)) - 5).text((d) => signed(d.result));
  const label = (d) => md(d.week_start) + '〜';
  const lw = textWidth(svg, rows.map(label));
  const k = Math.max(1, Math.ceil((lw + 8) / Math.max(x.step(), 1)));
  svg.append('g').selectAll('text').data(rows.filter((d, i) => (rows.length - 1 - i) % k === 0)).join('text')
    .attr('class', 'fd-tick').attr('text-anchor', 'middle').attr('x', cx).attr('y', H - mb + 16).text(label);
  const tip = makeTip(box);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (d) => x(d.week_start)).attr('width', x.bandwidth()).attr('y', 0).attr('height', H - mb)
    .attr('fill', 'transparent')
    .on('pointermove', (event, d) => tip.show(event, [
      {date: true, text: weekLabel(d)},
      {text: '貯金へ ' + signed(d.result)},
      {text: 'この時点の貯金 ' + yen(d.saved_after)},
    ]))
    .on('pointerleave', () => tip.hide());
}

// 分類ごとの絵文字と色（色は順位が変わっても同じ分類なら同じ色）
const CAT_STYLE = {
  '肉': {icon: '🥩', color: 1},
  '魚': {icon: '🐟', color: 7},
  '野菜': {icon: '🥬', color: 2},
  '果物': {icon: '🍎', color: 2, tint: true},
  '米': {icon: '🍚', color: 0, tint: true},
  '麺': {icon: '🍜', color: 3, tint: true},
  'パン': {icon: '🍞', color: 3},
  '卵': {icon: '🥚', color: 4},
  '乳製品': {icon: '🥛', color: 4, tint: true},
  '調味料': {icon: '🧂', color: 0},
  '惣菜': {icon: '🍱', color: 5},
  'お菓子': {icon: '🍪', color: 6},
  '飲料': {icon: '🥤', color: 6, tint: true},
  'お酒': {icon: '🍺', color: 5, tint: true},
  'その他': {icon: '🛒', color: 'var(--fd-muted)'},
};
// 分類の色: 似た分類は同じ色の濃淡にする
function catColor(style) {
  if (typeof style.color === 'string') return style.color;
  const base = dash.colors[style.color % dash.colors.length];
  return style.tint ? 'color-mix(in srgb, ' + base + ' 50%, var(--color-panel))' : base;
}

function catRow(d, max, i) {
  const style = CAT_STYLE[d.category] || {icon: '🛍️', color: i};
  const row = el('div', 'fd-cat');
  const head = el('div', 'fd-row-head');
  const name = el('span', 'fd-cat-name');
  const icon = el('span', 'fd-cat-icon fd-pop', style.icon);
  icon.style.animationDelay = stagger(i, 90);
  name.append(icon, el('span', '', d.category));
  head.append(name, el('span', 'fd-row-val', yen(d.amount) + ' (' + pct(d.share) + ')'));
  const track = el('div', 'fd-row-track');
  const bar = el('div', 'fd-row-bar fd-grow-x');
  bar.style.animationDelay = stagger(i, 90);
  bar.style.width = (d.amount / max) * 100 + '%';
  bar.style.background = catColor(style);
  track.append(bar);
  row.append(head, track);
  return row;
}

function drawCat(box, rows) {
  box.replaceChildren();
  const max = d3.max(rows, (d) => d.amount) || 1, TOP = 5;
  rows.slice(0, TOP).forEach((d, i) => box.append(catRow(d, max, i)));
  if (rows.length > TOP) {
    const more = el('details', 'fd-more');
    more.append(el('summary', '', 'ほかの' + fmt(rows.length - TOP) + '分類を見る'));
    const body = el('div', 'fd-more-body');
    rows.slice(TOP).forEach((d, i) => body.append(catRow(d, max, TOP + i)));
    more.append(body);
    box.append(more);
  }
}

// レシート明細: 日付とレシートごとにまとめる。見出しを押すと、そのレシートの品目が開く
const openReceipts = new Set();
const whereVal = (v) => String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');

function drawItems(box, receipts, rows) {
  box.replaceChildren();
  if (!receipts.length) box.append(el('div', 'fd-rcpt-none', 'この週のレシートはありません'));
  for (const g of receipts) {
    const key = g.date + '|' + g.receipt_no;
    const det = el('details', 'fd-rcpt');
    det.open = openReceipts.has(key);
    det.addEventListener('toggle', () => { if (det.open) openReceipts.add(key); else openReceipts.delete(key); });
    const sum = el('summary');
    const total = el('span', 'fd-rcpt-total fd-n', yen(g.total));
    total.setAttribute('data-source', 'receipts');
    total.setAttribute('data-field', 'total');
    total.setAttribute('data-where', 'date=' + whereVal(g.date) + '&receipt_no=' + whereVal(g.receipt_no));
    sum.append(el('span', 'fd-rcpt-date', mdw(g.date) + (g.time ? ' ' + g.time : '')), el('span', 'fd-rcpt-store', g.store), total);
    const table = el('table', 'fd-table');
    table.setAttribute('data-source', 'receipt_items');
    table.setAttribute('data-row-key', 'id');
    const head = el('tr');
    for (const [field, label, right] of [['item', '品目'], ['category', '分類'], ['price', '税抜', true], ['amount', '税込', true]]) {
      const th = el('th', 'fd-th' + (right ? ' fd-r' : ''), label);
      th.setAttribute('data-field', field);
      head.append(th);
    }
    const thead = el('thead'), tbody = el('tbody');
    thead.append(head);
    const mine = rows.filter((r) => String(r.date).slice(0, 10) === g.date && String(r.receipt_no) === g.receipt_no)
      .sort((a, b) => catRank(a.category) - catRank(b.category) || String(a.item).localeCompare(String(b.item), 'ja') || String(a.id).localeCompare(String(b.id)));
    for (const r of mine) {
      const tr = el('tr');
      tr.dataset.key = r.id;
      tr.append(
        el('td', 'fd-td', r.item),
        el('td', 'fd-td', r.category),
        el('td', 'fd-td fd-r', yen(Number(r.price))),
        el('td', 'fd-td fd-r', yen(Number(r.amount))),
      );
      tbody.append(tr);
    }
    table.append(thead, tbody);
    det.append(sum, table);
    box.append(det);
  }
}

// レシート分析: 6つの枠。3と4は Daily で選んだ週に連動する
const pct0 = d3.format('.0%');
function marked(tag, cls, text, source, field, where) {
  const e = el(tag, cls, text);
  e.setAttribute('data-source', source);
  e.setAttribute('data-field', field);
  if (where) e.setAttribute('data-where', where);
  return e;
}
const noData = (box, text) => box.replaceChildren(el('div', 'fd-rcpt-none', text || 'まだデータが足りません'));
function meterIn(box, share, source) {
  const m = el('div', 'fd-meter'), b = el('div', 'fd-meter-bar');
  m.setAttribute('data-source', source);
  b.style.width = clamp01(share) * 100 + '%';
  m.append(b);
  box.append(m);
}

function drawWeekdays(box, rows) {
  box.replaceChildren();
  if (!rows.length) return;
  const W = Math.max(box.clientWidth, 240), H = 150, mt = 24, mb = 24, mr = 6;
  const svg = svgIn(box, W, H, '曜日ごとの1日あたりの平均');
  const top = d3.max(rows, (d) => d.avg);
  const y = d3.scaleLinear([0, Math.max(top, 1) * 1.15], [H - mb, mt]);
  const ticks = y.ticks(3);
  const ml = textWidth(svg, ticks.map(yen)) + 10;
  const x = d3.scaleBand(rows.map((d) => d.weekday_name), [ml, W - mr]).padding(0.28);
  const bw = Math.min(40, x.bandwidth());
  const cx = (d) => x(d.weekday_name) + x.bandwidth() / 2;
  yAxis(svg, y, ticks, ml, W - mr);
  svg.append('g').selectAll('rect').data(rows.filter((d) => d.avg > 0)).join('rect')
    .attr('x', (d) => cx(d) - bw / 2).attr('width', bw)
    .attr('y', (d) => y(d.avg)).attr('height', (d) => Math.max(0, y(0) - y(d.avg)))
    .attr('fill', (d) => (d.avg > BUDGET ? CRIT : ACCENT))
    .attr('opacity', (d) => (d.avg === top ? 1 : 0.55));
  svg.append('g').selectAll('text').data(rows.filter((d) => d.avg === top && top > 0).slice(0, 1)).join('text')
    .attr('class', 'fd-val').attr('text-anchor', 'middle').attr('x', cx).attr('y', (d) => y(d.avg) - 6).text((d) => yen(d.avg));
  svg.append('g').selectAll('text').data(rows).join('text')
    .attr('class', (d) => 'fd-tick' + (d.avg === top && top > 0 ? ' fd-tick-on' : '')).attr('text-anchor', 'middle')
    .attr('x', cx).attr('y', H - mb + 17).text((d) => d.weekday_name);
  const tip = makeTip(box);
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (d) => x(d.weekday_name)).attr('width', x.bandwidth()).attr('y', mt).attr('height', H - mb - mt)
    .attr('fill', 'transparent')
    .on('pointermove', (event, d) => tip.show(event, [
      {date: true, text: d.weekday_name + '曜日'},
      {text: '1日あたり ' + yen(d.avg)},
      {text: '合計 ' + yen(d.total) + '（' + fmt(d.days) + '日分）'},
    ]))
    .on('pointerleave', () => tip.hide());
}

function clearInsights() {
  for (const id of ['ins-price', 'ins-restock', 'ins-trips', 'ins-easy', 'ins-point', 'ins-flags', 'chart-weekday']) $(id).replaceChildren();
  $('ins-week-a').textContent = '';
  $('ins-week-b').textContent = '';
}

function drawInsights(today, weekEnd, prevWeekEnd, weekLabel) {
  const flags = $('ins-flags');
  flags.replaceChildren();

  // 1. 値上がり
  const ups = rowsOf(dash.data('price_changes')), upBox = $('ins-price');
  upBox.replaceChildren();
  if (!ups.length) noData(upBox, '値上がりなし');
  for (const r of ups.slice(0, 6)) {
    const where = 'item=' + whereVal(r.item), row = el('div', 'fd-ins-row'), val = el('span', 'fd-ins-val');
    val.append(
      marked('span', 'fd-n', yen(r.prev_price), 'price_changes', 'prev_price', where), ' → ',
      marked('span', 'fd-n', yen(r.last_price), 'price_changes', 'last_price', where), ' ',
      marked('span', 'fd-n fd-bad', signed(r.diff), 'price_changes', 'diff', where),
    );
    row.append(el('span', 'fd-ins-name', r.item), val);
    upBox.append(row);
  }
  if (ups.length) flags.append(el('span', 'fd-pill fd-pill-bad', '値上がりあり'));

  // 2. そろそろ買い足し: 目安の日を大きく過ぎた品（買わなくなった品）は出さない
  const stock = rowsOf(dash.data('restock')).filter((r) => r.next_date >= addDays(today, -r.avg_days)), stockBox = $('ins-restock');
  stockBox.replaceChildren();
  if (!stock.length) noData(stockBox);
  let due = false;
  for (const r of stock.slice(0, 6)) {
    const where = 'item=' + whereVal(r.item), row = el('div', 'fd-ins-row'), val = el('span', 'fd-ins-val');
    row.append(el('span', 'fd-ins-name', r.item));
    if (r.next_date <= today) { due = true; row.append(el('span', 'fd-pill fd-pill-warn', 'そろそろ')); }
    val.append(marked('span', 'fd-n', fmt(r.avg_days), 'restock', 'avg_days', where), '日おき 次は', marked('span', '', mdw(r.next_date), 'restock', 'next_date', where));
    row.append(val);
    stockBox.append(row);
  }
  if (due) flags.append(el('span', 'fd-pill fd-pill-warn', 'そろそろ買い足し'));

  // 3. 買い物の回数、4. 惣菜・お菓子の割合（選んだ週と、その前の週）
  const habits = rowsOf(dash.data('week_habits'));
  const cur = habits.find((w) => w.week_end === weekEnd), prev = prevWeekEnd ? habits.find((w) => w.week_end === prevWeekEnd) : null;
  $('ins-week-a').textContent = weekLabel;
  $('ins-week-b').textContent = weekLabel;
  const tripBox = $('ins-trips'), easyBox = $('ins-easy');
  tripBox.replaceChildren();
  easyBox.replaceChildren();
  if (!cur) { noData(tripBox, 'この週のレシートはありません'); noData(easyBox, 'この週のレシートはありません'); }
  else {
    const where = 'week_end=' + cur.week_end, big = el('div', 'fd-ins-big'), main = el('span'), side = el('span', 'fd-ins-side');
    main.append(marked('span', 'fd-n', fmt(cur.trips), 'week_habits', 'trips', where), '回');
    side.append('1回あたり ', marked('span', 'fd-n', yen(cur.per_trip), 'week_habits', 'per_trip', where));
    big.append(main, side);
    tripBox.append(big);
    const easyBig = el('div', 'fd-ins-big');
    easyBig.append(marked('span', 'fd-n', pct0(cur.easy_share), 'week_habits', 'easy_share', where));
    easyBox.append(easyBig);
    meterIn(easyBox, cur.easy_share, 'week_habits');
    if (prev) {
      const pw = 'week_end=' + prev.week_end, a = el('div', 'fd-sub'), b = el('div', 'fd-sub');
      a.append('前の週 ', marked('span', 'fd-n', fmt(prev.trips), 'week_habits', 'trips', pw), '回・1回あたり ', marked('span', 'fd-n', yen(prev.per_trip), 'week_habits', 'per_trip', pw));
      b.append('前の週 ', marked('span', 'fd-n', pct0(prev.easy_share), 'week_habits', 'easy_share', pw));
      tripBox.append(a);
      easyBox.append(b);
    }
  }

  // 5. ポイントデー活用（今月）
  const month = today.slice(0, 7), use = rowsOf(dash.data('point_use')).find((m) => m.month === month), pointBox = $('ins-point');
  pointBox.replaceChildren();
  if (!use || !(use.spent > 0)) noData(pointBox, use ? '' : '今月のポイントデーは未登録です');
  else {
    const where = 'month=' + month, big = el('div', 'fd-ins-big'), sub = el('div', 'fd-sub');
    big.append(marked('span', 'fd-n', pct0(use.share), 'point_use', 'share', where));
    pointBox.append(big);
    meterIn(pointBox, use.share, 'point_use');
    sub.append(marked('span', 'fd-n', yen(use.spent), 'point_use', 'spent', where), ' のうち ', marked('span', 'fd-n', yen(use.point_spent), 'point_use', 'point_spent', where));
    pointBox.append(sub);
  }

  // 6. 曜日ごとの平均: 2週間分たまってから出す
  const days = rowsOf(dash.data('by_weekday')), dayBox = $('chart-weekday');
  if (days.length && days[0].span_days >= 14) drawWeekdays(dayBox, days);
  else noData(dayBox);
}

// 価格の推移: 品目を押すと、その下に開く。丸は買った価格、四角はチラシの価格
let openPrice = null;
const FLYER_COLOR = 'var(--color-warn)';

function drawPriceChart(box, pts) {
  box.replaceChildren();
  if (!pts || !pts.length) return;
  const W = Math.max(box.clientWidth, 240), H = 132, mt = 22, mb = 22, mr = 14;
  const svg = svgIn(box, W, H, '価格の推移');
  const t = (s) => toDate(s).getTime();
  const lo = d3.min(pts, (d) => d.price), hi = d3.max(pts, (d) => d.price), pad = Math.max((hi - lo) * 0.25, hi * 0.08, 1);
  const y = d3.scaleLinear([Math.max(0, lo - pad), hi + pad], [H - mb, mt]);
  const ticks = y.ticks(3);
  const ml = textWidth(svg, ticks.map(yen)) + 10;
  let t0 = d3.min(pts, (d) => t(d.date)), t1 = d3.max(pts, (d) => t(d.date));
  if (t1 - t0 < 6 * DAY_MS) { const mid = (t0 + t1) / 2; t0 = mid - 3 * DAY_MS; t1 = mid + 3 * DAY_MS; }
  const x = d3.scaleLinear([t0, t1], [ml + 12, W - mr - 6]);
  yAxis(svg, y, ticks, ml, W - mr);
  for (const src of ['flyer', 'buy']) {
    const own = pts.filter((d) => d.source === src);
    if (own.length > 1) svg.append('path').attr('d', d3.line().x((d) => x(t(d.date))).y((d) => y(d.price))(own))
      .attr('fill', 'none').attr('stroke', src === 'buy' ? ACCENT : FLYER_COLOR).attr('stroke-width', 1.5).attr('opacity', 0.55);
  }
  svg.append('g').selectAll('rect').data(pts.filter((d) => d.source === 'flyer')).join('rect')
    .attr('x', (d) => x(t(d.date)) - 4.5).attr('y', (d) => y(d.price) - 4.5).attr('width', 9).attr('height', 9).attr('fill', FLYER_COLOR);
  svg.append('g').selectAll('circle').data(pts.filter((d) => d.source === 'buy')).join('circle')
    .attr('cx', (d) => x(t(d.date))).attr('cy', (d) => y(d.price)).attr('r', 5).attr('fill', ACCENT).attr('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
  const best = pts.reduce((m, d) => (d.price < m.price ? d : m), pts[0]);
  svg.append('text').attr('class', 'fd-val').attr('text-anchor', 'middle')
    .attr('x', Math.max(ml + 22, Math.min(W - mr - 20, x(t(best.date))))).attr('y', y(best.price) - 9).text(yen(best.price));
  const ends = [...new Set([d3.min(pts, (d) => d.date), d3.max(pts, (d) => d.date)])];
  svg.append('g').selectAll('text').data(ends).join('text')
    .attr('class', 'fd-tick').attr('text-anchor', (d, i) => (ends.length === 1 ? 'middle' : (i === 0 ? 'start' : 'end')))
    .attr('x', (d, i) => (ends.length === 1 ? x(t(d)) : (i === 0 ? ml + 4 : W - mr))).attr('y', H - mb + 16).text(md);
  const tip = makeTip(box);
  svg.append('g').selectAll('circle').data(pts).join('circle')
    .attr('cx', (d) => x(t(d.date))).attr('cy', (d) => y(d.price)).attr('r', 14).attr('fill', 'transparent')
    .on('pointermove', (event, d) => tip.show(event, [
      {date: true, text: d.date_to > d.date ? md(d.date) + '〜' + mdw(d.date_to) : mdw(d.date)},
      {text: (d.source === 'buy' ? '買った ' : 'チラシ ') + yen(d.price) + (d.unit ? '（' + d.unit + '）' : '')},
    ]))
    .on('pointerleave', () => tip.hide());
  const key = el('div', 'fd-pchart-key');
  for (const [src, label] of [['buy', '買った'], ['flyer', 'チラシ']]) {
    if (!pts.some((d) => d.source === src)) continue;
    const item = el('span'), sw = el('span', src === 'buy' ? 'fd-sw' : 'fd-sq');
    sw.style.background = src === 'buy' ? ACCENT : FLYER_COLOR;
    item.append(sw, label);
    key.append(item);
  }
  box.append(key);
}

// 行を押すと、その行のすぐ下に推移グラフを開く（もう一度押すと閉じる）
function addPriceRow(list, row, openKey, pts) {
  row.classList.add('fd-tap');
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  const open = () => {
    const c = el('div', 'fd-pchart');
    c.setAttribute('data-source', 'price_points');
    row.after(c);
    drawPriceChart(c, pts);
  };
  const toggle = () => {
    for (const c of root.querySelectorAll('.fd-pchart')) c.remove();
    if (openPrice === openKey) { openPrice = null; return; }
    openPrice = openKey;
    open();
  };
  row.addEventListener('click', toggle);
  row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  list.append(row);
  if (openPrice === openKey) open();
}

const catRank = (c) => { const i = Object.keys(CAT_STYLE).indexOf(c); return i < 0 ? 99 : i; };
const catIcon = (c) => (CAT_STYLE[c] || {icon: '🛍️'}).icon;

// チラシ: 分類ごとにまとめる。上のボタンで分類を絞れる。買ったことのある品を先に、あとは品名順
let flyerCat = 'all', flyerSort = 'name', flyerDay = null;
function drawFlyer(box, flagBox, rows, today, pointsBy) {
  const keep = box.scrollTop, chips = $('flyer-cats');
  box.replaceChildren();
  flagBox.replaceChildren();
  chips.replaceChildren();
  for (const b of root.querySelectorAll('#flyer-sort .fd-seg-btn')) b.classList.toggle('fd-seg-on', b.dataset.sort === flyerSort);
  const live0 = rows.filter((r) => r.valid_to >= today);
  // 日付ボタン: 今日から、チラシの品が出ている日だけを並べる。押した日に買える品だけに絞る
  const dayBox = $('flyer-days');
  dayBox.replaceChildren();
  const days = [];
  if (live0.length) {
    const last = d3.max(live0, (r) => r.valid_to);
    for (let d = today; d <= last && days.length < 7; d = addDays(d, 1)) if (live0.some((r) => r.valid_from <= d && d <= r.valid_to)) days.push(d);
  }
  if (flyerDay && flyerDay !== 'all' && !days.includes(flyerDay)) flyerDay = null;
  if (!flyerDay) flyerDay = days.includes(today) ? today : 'all';
  if (days.length > 1 || (days.length === 1 && days[0] !== today)) {
    for (const d of ['all', ...days]) {
      const label = d === 'all' ? 'すべて' : d === today ? '今日' : d === addDays(today, 1) ? '明日 ' + mdw(d) : mdw(d);
      const b = el('button', 'fd-seg-btn' + (d === flyerDay ? ' fd-seg-on' : ''), label);
      b.type = 'button';
      b.addEventListener('click', () => { flyerDay = d; openPrice = null; box.scrollTop = 0; render(); });
      dayBox.append(b);
    }
  }
  const live = flyerDay === 'all' ? live0 : live0.filter((r) => r.valid_from <= flyerDay && flyerDay <= r.valid_to);
  if (!live.length) { box.append(el('div', 'fd-rcpt-none', 'いま出ているチラシはありません')); return; }
  const groups = d3.groups(live, (r) => r.category).sort((a, b) => catRank(a[0]) - catRank(b[0]) || a[0].localeCompare(b[0], 'ja'));
  if (flyerCat !== 'all' && !groups.some((g) => g[0] === flyerCat)) flyerCat = 'all';
  for (const [value, label] of [['all', 'すべて'], ...groups.map((g) => [g[0], catIcon(g[0]) + ' ' + g[0]])]) {
    const b = el('button', 'fd-seg-btn' + (value === flyerCat ? ' fd-seg-on' : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => { flyerCat = value; openPrice = null; box.scrollTop = 0; render(); });
    chips.append(b);
  }
  const when = (r) => (r.valid_from > today
    ? (r.valid_to > r.valid_from ? md(r.valid_from) + '〜' + mdw(r.valid_to) : mdw(r.valid_from) + '限り')
    : (r.valid_to === today ? '今日まで' : mdw(r.valid_to) + 'まで'));
  for (const [category, items] of groups) {
    if (flyerCat !== 'all' && category !== flyerCat) continue;
    box.append(el('div', 'fd-fly-h', catIcon(category) + ' ' + category));
    if (flyerSort === 'price') items.sort((a, b) => a.price - b.price || a.item.localeCompare(b.item, 'ja'));
    else items.sort((a, b) => (a.bought ? 0 : 1) - (b.bought ? 0 : 1) || a.item.localeCompare(b.item, 'ja') || a.valid_from.localeCompare(b.valid_from));
    for (const r of items) {
      const where = 'id=' + whereVal(r.id), row = el('div', 'fd-fly-row'), main = el('div', 'fd-fly-main'), price = el('div', 'fd-fly-price');
      const name = el('div', 'fd-fly-name', r.item);
      if (r.good) name.append(' ', el('span', 'fd-pill', '買い時'));
      const sub = el('div', 'fd-fly-sub');
      sub.append(el('span', 'fd-fly-when' + (r.valid_from <= today && r.valid_to === today ? ' fd-fly-today' : ''), when(r)));
      const rest = [r.unit, r.note].filter(Boolean).join('・');
      if (rest) sub.append('・' + rest);
      main.append(name, sub);
      price.append(marked('span', 'fd-n', yen(r.price), 'flyer_deals', 'price', where));
      if (r.min_price != null) {
        const low = el('div', 'fd-fly-sub');
        low.append('底値 ', marked('span', '', yen(r.min_price), 'flyer_deals', 'min_price', where));
        price.append(low);
      }
      row.append(main, price);
      addPriceRow(box, row, 'flyer|' + r.id, pointsBy.get(r.key));
    }
  }
  if (live0.some((r) => r.good && r.valid_from <= today)) flagBox.append(el('span', 'fd-pill', '買い時あり'));
  box.scrollTop = keep;
}

function drawBuy(box, rows, today) {
  box.replaceChildren();
  for (const r of rows) {
    const row = el('div', 'fd-wday' + (r.date === today ? ' fd-wday-on' : (r.date < today ? ' fd-wday-past' : '')));
    row.append(el('span', 'fd-wday-date', wd(r.date) + ' ' + md(r.date)));
    if (r.points) row.append(el('span', 'fd-pill' + (r.multiplier >= 5 && !r.limited ? ' fd-pill-strong' : '') + (r.points === '未登録' ? ' fd-pill-muted' : ''), r.points));
    // ポイント倍率のタグがある日は、ポイント系の企画名を重ねて出さない
    if (r.weekly && !(r.multiplier > 0 && r.weekly.includes('ポイント')) && !r.points.includes(r.weekly)) row.append(el('span', 'fd-wday-ev', r.weekly));
    box.append(row);
  }
}

// 表示している週（null は今週）。Daily の矢印か、Weekly の棒を押して切り替える
let viewWeekEnd = null, navList = [], navIndex = 0;
// Weekly に並べる6週の右端（null は今週）。矢印でさかのぼる
let weekWinEnd = null, winEndIdx = 0;

function pickWeek(idx) {
  const last = navList.length - 1;
  if (idx < 0 || idx > last) return;
  viewWeekEnd = idx === last ? null : navList[idx];
  if (idx > winEndIdx) weekWinEnd = idx === last ? null : idx;
  else if (idx < winEndIdx - 5) weekWinEnd = idx + 5;
  render();
}

function render() {
  const items = dash.data('receipt_items'), pointDays = dash.data('point_days'), weeklyEvents = dash.data('weekly_events');
  const ledger = dash.data('ledger'), weeks = dash.data('weeks'), motivation = dash.data('motivation');
  const cat = dash.data('by_category'), buy = dash.data('buy_days');
  const today = todayStr();

  // 食費（レシート）
  const st = items.status, ok = st === 'ok';
  skelMain.forEach((e) => e.classList.toggle('dash-skeleton', st === 'loading'));
  const all = ok ? rowsOf(ledger) : [];
  let upto = all.filter((d) => d.date <= today);
  if (!upto.length && all.length) upto = [all[0]];
  const cur = upto.length ? upto[upto.length - 1] : null;
  const mot = cur && ok ? rowsOf(motivation).find((m) => m.date === cur.date) || null : null;

  if (cur) {
    const isToday = cur.date === today;
    const when = isToday ? '今日' : mdw(cur.date);
    $('v-date').textContent = jpDate(cur.date) + (isToday ? '' : ' 時点');
    clockOn = isToday;
    tick();
    let msg;
    if (cur.week_left < 0) {
      msg = '今週は枠を' + yen(-cur.week_left) + '超えました。';
      if (mot) msg += '来週、1日2,500円で過ごせば' + fmt(mot.recover_days_2500) + '日で取り戻せます。';
    } else if (cur.today_left < 0) {
      msg = when + 'は3,000円を' + yen(-cur.today_left) + '超えましたが、今週の枠内なので大丈夫です。';
      msg += cur.week_days_after > 0
        ? '残り' + fmt(cur.week_days_after) + '日は、1日あたり' + yen(cur.rest_per_day) + 'が目安です。'
        : '今週は枠内で終われます。';
    } else if (cur.week_days_after === 0 && cur.week_left > 0) {
      msg = 'いい調子です。今週は枠内で終われそうです。';
    } else if (cur.spent === 0) {
      msg = when + 'はまだ買い物の記録がありません。';
    } else {
      msg = 'いい調子です。' + (cur.week_days_after > 0 ? '残り' + fmt(cur.week_days_after) + '日は、1日あたり' + yen(cur.rest_per_day) + 'が目安です。' : '');
    }
    put('takeaway', msg);
    put('v-today-left', yen(cur.today_left), cur.today_left < 0 ? 'fd-bad' : null, cur.date);
    put('v-today-spent', yen(cur.spent), null, cur.date);
    meter('today-bar', cur.spent / BUDGET, cur.spent > BUDGET);
    statusChip('chip-today', cur.today_left < 0, '予算内');
    put('v-week-left', yen(cur.week_left), cur.week_left < 0 ? 'fd-bad' : null, cur.date);
    put('v-week-budget', yen(cur.week_budget), null, cur.date);
    put('v-week-spent', yen(cur.week_spent), null, cur.date);
    meter('week-bar', cur.week_spent / cur.week_budget, cur.week_spent > cur.week_budget);
    statusChip('chip-week', cur.week_left < 0, '枠内');
    put('v-month-left', yen(cur.month_left), cur.month_left < 0 ? 'fd-bad' : null, cur.date);
    put('v-month-budget', yen(cur.month_budget), null, cur.date);
    put('v-month-spent', yen(cur.month_spent), null, cur.date);
    meter('month-bar', cur.month_spent / cur.month_budget, cur.month_spent > cur.month_budget);
    statusChip('chip-month', cur.month_left < 0, '');
    const showMonthRest = cur.month_days_after > 0 && cur.month_left >= 0;
    $('month-rest').hidden = !showMonthRest;
    put('v-month-days-after', showMonthRest ? fmt(cur.month_days_after) : '—', null, cur.date);
    put('v-month-rest', showMonthRest ? yen(cur.month_rest_per_day) : '—', null, cur.date);
    put('v-avg', yen(cur.avg_per_day), cur.avg_per_day <= BUDGET ? null : 'fd-bad', cur.date);
    put('v-days', fmt(cur.day_no), null, cur.date);
    put('v-total', yen(cur.cum_spent), null, cur.date);
    put('goal-bank', cur.week_left < 0
      ? '今週は枠を超えているため、日曜の夜に貯金から差し引きます。'
      : (cur.week_days_after === 0
        ? when + 'が終わると、今週の残り ' + yen(cur.week_left) + ' が貯金に入ります。'
        : '今週の残りは、日曜の夜に貯金に入ります。'));
  } else {
    $('v-date').textContent = '';
    clockOn = false;
    tick();
    chip('chip-today', '', false);
    chip('chip-week', '', false);
    chip('chip-month', '', false);
    $('month-rest').hidden = true;
    meter('month-bar', 0, false);
    meter('today-bar', 0, false);
    meter('week-bar', 0, false);
    for (const id of ['takeaway', 'v-today-left', 'v-today-spent', 'v-week-left', 'v-week-budget', 'v-week-spent', 'v-month-left', 'v-month-budget', 'v-month-spent', 'v-month-days-after', 'v-month-rest', 'v-avg', 'v-days', 'v-total', 'goal-bank']) put(id, '—');
  }

  if (mot) {
    const reached = mot.goal_left === 0;
    put('v-saved', yen(mot.saved), mot.saved < 0 ? 'fd-bad' : null, mot.date);
    put('v-pct', pct(mot.goal_progress), null, mot.date);
    put('v-ms', yen(mot.next_milestone), null, mot.date);
    put('v-ms-left', yen(mot.to_milestone), null, mot.date);
    put('v-days-left', fmt(mot.days_left), null, mot.date);
    put('v-streak', fmt(mot.streak_days), null, mot.date);
    put('v-best', fmt(mot.best_streak_days), null, mot.date);
    $('chip-ms').hidden = reached;
    const fc = $('chip-forecast');
    fc.hidden = reached || !mot.forecast_date;
    if (mot.forecast_date) {
      const f = toDate(mot.forecast_date);
      fc.textContent = 'このペースなら ' + f.getUTCFullYear() + '年' + (f.getUTCMonth() + 1) + '月ごろ達成';
      fc.setAttribute('data-where', 'date=' + mot.date);
    }
    $('goal-done').hidden = !reached;
    $('goal-bank').hidden = reached;
  } else {
    for (const id of ['v-saved', 'v-pct', 'v-ms', 'v-ms-left', 'v-days-left', 'v-streak', 'v-best']) put(id, '—');
    $('chip-ms').hidden = false;
    $('chip-forecast').hidden = true;
    $('goal-done').hidden = true;
    $('goal-bank').hidden = false;
  }

  const boxes = [$('chart-days'), $('chart-weeks'), $('chart-cat'), $('road')];
  if (ok && cur) {
    const byDate = {};
    for (const d of all) byDate[d.date] = d;
    const allWeeks = rowsOf(weeks);
    const done = allWeeks.filter((w) => w.week_end < cur.date);
    const known = done.map((w) => ({...w, state: 'done'}));
    known.push({week_start: cur.week_start, week_end: cur.week_end, budget: cur.week_budget, spent: cur.week_spent, result: cur.week_left, state: 'current'});
    let sel = viewWeekEnd ? known.findIndex((w) => w.week_end === viewWeekEnd) : known.length - 1;
    if (sel < 0) { sel = known.length - 1; viewWeekEnd = null; }
    const view = known[sel], isCurrent = view.state === 'current';
    navList = known.map((w) => w.week_end);
    navIndex = sel;
    const slots = [];
    for (let i = 6; i >= 0; i--) {
      const date = addDays(view.week_end, -i), row = byDate[date];
      const state = !row ? 'before' : (date === cur.date ? 'today' : (date < cur.date ? 'past' : 'future'));
      slots.push({date, state, spent: row && state !== 'future' ? row.spent : 0, today_left: row ? row.today_left : 0});
    }
    drawDays(boxes[0], slots, isCurrent);
    $('week-prev').disabled = sel === 0;
    $('week-next').disabled = sel === known.length - 1;
    $('week-label').textContent = isCurrent ? '今週' : md(view.week_start) + '〜' + md(view.week_end);
    const sumEl = $('week-summary');
    sumEl.hidden = isCurrent;
    sumEl.textContent = isCurrent ? '' : '合計 ' + yen(view.spent) + ' / 枠 ' + yen(view.budget) + '。' + (view.result >= 0 ? '貯金へ ' + signed(view.result) : '貯金から ' + yen(view.result));
    const lastIdx = known.length - 1;
    winEndIdx = weekWinEnd == null ? lastIdx : Math.max(Math.min(5, lastIdx), Math.min(weekWinEnd, lastIdx));
    const first = Math.max(0, winEndIdx - 5);
    const weekRows = known.slice(first, winEndIdx + 1).map((w, i) => ({...w, idx: first + i, selected: first + i === sel}));
    while (weekRows.length < 6) weekRows.unshift({empty: true, week_start: 'empty-' + weekRows.length, spent: 0, budget: 0});
    drawWeeks(boxes[1], weekRows, (w) => pickWeek(w.idx));
    $('weeks-prev').disabled = first === 0;
    $('weeks-next').disabled = winEndIdx === lastIdx;
    $('weeks-label').textContent = winEndIdx === lastIdx ? '今週まで' : md(known[first].week_start) + '〜' + md(known[winEndIdx].week_end);
    drawCat(boxes[2], rowsOf(cat));
    drawRoad(boxes[3], mot);
    $('saved-weeks-wrap').hidden = !done.length;
    drawSavedWeeks($('chart-saved-weeks'), done.slice(-12));
    $('items-week').textContent = isCurrent ? '今週' : md(view.week_start) + '〜' + md(view.week_end);
    drawItems($('receipts'), rowsOf(dash.data('receipts')).filter((g) => g.date >= view.week_start && g.date <= view.week_end), items.data);
    drawInsights(today, view.week_end, sel > 0 ? known[sel - 1].week_end : null, $('items-week').textContent);
  } else {
    $('receipts').replaceChildren();
    clearInsights();
    $('items-week').textContent = '';
    $('week-prev').disabled = true;
    $('week-next').disabled = true;
    $('week-label').textContent = '';
    $('week-summary').hidden = true;
    $('weeks-prev').disabled = true;
    $('weeks-next').disabled = true;
    $('weeks-label').textContent = '';
    $('saved-weeks-wrap').hidden = true;
    $('chart-saved-weeks').replaceChildren();
    for (const box of boxes) {
      if (st === 'error') fail(box);
      else box.replaceChildren();
    }
  }

  if (ok && cur && !played) {
    played = true;
    countUp('v-today-left', cur.today_left, yen);
    countUp('v-week-left', cur.week_left, yen);
    countUp('v-month-left', cur.month_left, yen);
    if (mot) countUp('v-saved', mot.saved, yen);
    setTimeout(() => root.classList.remove('fd-anim'), 2600);
  }

  // お買い得日（ポイントデーと曜日の企画）
  const buyLoading = pointDays.status === 'loading' || weeklyEvents.status === 'loading';
  const buyOk = pointDays.status === 'ok' && weeklyEvents.status === 'ok';
  skelBuy.forEach((e) => e.classList.toggle('dash-skeleton', buyLoading));
  const ahead = buyOk ? rowsOf(buy).filter((d) => d.date >= today) : [];
  const monday = addDays(today, -((toDate(today).getUTCDay() + 6) % 7));
  const buyRows = buyOk ? rowsOf(buy) : [];
  const thisWeek = buyRows.filter((d) => d.date >= monday && d.date <= addDays(monday, 6));
  const nextWeek = buyRows.filter((d) => d.date >= addDays(monday, 7) && d.date <= addDays(monday, 13));
  const pointsBy = d3.group(rowsOf(dash.data('price_points')), (p) => p.item);
  drawFlyer($('flyer-list'), $('flyer-flags'), rowsOf(dash.data('flyer_deals')), today, pointsBy);
  drawBuy($('buy-days'), thisWeek, today);
  drawBuy($('buy-next-week'), nextWeek, today);
  $('buy-more').hidden = !nextWeek.length;
  $('buy-more-label').textContent = nextWeek.length ? '来週（' + md(nextWeek[0].date) + '〜' + md(nextWeek[nextWeek.length - 1].date) + '）も見る' : '来週も見る';
  const todayRow = ahead.length && ahead[0].date === today ? ahead[0] : null;
  const todayBits = todayRow ? [todayRow.points === '未登録' ? '' : todayRow.points, (todayRow.multiplier > 0 && todayRow.weekly.includes('ポイント')) || todayRow.points.includes(todayRow.weekly) ? '' : todayRow.weekly].filter(Boolean) : [];
  const todayChip = $('today-chip');
  todayChip.hidden = !todayBits.length;
  todayChip.textContent = todayBits.join('・');
  if (todayRow) todayChip.setAttribute('data-where', 'date=' + todayRow.date);
  if (!buyOk) {
    put('buy-next', '—');
  } else if (!ahead.length) {
    put('buy-next', 'ポイントデーの登録が切れています。新しい月のレシートかポイントカレンダーを送ると更新できます');
  } else {
    const next5 = ahead.find((d) => d.multiplier >= 5 && !d.limited);
    if (next5) {
      const n = daysBetween(today, next5.date);
      put('buy-next', '次のポイント5倍は ' + mdw(next5.date) + '（' + (n === 0 ? '今日' : n + '日後') + '）');
    } else {
      put('buy-next', '次のポイント5倍は未登録。新しい月のレシートを送ると更新できます');
    }
  }
}

$('week-prev').addEventListener('click', () => pickWeek(navIndex - 1));
$('week-next').addEventListener('click', () => pickWeek(navIndex + 1));
$('weeks-prev').addEventListener('click', () => {
  if (winEndIdx - 5 > 0) { weekWinEnd = winEndIdx - 1; render(); }
});
$('weeks-next').addEventListener('click', () => {
  const last = navList.length - 1;
  if (winEndIdx < last) { weekWinEnd = winEndIdx + 1 >= last ? null : winEndIdx + 1; render(); }
});
// 折りたたみを開いたときに、実際の幅で道のりを描き直す
$('tile-goal').addEventListener('toggle', render);
$('card-flyer').addEventListener('toggle', render);
for (const b of root.querySelectorAll('#flyer-sort .fd-seg-btn')) b.addEventListener('click', () => { flyerSort = b.dataset.sort; openPrice = null; $('flyer-list').scrollTop = 0; render(); });
$('card-insights').addEventListener('toggle', render);

dash.onData(render);
setInterval(tick, 15000);
