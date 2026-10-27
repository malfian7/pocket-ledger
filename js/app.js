/* Pocket Ledger: runs entirely in the browser, data in localStorage */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const LEGACY_KEY = "pocket-ledger-v1";
const LOCAL_SESSION_KEY = "pocket-ledger-session";
const LAST_USER_KEY = "pocket-ledger-last-user";
const ACCOUNTS = {
  wife:       { name:"Wife",        role:"adult",      desc:"Everything, with her own budget" },
  husband:    { name:"Husband",     role:"adult",      desc:"Everything, with his own budget" },
  child:      { name:"Child",       role:"child",      desc:"Dashboard, income & savings" },
  superadmin: { name:"Super Admin", role:"superadmin", desc:"Sees every account" }
};
const INITIALS = { wife:"W", husband:"H", child:"C", superadmin:"SA" };
const ROLE_VIEWS = { adult:["dashboard","expenses","daily","income","savings","reports","setup"], child:["dashboard","income","savings"] };
let MODE = "local";   // "cloud" when served with the Vercel API
let session = null;   // { id, name, role }
const storeKeyFor = id => "pocket-ledger-v2:" + id;
const storeKey = () => storeKeyFor(session ? session.id : "guest");
const DEFAULT_SOURCES = ["Online Shop","Supermarket","Minimarket","Traditional Market","Restaurant / Café","Food Delivery","Transport","Bills & Utilities","Health & Pharmacy","Other"];
const STORES = ["Tokopedia","Shopee","Lazada","TikTok Shop","Blibli","Zalora","Indomaret","Alfamart","Superindo","Hypermart","Lotte Mart","GoFood","GrabFood","ShopeeFood","Gojek","Grab","PLN Mobile","Telkomsel","Guardian","Kimia Farma"];
const CURRENCIES = {
  IDR:{locale:"id-ID",dec:0,sym:"Rp"}, USD:{locale:"en-US",dec:2,sym:"$"}, SGD:{locale:"en-SG",dec:2,sym:"S$"},
  MYR:{locale:"ms-MY",dec:2,sym:"RM"}, EUR:{locale:"de-DE",dec:2,sym:"€"}
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const CARE_AT = 0.8;
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- market snapshot (collected 27 Oct 2026 from official sources) ---------- */
const MARKET = {
  asOf: "27 October 2026",
  gold: { buy:2550000, buyback:2345000, brankas:2492120, silver:36750, updated:"Tue, 27 Oct 2026, 08:33 WIB", src:"https://www.logammulia.com/id/harga-emas-hari-ini" },
  bi:   { rate:5.75, date:"21 October 2026", src:"https://www.bi.go.id/id/statistik/indikator/bi-rate.aspx" },
  lps:  { idr:3.75, bpr:6.25, fx:2.00, period:"1 Oct 2026 – 31 Jan 2027", src:"https://lps.go.id/" },
  sbn:  [
    { series:"SBR015T2", kind:"Savings bond (SBR)", tenor:"2 years", rate:6.75, offered:"28 Sep – 22 Oct 2026" },
    { series:"SBR015T4", kind:"Savings bond (SBR)", tenor:"4 years", rate:6.85, offered:"28 Sep – 22 Oct 2026" },
    { series:"SR025T3",  kind:"Retail sukuk (SR), fixed", tenor:"3 years", rate:6.80, offered:"21 Aug – 16 Sep 2026" },
    { series:"SR025T5",  kind:"Retail sukuk (SR), fixed", tenor:"5 years", rate:6.90, offered:"21 Aug – 16 Sep 2026" }
  ],
  sbnSrc: "https://djppr.kemenkeu.go.id/",
  fx: { date:"27 October 2026", src:"https://www.bi.go.id/id/statistik/informasi-kurs/transaksi-bi/default.aspx",
    rates:[ // code, name, unit, BI sell, BI buy
      ["USD","US dollar",1,18206.58,18025.42], ["SGD","Singapore dollar",1,14231.67,14088.96], ["EUR","Euro",1,20402.29,20195.68],
      ["JPY","Japanese yen",100,11587.69,11469.47], ["SAR","Saudi riyal",1,4851.34,4802.30], ["AUD","Australian dollar",1,12793.76,12662.86],
      ["GBP","British pound",1,24323.99,24076.55], ["CNY","Chinese yuan",1,2730.44,2702.99], ["MYR","Malaysian ringgit",1,4458.03,4409.35],
      ["HKD","Hong Kong dollar",1,2320.91,2297.72], ["CHF","Swiss franc",1,22071.26,21846.35], ["KRW","Korean won",1,13.76,13.62]
    ]},
  ihsg: { value:5353.409, prev:5373.094, pct:-0.37, lq45:541.632, time:"27 Oct 2026, 11:59 WIB (morning session)", src:"https://www.idx.co.id/id" }
};
const FX = {}; MARKET.fx.rates.forEach(r=>FX[r[0]]={code:r[0],name:r[1],unit:r[2],sell:r[3]/r[2],buy:r[4]/r[2],mid:(r[3]+r[4])/2/r[2]});
const ICONS = {
  bank:'<svg class="ico" viewBox="0 0 24 24"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/></svg>',
  gold:'<svg class="ico" viewBox="0 0 24 24"><path d="M3 18l3-7h6l3 7zM9 11l2-5h6l3 7h-5"/></svg>',
  sbn:'<svg class="ico" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  mmf:'<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5c0-1 1-1.6 2.5-1.6s2.5.7 2.5 1.7-1 1.4-2.5 1.6-2.5.6-2.5 1.7 1 1.7 2.5 1.7 2.5-.6 2.5-1.6"/></svg>',
  fx:'<svg class="ico" viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  stock:'<svg class="ico" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>'
};
const INSTRUMENTS = [
  { key:"bank", name:"Bank savings & deposits", tag:"For your emergency fund", risk:["low","Very low risk"], access:"Anytime / at maturity", min:"From Rp 0",
    why:["Money is there the moment you need it","Guaranteed by LPS up to Rp 2 billion per bank when the interest rate is at or below the LPS rate","Keep 3–6 months of expenses here before investing elsewhere"],
    live:()=>`LPS guarantee rate <b>${MARKET.lps.idr}%</b> · BI Rate <b>${MARKET.bi.rate}%</b>` },
  { key:"gold", name:"Gold (Antam)", tag:"Long-term store of value", risk:["mid","Price moves daily"], access:"Sell back on business days", min:"From 0.5 g",
    why:["Tends to hold its value when prices rise and the rupiah weakens","The buy-back price is about 8% below the buying price, so plan to hold for years","Good for goals 3+ years away"],
    live:()=>`Buy <b>${idr(MARKET.gold.buy)}</b>/g · buy-back <b>${idr(MARKET.gold.buyback)}</b>/g` },
  { key:"sbn", name:"Government bonds (SBN Ritel)", tag:"Steady monthly income", risk:["low","Backed by the state"], access:"Depends on the series", min:"From Rp 1 million",
    why:["Principal and coupons are guaranteed by law","Recent coupons are well above the LPS deposit rate","Coupons are paid monthly and taxed at 10%, half the 20% on deposit interest"],
    live:()=>`Latest coupons <b>${MARKET.sbn[0].rate.toFixed(2)}% – ${MARKET.sbn[3].rate.toFixed(2)}%</b> a year` },
  { key:"mmf", name:"Money market funds", tag:"Small amounts, easy to withdraw", risk:["low","Low risk"], access:"Cash in 1–2 business days", min:"From about Rp 10,000",
    why:["Invests in deposits and short-term bonds, managed by professionals","Returns usually move with deposit rates and the BI Rate","Gains aren't taxed for you as an investor; pick a fund registered with OJK"],
    live:()=>`Reference: BI Rate <b>${MARKET.bi.rate}%</b>, LPS rate <b>${MARKET.lps.idr}%</b>` },
  { key:"fx", name:"Foreign currency", tag:"For costs paid abroad", risk:["mid","Rate swings"], access:"Exchange anytime", min:"Varies by bank",
    why:["Set money aside for study, travel, Hajj or Umrah in the currency you'll spend","Protects that money if the rupiah weakens","Exchange spreads cost you; LPS guarantees foreign currency deposits only up to 2% interest"],
    live:()=>`1 USD = <b>${idr(FX.USD.mid)}</b> · 1 SGD = <b>${idr(FX.SGD.mid)}</b>` },
  { key:"stock", name:"Stocks", tag:"Information only", risk:["high","High risk"], access:"Sell on trading days", min:"1 lot = 100 shares",
    why:["Highest long-term growth potential, with big ups and downs","Only use money you won't need for 5+ years","Buy through an OJK-licensed broker and spread across many companies"],
    live:()=>`IHSG <b>${MARKET.ihsg.value.toLocaleString("id-ID",{maximumFractionDigits:2})}</b> (${MARKET.ihsg.pct}%)` }
];
const INST = {}; INSTRUMENTS.forEach(i=>INST[i.key]=i);

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2,"0");
const todayISO = () => { const d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
const ymOf = d => d.getFullYear()+"-"+pad(d.getMonth()+1);
const currentYM = () => ymOf(new Date());
function shiftMonth(ym, n){ const [y,m]=ym.split("-").map(Number); return ymOf(new Date(y, m-1+n, 1)); }
function daysIn(ym){ const [y,m]=ym.split("-").map(Number); return new Date(y, m, 0).getDate(); }
function monthName(ym){ const [y,m]=ym.split("-").map(Number); return MONTHS[m-1]+" "+y; }
function shortMonth(ym){ const m=+ym.split("-")[1]; return MONTHS[m-1].slice(0,3); }
function niceDate(iso){ const [y,m,d]=iso.split("-").map(Number); return d+" "+MONTHS[m-1].slice(0,3); }
function longDate(iso){ const [y,m,d]=iso.split("-").map(Number); return d+" "+MONTHS[m-1]+" "+y; }
function weekday(iso){ const [y,m,d]=iso.split("-").map(Number); return WEEKDAYS[new Date(y,m-1,d).getDay()]; }

/* ---------- storage ---------- */
function uid(){ return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "id-"+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function mkSaving(date, type, amount, note, fx){
  const s = {id:uid(), date, type, amount, note:note||""};
  if (type==="gold"){ s.rate = MARKET.gold.buy; s.units = amount/MARKET.gold.buy; }
  if (type==="fx"){ const f = FX[fx||"USD"]; s.fx = f.code; s.rate = f.sell; s.units = amount/f.sell; }
  return s;
}
function freshState(){ return { expenses:[], incomes:[], savings:[], budget:0, target:20, currency:"IDR", sources: DEFAULT_SOURCES.slice(), onboardHidden:false }; }
function normalizeState(s){
  s = s || {};
  const st = {
    expenses: Array.isArray(s.expenses) ? s.expenses.filter(e=>e && !e.sample) : [],
    incomes: Array.isArray(s.incomes) ? s.incomes.filter(e=>e && !e.sample) : [],
    savings: Array.isArray(s.savings) ? s.savings.filter(e=>e && !e.sample) : [],
    budget: Number(s.budget)||0,
    target: isFinite(+s.target) && s.target!==undefined && s.target!==null ? +s.target : 20,
    currency: CURRENCIES[s.currency] ? s.currency : "IDR",
    sources: Array.isArray(s.sources) && s.sources.length ? s.sources : DEFAULT_SOURCES.slice(),
    onboardHidden: !!s.onboardHidden,
    deleted: Array.isArray(s.deleted) ? s.deleted.slice(-1000) : []
  };
  if (s._dirty) st._dirty = true;
  if (s._rev) st._rev = s._rev;
  return st;
}
function readJSON(key){ try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch(e){ return null; } }
function load(){ return normalizeState(readJSON(storeKey())); }
const hasEntries = st => !!(st && (st.expenses.length || st.incomes.length || st.savings.length));
function payload(st){ const { _dirty, _rev, ...rest } = st; return rest; }
function mergeStates(server, local){
  const out = Object.assign({}, server, { budget: local.budget, target: local.target, currency: local.currency, sources: local.sources, onboardHidden: local.onboardHidden });
  const del = new Set([...(server.deleted||[]), ...(local.deleted||[])]);
  ["expenses","incomes","savings"].forEach(k=>{
    const map = new Map();
    (server[k]||[]).forEach(r=>map.set(r.id, r));
    (local[k]||[]).forEach(r=>map.set(r.id, r));
    out[k] = [...map.values()].filter(r=>!del.has(r.id));
  });
  out.deleted = [...del].slice(-1000);
  return out;
}
function withState(tmp, fn){ const prev = state; state = tmp; try { return fn(); } finally { state = prev; } }

let state = freshState();
const ui = { viewing:null, readOnly:false, family:null, legacyDismissed:false, month: currentYM(), view:"", editing:null, editingIncome:null, search:"", filter:"all", sort:"date-desc", scope:"month", pendingImport:null, lastAdded:null, pendingDelete:null, hideEmpty: !!(window.matchMedia && matchMedia("(max-width: 640px)").matches) };

/* ---------- money ---------- */
function cfg(){ return CURRENCIES[state.currency]; }
function money(n){ return new Intl.NumberFormat(cfg().locale,{style:"currency",currency:state.currency,minimumFractionDigits:cfg().dec,maximumFractionDigits:cfg().dec}).format(n||0); }
function idr(n, dec){ return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",minimumFractionDigits:dec||0,maximumFractionDigits:dec||0}).format(n||0); }
function plain(n){ return new Intl.NumberFormat(cfg().locale,{minimumFractionDigits:0,maximumFractionDigits:cfg().dec}).format(n||0); }
function fxMoney(n, code){ const dec = code==="JPY"||code==="KRW" ? 0 : 2; try { return new Intl.NumberFormat("en-US",{style:"currency",currency:code,minimumFractionDigits:dec,maximumFractionDigits:dec}).format(n); } catch(e){ return code+" "+n.toFixed(dec); } }
function compact(n){ const a=Math.abs(n); if (a>=1e9) return trim(n/1e9)+"B"; if (a>=1e6) return trim(n/1e6)+"M"; if (a>=1e3) return trim(n/1e3)+"K"; return String(Math.round(n)); }
function trim(x){ return (Math.round(x*10)/10).toString(); }
function parseAmount(str){
  if (str==null) return NaN;
  let s = String(str).trim().replace(/\s/g,""); if (!s) return NaN;
  s = s.replace(/[^\d.,-]/g,"");
  if (cfg().dec===0){ s = s.replace(/[^\d]/g,""); return s ? Number(s) : NaN; }
  const m = s.match(/[.,](\d{1,2})$/); let intPart = s, decPart = "";
  if (m){ intPart = s.slice(0, s.length - m[0].length); decPart = m[1]; }
  intPart = intPart.replace(/[^\d]/g,"");
  const v = Number((intPart||"0") + (decPart ? "."+decPart : ""));
  return isFinite(v) ? v : NaN;
}
function parseIDR(str){ const s = String(str||"").replace(/[^\d]/g,""); return s ? Number(s) : NaN; }
function round(n){ const f=Math.pow(10,cfg().dec); return Math.round(n*f)/f; }
const pct = (a,b) => b>0 ? a/b : 0;
const fmtPct = x => (Math.round(x*1000)/10).toString().replace(/\.0$/,"")+"%";
const grams = g => (Math.round(g*1000)/1000).toLocaleString("en-US",{maximumFractionDigits:3})+" g";
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
const plural = (n, w) => `${n} ${w}${n===1?"":"s"}`;

/* ---------- calculations ---------- */
const inMonth = (arr, ym) => arr.filter(e=>e.date && e.date.slice(0,7)===ym);
const rowsFor = ym => inMonth(state.expenses, ym);
const sumBy = (arr, f) => arr.reduce((a,r)=>a+(+f(r)||0),0);
function summarize(rows){
  const original = sumBy(rows, r=>r.original), paid = sumBy(rows, r=>r.final);
  return { original, paid, saved: original-paid, count: rows.length, discounted: rows.filter(r=>r.original>r.final).length };
}
function cashflow(ym){
  const income = sumBy(inMonth(state.incomes, ym), r=>r.amount);
  const spent = summarize(rowsFor(ym)).paid;
  const saved = sumBy(inMonth(state.savings, ym), r=>r.amount);
  return { income, spent, saved, left: income - spent - saved, rate: pct(saved, income) };
}
function budgetStatus(paid){
  const b = state.budget;
  if (!b) return { key:"none", ratio:0, left:0 };
  const ratio = paid/b;
  return { key: ratio>1 ? "over" : ratio>=CARE_AT ? "care" : "ok", ratio, left: b-paid };
}
function daysLeftIn(ym){ if (ym!==currentYM()) return null; return daysIn(ym) - new Date().getDate() + 1; }
function dailyLimit(ym){ return state.budget ? state.budget/daysIn(ym) : 0; }
function dayTable(ym){
  const n = daysIn(ym), rows = rowsFor(ym), out = [];
  for (let d=1; d<=n; d++){
    const date = ym+"-"+pad(d), items = rows.filter(r=>r.date===date), s = summarize(items);
    out.push({ date, day:d, items, ...s });
  }
  let run = 0; out.forEach(r=>{ run += r.paid; r.running = run; });
  return out;
}
function visibleDays(ym){
  const all = dayTable(ym);
  if (ym===currentYM()) return all.slice(0, new Date().getDate());
  if (ym > currentYM()) return all.filter(r=>r.count);
  return all;
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, tone){
  const t=$("#toast"); t.textContent=msg; t.className="toast"+(tone?" "+tone:"");
  requestAnimationFrame(()=>t.classList.add("show"));
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"), tone ? 4400 : 2600);
}

/* ---------- number animation ---------- */
const lastShown = new WeakMap();
function countTo(el, value, fmt){
  const from = lastShown.has(el) ? lastShown.get(el) : 0;
  lastShown.set(el, value);
  if (reduceMotion || from===value){ el.textContent = fmt(value); return; }
  const start = performance.now(), dur = 520, ease = t => 1-Math.pow(1-t,4);
  cancelAnimationFrame(el._raf);
  const step = now => { const t = Math.min(1,(now-start)/dur); el.textContent = fmt(from + (value-from)*ease(t)); if (t<1) el._raf = requestAnimationFrame(step); else el.textContent = fmt(value); };
  el._raf = requestAnimationFrame(step);
}

/* ---------- views ---------- */
const VIEWS = { dashboard:["Overview","Dashboard"], expenses:["Add & review","Expenses"], daily:["Day by day","Daily breakdown"], income:["Money in","Income"], savings:["Set aside","Savings"], reports:["Export","Reports"], setup:["Preferences","Budget & settings"], family:["Super Admin","Family"] };
const ADD_LABEL = { income:"Add income", savings:"Set money aside" };
function showView(name, animate){
  if (!session) return;
  const allowed = allowedViews();
  if (!VIEWS[name] || !allowed.includes(name)){ name = allowed[0] || "dashboard"; try { history.replaceState(null, "", "#"+name); } catch(e){} }
  const changed = ui.view !== name;
  ui.view = name;
  Object.keys(VIEWS).forEach(v=>{ $("#view-"+v).hidden = v!==name; });
  $$(".nav a").forEach(a=>{ if (a.dataset.view===name) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  $("#eyebrow").textContent = VIEWS[name][0];
  $("#viewTitle").textContent = VIEWS[name][1];
  $("#addBtn").lastChild.textContent = ADD_LABEL[name] || (effectiveRole()==="child" ? "Add income" : "Add expense");
  $("#addBtn").hidden = ui.readOnly || session.role==="superadmin";
  const el = $("#view-"+name);
  if (animate !== false && changed && !reduceMotion){ el.classList.remove("entering"); void el.offsetWidth; el.classList.add("entering"); setTimeout(()=>el.classList.remove("entering"), 700); }
  positionPill();
  if (name==="dashboard") renderDaily(true);
  if (name==="family") renderFamily();
}
const pill = $(".nav-pill");
function positionPill(){
  const a = $('.nav a[aria-current="page"]'); if (!a || !pill) return;
  pill.style.width = a.offsetWidth+"px"; pill.style.height = a.offsetHeight+"px";
  pill.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
  if (!pill.classList.contains("ready")) requestAnimationFrame(()=>requestAnimationFrame(()=>pill.classList.add("ready")));
}
window.addEventListener("resize", ()=>{ pill.classList.remove("ready"); positionPill(); });
function route(){ showView((location.hash||"").slice(1) || "dashboard", true); }

function renderAll(){
  $("#monthLabel").textContent = monthName(ui.month);
  $$("[data-cur]").forEach(el=>el.textContent = cfg().sym);
  renderDashboard(); renderSourcesSelects(); renderSlip(); renderTable(); renderDailyView();
  renderIncome(); renderSavings(); renderReports(); renderSettings();
  if (session && session.role==="superadmin") renderFamily();
  renderLegacy();
}

/* ---------- messages ---------- */
function statusMessage(sum, st, ym){
  const isNow = ym===currentYM(), dl = daysLeftIn(ym);
  const savedTxt = sum.saved>0 ? ` Discounts saved you <b>${money(sum.saved)}</b>.` : "";
  const days = n => plural(n,"day");
  if (!sum.count) return `No expenses recorded for ${monthName(ym)} yet. Add your first purchase to start the calculation.`;
  if (st.key==="none") return `You spent <b>${money(sum.paid)}</b> on ${plural(sum.count,"purchase")}.${savedTxt} Set a monthly limit to get a warning before you overspend.`;
  if (st.key==="over") return isNow
    ? `You're <b>${money(-st.left)} over</b> your monthly limit of ${money(state.budget)}.${savedTxt} Try to hold off on anything non-essential for the next ${days(dl)}.`
    : `You went <b>${money(-st.left)} over</b> your limit in ${monthName(ym)}.${savedTxt}`;
  if (st.key==="care") return isNow
    ? `Careful — you've used <b>${fmtPct(st.ratio)}</b> of your limit. <b>${money(st.left)}</b> is left for ${days(dl)}, about <b>${money(round(st.left/dl))}</b> a day.${savedTxt}`
    : `You stayed within your limit in ${monthName(ym)}, with <b>${money(st.left)}</b> to spare (${fmtPct(st.ratio)} used).${savedTxt}`;
  return isNow
    ? `You're on track. You've used <b>${fmtPct(st.ratio)}</b> of your limit, leaving <b>${money(st.left)}</b> — about <b>${money(round(st.left/dl))}</b> a day for the remaining ${days(dl)}.${savedTxt}`
    : `You stayed within your limit in ${monthName(ym)}, with <b>${money(st.left)}</b> to spare.${savedTxt}`;
}
function flowMessage(cf, ym){
  if (effectiveRole()==="child"){
    if (!cf.income) return { tone:"", text:`No income recorded for ${monthName(ym)}. Add pocket money or any other income to see how much you can save.` };
    const goal = cf.income*state.target/100;
    const tgt = state.target ? (cf.saved >= goal ? ` That's above your ${state.target}% target.` : ` Save <b>${money(goal-cf.saved)}</b> more to reach your ${state.target}% target.`) : "";
    return { tone: cf.left<0 ? "care" : "ok", text: cf.left<0
      ? `You've set aside <b>${money(-cf.left)}</b> more than you received. Check your savings entries.`
      : `You received <b>${money(cf.income)}</b> and saved <b>${money(cf.saved)}</b> (${fmtPct(cf.rate)}). <b>${money(cf.left)}</b> is left to use.${tgt}` };
  }
  if (!cf.income) return { tone:"", text:`No income recorded for ${monthName(ym)}. Add your salary and other income to see whether it covers your spending and savings.` };
  const t = state.target/100, goal = cf.income*t;
  const targetTxt = state.target ? (cf.saved >= goal
      ? ` You're saving <b>${fmtPct(cf.rate)}</b> of your income, above your ${state.target}% target.`
      : ` You're saving <b>${fmtPct(cf.rate)}</b> of your income. Set aside <b>${money(goal-cf.saved)}</b> more to reach your ${state.target}% target.`) : "";
  if (cf.spent > cf.income) return { tone:"over", text:`Your spending is <b>${money(cf.spent-cf.income)} more than your income</b> this month. Cut back on non-essentials or add any income you haven't recorded.` };
  if (cf.left < 0) return { tone:"care", text:`Your income covers your spending, but you've set aside <b>${money(-cf.left)}</b> more for savings than was left. Check your savings entries or add missing income.` };
  return { tone:"ok", text:`Your income covers everything. After spending ${money(cf.spent)} and saving ${money(cf.saved)}, you have <b>${money(cf.left)}</b> left (${fmtPct(pct(cf.left,cf.income))} of income).${targetTxt}` };
}

/* ---------- dashboard ---------- */
function renderDashboard(){
  const rows = rowsFor(ui.month), sum = summarize(rows), st = budgetStatus(sum.paid);
  const prev = summarize(rowsFor(shiftMonth(ui.month,-1)));
  renderOnboard();

  const al = $("#budgetAlert");
  if (st.key==="over" || st.key==="care"){
    al.hidden = false; al.className = "alert "+st.key;
    $("#budgetAlertTitle").textContent = st.key==="over" ? "Over your monthly spending limit" : "Close to your monthly spending limit";
    $("#budgetAlertText").textContent = st.key==="over"
      ? `You've spent ${money(sum.paid)} in ${monthName(ui.month)}, which is ${money(-st.left)} more than your ${money(state.budget)} limit.`
      : `You've used ${fmtPct(st.ratio)} of your ${money(state.budget)} limit. ${money(st.left)} is left.`;
  } else al.hidden = true;

  const cf = cashflow(ui.month);
  const ia = $("#incomeAlert");
  ia.hidden = !(cf.income>0 && cf.spent>cf.income);
  if (!ia.hidden) $("#incomeAlertText").textContent = `You've spent ${money(cf.spent)} but received ${money(cf.income)} in ${monthName(ui.month)} — ${money(cf.spent-cf.income)} more than you earned.`;

  $("#heroLabel").textContent = "Spent in " + monthName(ui.month);
  countTo($("#heroAmount"), sum.paid, money);
  const pill = $("#statusPill");
  pill.className = "pill "+st.key;
  pill.textContent = {none:"No limit set", ok:"On track", care:"Near limit", over:"Over limit"}[st.key];
  $("#heroOf").innerHTML = state.budget ? `of your <b>${money(state.budget)}</b> monthly limit` : `<a href="#setup">Set a monthly limit</a> to track your spending`;
  const fill = $("#meterFill");
  fill.className = "meter-fill" + (st.key==="over"?" over": st.key==="care"?" care":"");
  const scale = state.budget ? Math.min(1, st.ratio) : 0;
  requestAnimationFrame(()=>{ fill.style.transform = `scaleX(${scale})`; });
  $("#meter").hidden = !state.budget;
  $("#meterPct").textContent = state.budget ? fmtPct(st.ratio)+" used" : "";
  $("#meterMax").textContent = state.budget ? money(state.budget) : "";
  $("#heroMessage").innerHTML = statusMessage(sum, st, ui.month);

  $("#rcMonth").textContent = monthName(ui.month);
  $("#rcOriginal").textContent = money(sum.original);
  $("#rcDiscount").textContent = (sum.saved>0?"− ":"") + money(sum.saved);
  $("#rcPaid").textContent = money(sum.paid);
  $("#rcBudget").textContent = state.budget ? money(state.budget) : "Not set";
  const rl = $("#rcResultLine");
  if (!state.budget){ $("#rcResultLabel").textContent="Remaining"; $("#rcResult").textContent="—"; rl.className="r-line result"; }
  else if (st.left>=0){ $("#rcResultLabel").textContent="Remaining"; $("#rcResult").textContent=money(st.left); rl.className="r-line result ok"; }
  else { $("#rcResultLabel").textContent="Over limit"; $("#rcResult").textContent="+ "+money(-st.left); rl.className="r-line result over"; }
  $("#rcFoot").textContent = `${plural(sum.count,"purchase")} · ${sum.discounted} with discount`;

  // money in & out
  const isChild = effectiveRole()==="child";
  $("#equation").innerHTML = `
    <div class="eq-row"><span class="lbl"><span class="op">+</span>Income</span><b>${money(cf.income)}</b></div>
    ${isChild ? "" : `<div class="eq-row"><span class="lbl"><span class="op">−</span>Spending</span><b>${money(cf.spent)}</b></div>`}
    <div class="eq-row"><span class="lbl"><span class="op">−</span>Savings</span><b>${money(cf.saved)}</b></div>
    <div class="eq-row result ${cf.left>=0?"pos":"neg"}"><span class="lbl"><span class="op">=</span>${cf.left>=0?"Left over":"Short by"}</span><b>${money(Math.abs(cf.left))}</b></div>`;
  const base = Math.max(cf.income, cf.spent+cf.saved) || 1;
  const seg = (cls, v, i) => v>0 ? `<div class="${cls}" style="width:${v/base*100}%;animation-delay:${i*80}ms"></div>` : "";
  $("#flowbar").innerHTML = seg("fb-spend",cf.spent,0) + seg("fb-save",cf.saved,1) + seg("fb-left",Math.max(0,cf.left),2);
  $("#flowLegend").innerHTML = (isChild ? "" : `<span><i style="background:var(--spend)"></i>Spending ${fmtPct(pct(cf.spent,cf.income))}</span>`) + `<span><i style="background:var(--teal-bar)"></i>Savings ${fmtPct(cf.rate)}</span><span><i style="background:var(--left)"></i>Left over ${fmtPct(Math.max(0,pct(cf.left,cf.income)))}</span>` + (cf.income ? "" : `<span>of income</span>`);
  const fm = flowMessage(cf, ui.month);
  const fmEl = $("#flowMessage"); fmEl.innerHTML = fm.text;
  fmEl.style.background = fm.tone==="over" ? "var(--over-soft)" : fm.tone==="care" ? "var(--care-soft)" : "";

  countTo($("#stSaved"), sum.saved, money);
  $("#stSavedNote").textContent = sum.original ? `${fmtPct(pct(sum.saved,sum.original))} off on average` : "No purchases yet";
  $("#stCount").textContent = sum.count;
  $("#stCountNote").textContent = sum.count ? `About ${money(round(sum.paid/sum.count))} each` : "Nothing recorded";
  const isNow = ui.month===currentYM();
  const daysCounted = isNow ? new Date().getDate() : daysIn(ui.month);
  countTo($("#stDaily"), round(sum.paid/daysCounted), money);
  $("#stDailyNote").textContent = isNow ? `Over the first ${plural(daysCounted,"day")}` : `Across ${plural(daysCounted,"day")}`;
  const diff = sum.paid - prev.paid, pm = shortMonth(shiftMonth(ui.month,-1));
  if (!prev.count){ $("#stDelta").textContent = "—"; $("#stDeltaNote").textContent = `No data for ${pm}`; }
  else {
    $("#stDelta").textContent = (diff>0?"+":diff<0?"−":"") + money(Math.abs(diff));
    const p = pct(Math.abs(diff), prev.paid);
    $("#stDeltaNote").innerHTML = diff>0 ? `<span class="up">${fmtPct(p)} more</span> than ${pm}` : diff<0 ? `<span class="down">${fmtPct(p)} less</span> than ${pm}` : `Same as ${pm}`;
  }

  const bySrc = {};
  rows.forEach(r=>{ const k=r.source||"Other"; (bySrc[k]=bySrc[k]||{paid:0,n:0}); bySrc[k].paid+=+r.final; bySrc[k].n++; });
  $("#sourceList").innerHTML = barRows(Object.entries(bySrc).map(([k,v])=>({label:k, sub:plural(v.n,"item"), value:v.paid})), sum.paid, "Nothing bought this month yet.");

  const recent = rows.slice().sort((a,b)=> b.date.localeCompare(a.date) || (b.created||0)-(a.created||0)).slice(0,5);
  $("#recentList").innerHTML = recent.length ? recent.map(r=>`
    <div class="li"><div style="min-width:0"><div class="li-title">${esc(r.item)}</div><div class="li-meta">${niceDate(r.date)} · ${esc(r.source)}${r.store?" · "+esc(r.store):""}</div></div>
    <div class="li-amt num">${money(r.final)}${r.original>r.final?`<s>${money(r.original)}</s>`:""}</div></div>`).join("")
    : `<div class="empty">No expenses yet. <a href="#expenses">Add one</a>.</div>`;
  const deals = rows.filter(r=>r.original>r.final).sort((a,b)=>(b.original-b.final)-(a.original-a.final)).slice(0,5);
  $("#dealList").innerHTML = deals.length ? deals.map(r=>`
    <div class="li"><div style="min-width:0"><div class="li-title">${esc(r.item)}</div><div class="li-meta">${esc(r.store||r.source)} · paid ${money(r.final)}</div></div>
    <div class="li-amt num"><span class="save">− ${money(r.original-r.final)}</span><span class="li-meta">${fmtPct(pct(r.original-r.final,r.original))} off</span></div></div>`).join("")
    : `<div class="empty">No discounted purchases this month.</div>`;
  if (isChild){
    const byT = {}; state.savings.forEach(x=>{ const k = INST[x.type]?INST[x.type].name:x.type; (byT[k]=byT[k]||{v:0,n:0}); byT[k].v+=+x.amount; byT[k].n++; });
    $("#childSavings").innerHTML = barRows(Object.entries(byT).map(([k,v])=>({label:k, sub:plural(v.n,"entry").replace("entrys","entries"), value:v.v})), sumBy(state.savings,x=>x.amount), "Nothing saved yet. Open Savings to set some money aside.");
  }
  if (ui.view==="dashboard") renderDaily(true);
}
function barRows(items, total, empty){
  items.sort((a,b)=>b.value-a.value);
  const max = items.length ? items[0].value : 0;
  return items.length ? items.map((it,i)=>`
    <div class="src-row">
      <div class="src-name">${esc(it.label)}<span>${esc(it.sub)}</span></div>
      <div class="src-amt num">${money(it.value)} <span>${fmtPct(pct(it.value,total))}</span></div>
      <div class="src-track"><div class="src-fill" style="width:${max? Math.max(2,it.value/max*100):0}%;animation-delay:${i*50}ms"></div></div>
    </div>`).join("") : `<div class="empty">${empty}</div>`;
}

/* ---------- getting started ---------- */
function renderOnboard(){
  const ym = ui.month, cf = cashflow(ym);
  const child = effectiveRole()==="child";
  let steps = [
    { done: cf.income>0, title:"Add your income", text:"Record the salary you just received, plus any other income this month.", btn:"Add income", go:"income" },
    { done: state.budget>0, title:"Set a spending limit", text:"Choose how much you'll allow yourself to spend this month. You'll be warned at 80%.", btn:"Set limit", go:"setup" },
    { done: cf.saved>0, title:"Set money aside", text:"Move part of your income into savings first, so it doesn't get spent.", btn:"Save money", go:"savings" },
    { done: rowsFor(ym).length>0, title:"Add your first expense", text:"Type what you bought, where, and the price before and after discount.", btn:"Add expense", go:"expenses" }
  ];
  if (child) steps = [
    { done: cf.income>0, title:"Add your income", text:"Record pocket money, allowance or any other money you received.", btn:"Add income", go:"income" },
    { done: cf.saved>0, title:"Set money aside", text:"Put part of it into savings so it keeps growing.", btn:"Save money", go:"savings" }
  ];
  const all = steps.every(s=>s.done);
  $("#onboardIntro").textContent = `${steps.length===2?"Two":"Four"} quick steps to get your first calculation.`;
  const prevDone = ui._doneSteps || null; ui._doneSteps = steps.map(s=>s.done);
  $("#onboard").hidden = state.onboardHidden || all;
  $("#steps").innerHTML = steps.map((s,i)=>`<div class="step ${s.done?"done":""} ${s.done && prevDone && !prevDone[i] ? "just-done":""}">
    <div class="step-num" aria-hidden="true">${s.done?"✓":i+1}</div>
    <h3>${s.title}</h3><p>${s.text}</p>
    ${s.done ? `<span class="step-done">Done</span>` : `<button class="btn btn-ghost btn-sm" data-go="${s.go}">${s.btn}</button>`}</div>`).join("");
}
$("#steps").addEventListener("click", e=>{
  const b = e.target.closest("[data-go]"); if (!b) return;
  const go = b.dataset.go;
  if (go==="expenses") return goAddExpense();
  location.hash = go;
  setTimeout(()=>{
    if (go==="income"){ flashTo($("#incomeCard")); $("#iAmount").focus({preventScroll:true}); }
    if (go==="savings"){ flashTo($("#saveCard")); $("#svAmount").focus({preventScroll:true}); }
    if (go==="setup"){ $("#sBudget").focus(); }
  }, 80);
});
$("#hideOnboard").addEventListener("click", ()=>{ state.onboardHidden = true; save(); renderOnboard(); });

/* ---------- daily chart ---------- */
function niceScale(max, ticks){
  if (max<=0) return {step:1, top:1};
  const raw = max/ticks, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw/mag;
  const step = (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*mag;
  return { step, top: Math.ceil(max/step)*step };
}
function roundTop(x,y,w,h,r){ r = Math.max(0, Math.min(r, w/2, h)); return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`; }
let lastChartKey = "";
function renderDaily(grow){
  const host = $("#dailyChart");
  if (!host || host.offsetParent===null) return;
  const days = dayTable(ui.month), n = days.length;
  const vals = days.map(d=>d.paid), counts = days.map(d=>d.count);
  const max = Math.max(0,...vals);
  if (!max){ host.innerHTML = `<div class="empty-chart">No spending recorded in ${monthName(ui.month)}.</div>`; return; }
  const W = Math.max(240, host.clientWidth), H = 230, padL = 40, padR = 6, padT = 14, padB = 26;
  const iw = W-padL-padR, ih = H-padT-padB;
  const lim = dailyLimit(ui.month);
  const {step, top} = niceScale(Math.max(max, lim*1.05), 4);
  const bw = iw/n, barW = Math.max(3, Math.min(16, bw*0.62));
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily spending in ${monthName(ui.month)}. Highest day ${money(max)}."><defs><linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#10b981"/><stop offset=".55" stop-color="#0ea5b7"/><stop offset="1" stop-color="#3b8beb"/></linearGradient></defs>`;
  for (let v=0; v<=top+step/1000; v+=step){
    const y = padT + ih - (v/top)*ih;
    s += `<line class="${v===0?"baseline":"gridline"}" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="tick" x="${padL-8}" y="${(y+4).toFixed(1)}" text-anchor="end">${v===0?"0":compact(v)}</text>`;
  }
  if (lim){ const y = padT + ih - (lim/top)*ih; s += `<line class="todayline" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="todaylbl" x="${padL+4}" y="${(y-5).toFixed(1)}" text-anchor="start">DAILY LIMIT ${compact(lim)}</text>`; }
  vals.forEach((v,i)=>{ if (!v) return; const h = (v/top)*ih, x = padL + i*bw + (bw-barW)/2, y = padT+ih-h;
    s += `<path class="bar" data-i="${i}" d="${roundTop(x,y,barW,h,4)}" style="animation-delay:${Math.min(i*14,400)}ms${lim && v>lim ? ";fill:var(--over-fill)" : ""}"/>`; });
  [1,5,10,15,20,25,n].forEach(d=>{ if (d===25 && n-25<3) return; const x = padL + (d-0.5)*bw; s += `<text class="tick" x="${x.toFixed(1)}" y="${H-6}" text-anchor="middle">${d}</text>`; });
  for (let i=0;i<n;i++) s += `<rect class="hit" data-hit="${i}" x="${(padL+i*bw).toFixed(1)}" y="${padT}" width="${bw.toFixed(1)}" height="${ih}" fill="transparent"/>`;
  s += `</svg><div class="tip" id="tip"></div>`;
  host.innerHTML = s;
  const key = ui.month+"|"+vals.join(",");
  host.classList.remove("grow");
  if (grow && key!==lastChartKey && !reduceMotion){ void host.offsetWidth; host.classList.add("grow"); }
  lastChartKey = key;
  const tip = host.querySelector("#tip"), svg = host.querySelector("svg");
  const hide = ()=>{ host.classList.remove("hovering"); tip.classList.remove("show"); svg.querySelectorAll(".bar.on").forEach(b=>b.classList.remove("on")); };
  svg.addEventListener("pointermove", e=>{
    const t = e.target.closest("[data-hit]"); if (!t){ hide(); return; }
    const i = +t.dataset.hit;
    svg.querySelectorAll(".bar.on").forEach(b=>b.classList.remove("on"));
    const bar = svg.querySelector(`.bar[data-i="${i}"]`); if (!bar){ hide(); return; }
    bar.classList.add("on"); host.classList.add("hovering");
    tip.innerHTML = `<span>${weekday(days[i].date)} ${niceDate(days[i].date)} · ${plural(counts[i],"purchase")}</span><b class="num">${money(vals[i])}</b>`;
    const tw = tip.offsetWidth || 140, bx = padL + (i+0.5)*bw;
    tip.style.left = Math.max(0, Math.min(W - tw, bx - tw/2))+"px";
    tip.style.top = Math.max(0, padT + ih - (vals[i]/top)*ih - 62)+"px";
    tip.classList.add("show");
  });
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("click", e=>{ const t = e.target.closest("[data-hit]"); if (t && vals[+t.dataset.hit]) openDay(days[+t.dataset.hit].date); });
}
let rzRaf;
if (window.ResizeObserver) new ResizeObserver(()=>{ cancelAnimationFrame(rzRaf); rzRaf = requestAnimationFrame(()=>renderDaily(false)); }).observe($("#dailyChart"));

/* ---------- modal ---------- */
const modal = $("#modal");
function openModal(title, sub, html){
  $("#modalTitle").textContent = title; $("#modalSub").textContent = sub || ""; $("#modalBody").innerHTML = html;
  modal.classList.remove("closing");
  if (typeof modal.showModal === "function"){ if (!modal.open) modal.showModal(); } else modal.setAttribute("open","");
  $("#modalBody").scrollTop = 0; modal.querySelector(".modal-card").scrollTop = 0;
}
function closeModal(){
  if (!modal.open || modal.classList.contains("closing")) return;
  const done = ()=>{ modal.classList.remove("closing"); if (typeof modal.close === "function") modal.close(); else modal.removeAttribute("open"); };
  if (reduceMotion) return done();
  modal.classList.add("closing"); setTimeout(done, 200);
}
modal.addEventListener("cancel", e=>{ e.preventDefault(); closeModal(); });
$("#modalClose").addEventListener("click", closeModal);
modal.addEventListener("click", e=>{ if (e.target===modal) closeModal(); });

/* ---------- day details ---------- */
function openDay(date){
  const ym = date.slice(0,7);
  const items = rowsFor(ym).filter(r=>r.date===date).sort((a,b)=>(a.created||0)-(b.created||0));
  const s = summarize(items), lim = dailyLimit(ym);
  const run = dayTable(ym).find(d=>d.date===date).running;
  let msg;
  if (!s.count) msg = "Nothing was spent on this day.";
  else if (!lim) msg = `You spent ${money(s.paid)} on ${plural(s.count,"purchase")}${s.saved>0?`, saving ${money(s.saved)} with discounts`:""}.`;
  else if (s.paid>lim) msg = `You spent ${money(s.paid-lim)} more than your daily limit of ${money(round(lim))}.`;
  else msg = `You stayed ${money(lim-s.paid)} under your daily limit of ${money(round(lim))}.`;
  const tone = !s.count ? "" : lim && s.paid>lim ? "over" : "ok";
  const html = `
    <div class="kv">
      <div>Purchases</div><div>${s.count}</div>
      <div>Price before discount</div><div>${money(s.original)}</div>
      <div>Discounts</div><div style="color:var(--ok)">${s.saved>0?"− ":""}${money(s.saved)}</div>
      <div><b>Paid this day</b></div><div>${money(s.paid)}</div>
      <div>Daily limit</div><div>${lim?money(round(lim)):"Not set"}</div>
      <div>Spent this month up to this day</div><div>${money(run)}</div>
    </div>
    <div class="slip-msg ${tone}">${msg}</div>
    ${s.count ? `<h3>Purchases</h3><div class="table-wrap"><table><thead><tr><th>Item</th><th>Bought from</th><th class="r">Starting</th><th class="r">Discount</th><th class="r">Paid</th><th class="r"><span class="muted">Edit</span></th></tr></thead><tbody>
      ${items.map(r=>`<tr><td><div class="t-item">${esc(r.item)}</div>${r.store?`<div class="t-store">${esc(r.store)}</div>`:""}</td><td><span class="tag">${esc(r.source)}</span></td><td class="r">${money(r.original)}</td><td class="r">${r.original>r.final?`<span class="disc">− ${money(r.original-r.final)}</span>`:`<span class="muted">—</span>`}</td><td class="r"><b>${money(r.final)}</b></td><td class="r"><button class="icon-btn" data-edit="${r.id}" aria-label="Edit ${esc(r.item)}"><svg class="ico" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg></button></td></tr>`).join("")}
      </tbody></table></div>` : ""}
    <div class="row"><button class="btn btn-primary btn-sm" data-addon="${date}">Add expense on this day</button></div>`;
  openModal(`${weekday(date)}, ${longDate(date)}`, "Daily calculation", html);
}
$("#modalBody").addEventListener("click", e=>{
  const ed = e.target.closest("[data-edit]"); if (ed){ closeModal(); location.hash = "expenses"; setTimeout(()=>startEdit(ed.dataset.edit), 80); return; }
  const add = e.target.closest("[data-addon]"); if (add){ closeModal(); goAddExpense(add.dataset.addon); return; }
  const sv = e.target.closest("[data-savehere]"); if (sv){ closeModal(); goSave(sv.dataset.savehere, sv.dataset.fx); return; }
});
$("#modalBody").addEventListener("input", e=>{ if (e.target.id==="calcAmt") updateCalc(); if (e.target.id==="calcFx") updateCalc(); });
$("#modalBody").addEventListener("change", e=>{ if (e.target.id==="calcFx") updateCalc(); });
$("#modalBody").addEventListener("focusout", e=>{ if (e.target.id==="calcAmt"){ const v=parseIDR(e.target.value); if (isFinite(v)) e.target.value = v.toLocaleString("id-ID"); } });

/* ---------- daily view ---------- */
function renderDailyView(){
  const ym = ui.month, all = dayTable(ym), shown = visibleDays(ym);
  const lim = dailyLimit(ym), sum = summarize(rowsFor(ym));
  const counted = ym===currentYM() ? new Date().getDate() : daysIn(ym);
  $("#dLimit").textContent = lim ? money(round(lim)) : "Not set";
  $("#dLimitNote").innerHTML = lim ? `${money(state.budget)} ÷ ${daysIn(ym)} days` : `<a href="#setup">Set a monthly limit</a>`;
  $("#dAvg").textContent = money(round(sum.paid/counted));
  $("#dAvgNote").textContent = `${money(sum.paid)} ÷ ${plural(counted,"day")}`;
  const top = all.reduce((a,b)=> b.paid>a.paid ? b : a, all[0]);
  $("#dMax").textContent = top && top.paid ? money(top.paid) : "—";
  $("#dMaxNote").textContent = top && top.paid ? `${weekday(top.date)}, ${niceDate(top.date)}` : "No spending yet";
  const over = lim ? all.filter(d=>d.paid>lim).length : 0;
  $("#dOver").textContent = lim ? over : "—";
  $("#dOverNote").textContent = lim ? `${plural(all.filter(d=>d.count).length,"day")} with spending` : "Needs a monthly limit";
  $("#dailyTitle").textContent = monthName(ym) + ", day by day";
  $("#dailyIntro").textContent = "Each day adds up to the monthly total. \"Month so far\" is the running total that ends at your monthly spending.";
  const rows = ui.hideEmpty ? shown.filter(d=>d.count) : shown;
  const today = todayISO();
  $("#dayBody").innerHTML = rows.length ? rows.map(d=>{
    const st = !d.count ? `<span class="mini-pill none">No spending</span>` : !lim ? `<span class="muted">—</span>` : d.paid>lim ? `<span class="mini-pill over">+ ${money(round(d.paid-lim))} over</span>` : `<span class="mini-pill ok">${money(round(lim-d.paid))} under</span>`;
    return `<tr class="${d.count?"":"zero"} ${d.date===today?"today":""}">
      <td style="white-space:nowrap">${weekday(d.date)}, ${niceDate(d.date)}</td>
      <td class="r">${d.count||"—"}</td><td class="r">${d.count?money(d.original):"—"}</td>
      <td class="r">${d.saved>0?`<span class="disc">− ${money(d.saved)}</span>`:`<span class="muted">—</span>`}</td>
      <td class="r"><b>${d.count?money(d.paid):"—"}</b></td><td class="r">${money(d.running)}</td><td>${st}</td>
      <td class="r"><button class="btn btn-ghost btn-sm" data-day="${d.date}" aria-label="Details for ${niceDate(d.date)}">Details</button></td></tr>`;
  }).join("") : `<tr><td colspan="8" class="empty" style="text-align:center;padding:28px">No days with spending in ${monthName(ym)}.</td></tr>`;
  $("#dayFoot").innerHTML = `<tr><td>Month total</td><td class="r">${sum.count}</td><td class="r">${money(sum.original)}</td><td class="r"><span class="disc">− ${money(sum.saved)}</span></td><td class="r">${money(sum.paid)}</td><td class="r">${money(sum.paid)}</td><td colspan="2">${state.budget?`${fmtPct(sum.paid/state.budget)} of monthly limit`:""}</td></tr>`;
}
$("#dayBody").addEventListener("click", e=>{ const b = e.target.closest("[data-day]"); if (b) openDay(b.dataset.day); });
$("#hideEmpty").addEventListener("change", e=>{ ui.hideEmpty = e.target.checked; renderDailyView(); });

/* ---------- expenses: form + slip ---------- */
function allSources(){ const used = new Set(state.expenses.map(e=>e.source).filter(Boolean)); const list = state.sources.slice(); used.forEach(s=>{ if(!list.includes(s)) list.push(s); }); return list; }
function renderSourcesSelects(){
  const sel = $("#fSource"), cur = sel.value, opts = state.sources.slice();
  if (cur && !opts.includes(cur)) opts.push(cur);
  sel.innerHTML = opts.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  if (cur && opts.includes(cur)) sel.value = cur;
  const f = $("#filterSource");
  f.innerHTML = `<option value="all">All sources</option>` + allSources().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  f.value = allSources().includes(ui.filter) ? ui.filter : "all";
  const stores = new Set(STORES); state.expenses.forEach(e=>{ if(e.store) stores.add(e.store); });
  $("#storeList").innerHTML = Array.from(stores).sort().map(s=>`<option value="${esc(s)}">`).join("");
}
function formValues(){ return { item: $("#fItem").value.trim(), source: $("#fSource").value, store: $("#fStore").value.trim(), date: $("#fDate").value, original: parseAmount($("#fOriginal").value), finalRaw: $("#fFinal").value.trim(), final: parseAmount($("#fFinal").value) }; }
function effectiveFinal(v){ return v.finalRaw==="" ? v.original : v.final; }
function renderSlip(){
  const v = formValues();
  const o = isFinite(v.original) ? v.original : 0, f = isFinite(effectiveFinal(v)) ? effectiveFinal(v) : 0, d = Math.max(0, o-f);
  $("#slipItem").textContent = v.item || "—";
  $("#slOriginal").textContent = money(o);
  $("#slDiscLabel").textContent = o>0 && d>0 ? `Discount (${fmtPct(pct(d,o))})` : "Discount";
  $("#slDiscount").textContent = (d>0?"− ":"")+money(d);
  $("#slFinal").textContent = money(f);
  $$("#discChips .chip").forEach(c=>{ const p = +c.dataset.disc, target = round(o*(1-p/100));
    c.setAttribute("aria-pressed", String((o>0 && v.finalRaw!=="" && Math.abs(target-f)<0.005) || (p===0 && o>0 && v.finalRaw===""))); });
  const date = v.date || todayISO(), ym = date.slice(0,7);
  let spent = summarize(rowsFor(ym)).paid;
  let daySpent = summarize(rowsFor(ym).filter(r=>r.date===date)).paid;
  if (ui.editing){ const old = state.expenses.find(e=>e.id===ui.editing); if (old && old.date.slice(0,7)===ym) spent -= +old.final; if (old && old.date===date) daySpent -= +old.final; }
  $("#slDay").textContent = `${money(daySpent + f)}`;
  const msg = $("#slipMsg"), line = $("#slAfterLine");
  if (!state.budget){ $("#slLeftNow").textContent = "No limit"; $("#slAfter").textContent = "—"; line.className = "r-line result"; }
  else { const leftNow = state.budget - spent, after = leftNow - f;
    $("#slLeftNow").textContent = leftNow>=0 ? money(leftNow) : "− "+money(-leftNow);
    $("#slAfter").textContent = after>=0 ? money(after) : "− "+money(-after);
    line.className = "r-line result " + (after<0 ? "over" : "ok"); }
  if (!(o>0)){ msg.className="slip-msg"; msg.textContent = "Type a starting price and a final price. The discount and your budget impact are calculated for you."; return; }
  if (f>o){ msg.className="slip-msg over"; msg.textContent = "The final price is higher than the starting price. The final price should be what you paid after any discount."; return; }
  const parts = [d>0 ? `You save ${money(d)} (${fmtPct(pct(d,o))} off) and pay ${money(f)}.` : `No discount — you pay the full ${money(f)}.`];
  let tone = d>0 ? "ok" : "";
  if (state.budget){
    const leftNow = state.budget - spent, after = leftNow - f, lim = dailyLimit(ym);
    if (after<0 && leftNow>=0){ parts.push(`Warning: this purchase puts ${monthName(ym)} ${money(-after)} over your monthly limit.`); tone="over"; }
    else if (after<0){ parts.push(`You're already over your limit for ${monthName(ym)}; this adds ${money(f)} more.`); tone="over"; }
    else if ((spent+f)/state.budget>=CARE_AT){ parts.push(`After this you'll have ${money(after)} left (${fmtPct((spent+f)/state.budget)} of your limit used).`); tone="care"; }
    else parts.push(`You'll still have ${money(after)} left in ${monthName(ym)}.`);
    if (tone!=="over" && lim && daySpent + f > lim) parts.push(`This day's total goes above your daily limit of ${money(round(lim))}.`);
  }
  msg.className = "slip-msg "+tone; msg.textContent = parts.join(" ");
}
function defaultDate(){ const now = currentYM(); if (ui.month===now) return todayISO(); if (ui.month < now) return ui.month+"-"+pad(daysIn(ui.month)); return ui.month+"-01"; }
function resetForm(keepSource){
  const src = $("#fSource").value;
  ui.editing = null; $("#expenseForm").reset();
  if (keepSource && src) $("#fSource").value = src;
  $("#fDate").value = defaultDate();
  $("#formTitle").textContent = "Add an expense"; $("#formSub").textContent = "Fill in what you bought and what you actually paid";
  $("#saveBtn").textContent = "Add expense"; $("#cancelEdit").hidden = true;
  $$("#expenseForm .err").forEach(e=>e.textContent=""); $$("#expenseForm [aria-invalid]").forEach(e=>e.removeAttribute("aria-invalid"));
  renderSlip();
}
function formatField(el){ const v = parseAmount(el.value); if (isFinite(v)) el.value = plain(v); }
function setErr(id, inputId, msg){ $(id).textContent = msg || ""; const inp = $(inputId); if (msg) inp.setAttribute("aria-invalid","true"); else inp.removeAttribute("aria-invalid"); return !msg; }
function submitForm(e){
  e.preventDefault();
  const v = formValues(), fin = effectiveFinal(v);
  let ok = true;
  ok = setErr("#eItem","#fItem", v.item ? "" : "Enter what you bought.") && ok;
  ok = setErr("#eDate","#fDate", /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? "" : "Pick the purchase date.") && ok;
  ok = setErr("#eOriginal","#fOriginal", isFinite(v.original) && v.original>0 ? "" : "Enter the price before discount.") && ok;
  let fe = "";
  if (!isFinite(fin) || fin<0) fe = "Enter what you paid, or leave it empty if there was no discount.";
  else if (isFinite(v.original) && fin>v.original) fe = "The final price can't be higher than the starting price.";
  ok = setErr("#eFinal","#fFinal", fe) && ok;
  if (!ok){ const first = $("#expenseForm [aria-invalid='true']"); if (first) first.focus(); return; }
  const ym = v.date.slice(0,7);
  const old = ui.editing ? state.expenses.find(x=>x.id===ui.editing) : null;
  const before = budgetStatus(summarize(rowsFor(ym)).paid - (old && old.date.slice(0,7)===ym ? +old.final : 0)).key;
  let id;
  if (old){ Object.assign(old,{item:v.item, source:v.source, store:v.store, date:v.date, original:round(v.original), final:round(fin)}); delete old.sample; id = old.id; }
  else { id = uid(); state.expenses.push({id, date:v.date, item:v.item, source:v.source, store:v.store, original:round(v.original), final:round(fin), created:Date.now()}); }
  const wasEditing = !!old;
  save(); ui.lastAdded = id; if (ym !== ui.month) ui.month = ym;
  const after = budgetStatus(summarize(rowsFor(ym)).paid);
  resetForm(true); renderAll();
  const sv = round(v.original - fin);
  if (after.key==="over" && before!=="over") toast(`Saved. You're now ${money(-after.left)} over your ${monthName(ym)} limit.`, "over");
  else if (after.key==="care" && before==="ok") toast(`Saved. You've used ${fmtPct(after.ratio)} of your monthly limit.`, "care");
  else toast(wasEditing ? "Changes saved" : sv>0 ? `Expense added — you saved ${money(sv)}` : "Expense added");
  $("#fItem").focus();
}
function startEdit(id){
  const r = state.expenses.find(x=>x.id===id); if (!r) return;
  ui.editing = id; renderSourcesSelects();
  if (![...$("#fSource").options].some(o=>o.value===r.source)){ const o=document.createElement("option"); o.value=o.textContent=r.source; $("#fSource").appendChild(o); }
  $("#fItem").value = r.item; $("#fSource").value = r.source; $("#fStore").value = r.store||"";
  $("#fDate").value = r.date; $("#fOriginal").value = plain(r.original); $("#fFinal").value = plain(r.final);
  $("#formTitle").textContent = "Edit expense"; $("#formSub").textContent = "Update the details and save";
  $("#saveBtn").textContent = "Save changes"; $("#cancelEdit").hidden = false;
  renderSlip(); flashTo($("#entryCard")); $("#fItem").focus({preventScroll:true});
}
function flashTo(card){
  card.scrollIntoView({behavior: reduceMotion?"auto":"smooth", block:"start"});
  if (!reduceMotion){ card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash"); }
}
function goAddExpense(date){
  if (location.hash!=="#expenses") location.hash = "expenses"; else showView("expenses");
  setTimeout(()=>{ if (ui.editing) resetForm(true); if (date) $("#fDate").value = date; renderSlip(); flashTo($("#entryCard")); $("#fItem").focus({preventScroll:true}); }, 60);
}

/* ---------- expenses table ---------- */
function deleteButtons(kind, id, label){
  return ui.pendingDelete===kind+":"+id
    ? `<button class="confirm" data-act="confirm-del" data-kind="${kind}" data-id="${id}">Delete?</button><button class="icon-btn" data-act="cancel-del" aria-label="Keep it"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`
    : `<button class="icon-btn" data-act="del" data-kind="${kind}" data-id="${id}" aria-label="Delete ${esc(label)}"><svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/></svg></button>`;
}
const EDIT_ICON = '<svg class="ico" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg>';
function renderTable(){
  const rows0 = rowsFor(ui.month), q = ui.search.toLowerCase();
  let rows = rows0.filter(r => (ui.filter==="all" || r.source===ui.filter) && (!q || (r.item+" "+(r.store||"")+" "+r.source).toLowerCase().includes(q)));
  const sorters = { "date-desc": (a,b)=> b.date.localeCompare(a.date) || (b.created||0)-(a.created||0), "date-asc": (a,b)=> a.date.localeCompare(b.date) || (a.created||0)-(b.created||0), "amount-desc": (a,b)=> b.final-a.final, "saved-desc": (a,b)=> (b.original-b.final)-(a.original-a.final) };
  rows.sort(sorters[ui.sort]);
  $("#tableTitle").textContent = monthName(ui.month)+" expenses";
  const sum = summarize(rows);
  $("#tableSub").textContent = rows.length===rows0.length ? plural(rows.length,"item") : `${rows.length} of ${rows0.length} items shown`;
  $("#tbody").innerHTML = rows.length ? rows.map(r=>{ const d = r.original - r.final;
    return `<tr data-id="${r.id}" class="${r.id===ui.lastAdded?"new":""}">
      <td class="num" style="white-space:nowrap">${niceDate(r.date)}</td>
      <td><div class="t-item">${esc(r.item)}</div>${r.store?`<div class="t-store">${esc(r.store)}</div>`:""}</td>
      <td><span class="tag">${esc(r.source)}</span></td><td class="r">${money(r.original)}</td>
      <td class="r">${d>0?`<span class="disc">− ${money(d)}</span> <span class="muted">${fmtPct(pct(d,r.original))}</span>`:`<span class="muted">—</span>`}</td>
      <td class="r"><b>${money(r.final)}</b></td>
      <td class="r"><div class="row-act">${ui.pendingDelete==="exp:"+r.id?"":`<button class="icon-btn" data-act="edit" data-id="${r.id}" aria-label="Edit ${esc(r.item)}">${EDIT_ICON}</button>`}${deleteButtons("exp", r.id, r.item)}</div></td></tr>`;}).join("")
    : `<tr><td colspan="7" class="empty" style="text-align:center;padding:28px">${rows0.length ? "No expenses match your search." : "No expenses for "+monthName(ui.month)+" yet. Use the form above to add one."}</td></tr>`;
  $("#tfoot").innerHTML = rows.length ? `<tr><td colspan="3">Total</td><td class="r">${money(sum.original)}</td><td class="r"><span class="disc">− ${money(sum.saved)}</span></td><td class="r">${money(sum.paid)}</td><td></td></tr>` : "";
  ui.lastAdded = null;
}
function handleRowAction(e){
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, kind = b.dataset.kind, id = b.dataset.id;
  if (act==="edit") startEdit(id);
  else if (act==="edit-inc") startEditIncome(id);
  else if (act==="del"){ ui.pendingDelete = kind+":"+id; renderAll(); const c=$(".confirm"); if(c) c.focus(); clearTimeout(ui._delT); ui._delT=setTimeout(()=>{ if(ui.pendingDelete===kind+":"+id){ ui.pendingDelete=null; renderAll(); } }, 5000); }
  else if (act==="cancel-del"){ ui.pendingDelete=null; renderAll(); }
  else if (act==="confirm-del" && !b.dataset.leaving){
    b.dataset.leaving = "1";
    const tr = b.closest("tr");
    if (tr && !reduceMotion){ tr.classList.add("leaving"); setTimeout(()=>finishDelete(kind, id), 200); }
    else finishDelete(kind, id);
  }
}
function finishDelete(kind, id){
  {
    const coll = {exp:"expenses", inc:"incomes", sav:"savings"}[kind];
    const r = state[coll].find(x=>x.id===id);
    state[coll] = state[coll].filter(x=>x.id!==id);
    state.deleted = (state.deleted||[]).concat(id).slice(-1000);
    ui.pendingDelete = null;
    if (kind==="exp" && ui.editing===id) resetForm(true);
    if (kind==="inc" && ui.editingIncome===id) resetIncome();
    save(); renderAll(); toast(`Deleted “${r ? (r.item||r.note||r.source||"entry") : "entry"}”`);
  }
}
["#tbody","#incBody","#svBody"].forEach(s=>$(s).addEventListener("click", handleRowAction));

/* ---------- income ---------- */
function renderIncome(){
  const ym = ui.month, rows = inMonth(state.incomes, ym).sort((a,b)=>a.date.localeCompare(b.date)||(a.created||0)-(b.created||0));
  const cf = cashflow(ym);
  countTo($("#iTotal"), cf.income, money);
  $("#iTotalNote").textContent = rows.length ? `From ${plural(rows.length,"source")}` : "Nothing recorded yet";
  countTo($("#iSpent"), cf.spent, money);
  $("#iSpentNote").textContent = cf.income ? `${fmtPct(pct(cf.spent,cf.income))} of income` : "—";
  $("#iLeft").textContent = (cf.left<0?"− ":"") + money(Math.abs(cf.left));
  $("#iLeft").style.color = cf.left<0 ? "var(--over)" : "";
  $("#iLeftNote").textContent = cf.income ? `After saving ${money(cf.saved)}` : "Add income to calculate";
  $("#incMonth").textContent = monthName(ym);
  $("#ciIncome").textContent = money(cf.income); $("#ciSpend").textContent = "− "+money(cf.spent); $("#ciSave").textContent = "− "+money(cf.saved);
  $("#ciLeftLbl").textContent = cf.left>=0 ? "Left over" : "Short by"; $("#ciLeft").textContent = money(Math.abs(cf.left));
  $("#ciLeft").style.color = cf.left<0 ? "var(--over)" : "var(--ok)";
  const fm = flowMessage(cf, ym); const m = $("#incMsg"); m.className = "slip-msg "+fm.tone; m.innerHTML = fm.text;
  $("#incTableTitle").textContent = "Income in " + monthName(ym);
  $("#incTableSub").textContent = plural(rows.length, "entry").replace("entrys","entries");
  $("#incBody").innerHTML = rows.length ? rows.map(r=>`<tr>
    <td style="white-space:nowrap">${niceDate(r.date)}</td><td><span class="tag">${esc(r.source)}</span></td><td>${esc(r.note)||'<span class="muted">—</span>'}</td>
    <td class="r"><b>${money(r.amount)}</b></td><td class="r">${fmtPct(pct(r.amount,cf.income))}</td>
    <td class="r"><div class="row-act">${ui.pendingDelete==="inc:"+r.id?"":`<button class="icon-btn" data-act="edit-inc" data-id="${r.id}" aria-label="Edit income">${EDIT_ICON}</button>`}${deleteButtons("inc", r.id, r.note||r.source)}</div></td></tr>`).join("")
    : `<tr><td colspan="6" class="empty" style="text-align:center;padding:28px">No income for ${monthName(ym)} yet. Add your salary and any other income above.</td></tr>`;
  $("#incFoot").innerHTML = rows.length ? `<tr><td colspan="3">Total income</td><td class="r">${money(cf.income)}</td><td class="r">100%</td><td></td></tr>` : "";
}
function resetIncome(){
  ui.editingIncome = null; $("#incomeForm").reset(); $("#iDate").value = defaultDate();
  $("#incFormTitle").textContent = "Add income"; $("#incSave").textContent = "Add income"; $("#incCancel").hidden = true;
  setErr("#eiAmount","#iAmount",""); setErr("#eiDate","#iDate","");
}
function startEditIncome(id){
  const r = state.incomes.find(x=>x.id===id); if (!r) return;
  ui.editingIncome = id; $("#iSource").value = r.source; $("#iDate").value = r.date; $("#iNote").value = r.note||""; $("#iAmount").value = plain(r.amount);
  $("#incFormTitle").textContent = "Edit income"; $("#incSave").textContent = "Save changes"; $("#incCancel").hidden = false;
  flashTo($("#incomeCard")); $("#iAmount").focus({preventScroll:true});
}
$("#incomeForm").addEventListener("submit", e=>{
  e.preventDefault();
  const amt = parseAmount($("#iAmount").value), date = $("#iDate").value;
  let ok = setErr("#eiAmount","#iAmount", amt>0 ? "" : "Enter the amount you received.");
  ok = setErr("#eiDate","#iDate", /^\d{4}-\d{2}-\d{2}$/.test(date) ? "" : "Pick the date you received it.") && ok;
  if (!ok) return;
  const data = { source: $("#iSource").value, note: $("#iNote").value.trim(), date, amount: round(amt) };
  const editing = ui.editingIncome;
  if (editing){ const r = state.incomes.find(x=>x.id===editing); if (r){ Object.assign(r, data); delete r.sample; } }
  else state.incomes.push(Object.assign({id:uid(), created:Date.now()}, data));
  save(); if (date.slice(0,7)!==ui.month) ui.month = date.slice(0,7);
  resetIncome(); renderAll();
  const cf = cashflow(ui.month);
  toast(editing ? "Income updated" : `Income added. Total for ${monthName(ui.month)}: ${money(cf.income)}`);
});
$("#incCancel").addEventListener("click", resetIncome);
$("#iAmount").addEventListener("blur", e=>formatField(e.target));

/* ---------- savings ---------- */
function savingEstimate(s){
  if (s.type==="gold" && s.units) return grams(s.units);
  if (s.type==="fx" && s.units) return fxMoney(s.units, s.fx);
  if (s.type==="sbn") return `≈ ${idr(s.amount*MARKET.sbn[0].rate/100*0.9/12)}/mo`;
  if (s.type==="bank") return `≈ ${idr(s.amount*MARKET.lps.idr/100*0.8)}/yr`;
  return "—";
}
function renderSavings(){
  const ym = ui.month, cf = cashflow(ym), rows = inMonth(state.savings, ym).sort((a,b)=>a.date.localeCompare(b.date)||(a.created||0)-(b.created||0));
  countTo($("#sMonth"), cf.saved, money);
  const goal = cf.income*state.target/100;
  const tf = $("#sTargetFill"); const r = goal ? Math.min(1, cf.saved/goal) : 0;
  tf.className = "meter-fill"; requestAnimationFrame(()=>{ tf.style.transform = `scaleX(${r})`; });
  $("#sTargetPct").textContent = cf.income ? `${fmtPct(cf.rate)} of income` : "No income recorded";
  $("#sTargetGoal").textContent = state.target && cf.income ? `Target ${state.target}% = ${money(goal)}` : "";
  const free = cf.income - cf.spent - cf.saved;
  $("#sFree").textContent = (free<0?"− ":"") + money(Math.abs(free));
  $("#sFree").style.color = free<0 ? "var(--over)" : "";
  $("#sFreeNote").textContent = cf.income ? "Income − spending − savings" : "Add income first";
  const total = sumBy(state.savings, s=>s.amount);
  countTo($("#sAll"), total, money);
  const g = sumBy(state.savings.filter(s=>s.type==="gold"), s=>s.units);
  $("#sAllNote").textContent = g ? `Includes ${grams(g)} of gold` : plural(state.savings.length,"entry").replace("entrys","entries");

  // form options
  const sel = $("#svType"); const cur = sel.value || "bank";
  sel.innerHTML = INSTRUMENTS.map(i=>`<option value="${i.key}">${esc(i.name)}</option>`).join("");
  sel.value = cur;
  const fxSel = $("#svFx"); const fxCur = fxSel.value || "USD";
  fxSel.innerHTML = MARKET.fx.rates.map(r=>`<option value="${r[0]}">${r[0]} — ${esc(r[1])}</option>`).join(""); fxSel.value = fxCur;
  const presets = [500000,1000000,2500000];
  if (goal - cf.saved > 0) presets.unshift(Math.round(goal - cf.saved));
  $("#svChips").innerHTML = presets.map((p,i)=>`<button type="button" class="chip" data-svamt="${p}">${i===0 && goal-cf.saved>0 ? "Reach target: "+idr(p) : idr(p)}</button>`).join("");
  renderSaveEstimate();

  $("#marketAsOf").textContent = "Prices as of " + MARKET.asOf;
  $("#instruments").innerHTML = INSTRUMENTS.map(i=>`
    <article class="inst">
      <div class="inst-top"><div class="inst-ico ${i.key==="gold"?"gold":""}">${ICONS[i.key]}</div><div><h3>${esc(i.name)}</h3><p class="tagline">${esc(i.tag)}</p></div></div>
      <div class="facts"><span class="fact ${i.risk[0]}">${esc(i.risk[1])}</span><span class="fact">${esc(i.access)}</span><span class="fact">${esc(i.min)}</span></div>
      <ul>${i.why.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>
      <div class="inst-live">${i.live()}</div>
      <div class="inst-actions"><button class="btn btn-ghost btn-sm" data-detail="${i.key}">View details</button>${i.key==="stock"?"":`<button class="btn btn-ghost btn-sm" data-pick="${i.key}">Save here</button>`}</div>
    </article>`).join("");
  $("#fxStrip").innerHTML = ["USD","SGD","EUR","JPY","SAR","AUD","GBP","CNY","MYR"].map(c=>{ const f = FX[c]; const u = c==="JPY"?100:1;
    return `<div class="fx-item"><div class="fx-code">${u===100?"100 ":"1 "}${c}</div><div class="fx-val">${idr(f.mid*u)}</div><div class="fx-sub">${esc(f.name)}</div></div>`; }).join("");

  $("#svTableTitle").textContent = "Savings in " + monthName(ym);
  $("#svTableSub").textContent = rows.length ? money(cf.saved) + " total" : "";
  $("#svBody").innerHTML = rows.length ? rows.map(s=>`<tr>
    <td style="white-space:nowrap">${niceDate(s.date)}</td><td><span class="tag">${esc(INST[s.type]?INST[s.type].name:s.type)}${s.fx?" · "+s.fx:""}</span></td><td>${esc(s.note)||'<span class="muted">—</span>'}</td>
    <td class="r"><b>${money(s.amount)}</b></td><td class="r">${savingEstimate(s)}</td><td class="r"><div class="row-act">${deleteButtons("sav", s.id, s.note||"saving")}</div></td></tr>`).join("")
    : `<tr><td colspan="6" class="empty" style="text-align:center;padding:28px">Nothing set aside in ${monthName(ym)} yet.</td></tr>`;
  $("#svFoot").innerHTML = rows.length ? `<tr><td colspan="3">Total</td><td class="r">${money(cf.saved)}</td><td></td><td></td></tr>` : "";
  const byType = {}; state.savings.forEach(s=>{ const k = INST[s.type]?INST[s.type].name:s.type; (byType[k]=byType[k]||{v:0,n:0}); byType[k].v+=+s.amount; byType[k].n++; });
  $("#svByType").innerHTML = barRows(Object.entries(byType).map(([k,v])=>({label:k, sub:plural(v.n,"entry").replace("entrys","entries"), value:v.v})), total, "No savings recorded yet.");
}
function estimateLines(type, amt, fxCode){
  const L = (a,b,cls) => `<div class="r-line ${cls||""}"><span>${a}</span><span>${b}</span></div>`;
  if (!(amt>0)) return { html: L("Amount","—"), msg:"" };
  if (type==="bank"){ const gross = amt*MARKET.lps.idr/100, net = gross*0.8;
    return { html: L("Amount", idr(amt)) + L(`Interest, 12 months at ${MARKET.lps.idr}%`, idr(gross)) + L("Tax on interest (20%)", "− "+idr(gross*0.2)) + L("Value after 1 year", idr(amt+net), "total"),
      msg: `About ${idr(net)} a year in interest if your bank pays the full ${MARKET.lps.idr}% LPS rate. Many savings accounts pay less; deposits pay closer to it.` }; }
  if (type==="gold"){ const g = amt/MARKET.gold.buy, back = g*MARKET.gold.buyback;
    return { html: L("Amount", idr(amt)) + L("Buying price", idr(MARKET.gold.buy)+"/g") + L("Gold you get", grams(g), "total") + L("If sold back today", idr(back)) + L("Difference", "− "+idr(amt-back), "result over"),
      msg: `You'd get about ${grams(g)}. Gold needs to rise about ${fmtPct(MARKET.gold.buy/MARKET.gold.buyback-1)} before selling back breaks even, so hold it for the long term.` }; }
  if (type==="sbn"){ const r = MARKET.sbn[0].rate, mo = amt*r/100/12, net = mo*0.9;
    return { html: L("Amount", idr(amt)) + L(`Coupon at ${r}% a year`, idr(mo)+"/mo") + L("Tax (10%)", "− "+idr(mo*0.1)+"/mo") + L("You receive", idr(net)+"/mo", "total") + L("Per year", idr(net*12)),
      msg: amt<1000000 ? "SBN Ritel starts at Rp 1,000,000. Save up a little more before the next offer opens." : `About ${idr(net)} a month, based on the latest SBR015T2 coupon. Check which series is open now.` }; }
  if (type==="mmf") return { html: L("Amount", idr(amt)) + L("Reference rate (BI Rate)", MARKET.bi.rate+"%") + L("Tax for you", "None", "total"),
      msg: "Returns change daily and usually sit close to deposit rates. Check the fund's fact sheet for its real 1-year return before you buy." };
  if (type==="fx"){ const f = FX[fxCode||"USD"], units = amt/f.sell, back = units*f.buy;
    return { html: L("Amount", idr(amt)) + L(`BI selling rate`, idr(f.sell*(f.code==="JPY"?100:1), 2)+(f.code==="JPY"?" / 100":"")) + L("You get", fxMoney(units, f.code), "total") + L("Exchanged back today", idr(back)) + L("Spread cost", "− "+idr(amt-back), "result over"),
      msg: `Based on Bank Indonesia's rate for ${MARKET.fx.date}. Banks and money changers add their own margin, so you'll usually get a little less.` }; }
  return { html: L("Amount", idr(amt)) + L("IHSG today", MARKET.ihsg.value.toLocaleString("id-ID",{maximumFractionDigits:2})), msg:"Stock prices change every trading day, so there's no estimate. Only invest money you won't need for 5+ years." };
}
function renderSaveEstimate(){
  const type = $("#svType").value || "bank"; $("#svFxWrap").hidden = type!=="fx";
  const amt = parseIDR($("#svAmount").value), cf = cashflow(($("#svDate").value||todayISO()).slice(0,7));
  $("#svHead").textContent = INST[type] ? INST[type].name : "—";
  const est = estimateLines(type, amt, $("#svFx").value);
  $("#svEstimate").innerHTML = est.html;
  const m = $("#svMsg"); const free = cf.income - cf.spent - cf.saved;
  let tone = "", text = est.msg || "Choose where to save and type an amount to see the estimate.";
  if (amt>0 && cf.income && amt > free){ tone = "over"; text = `This is ${idr(amt-Math.max(0,free))} more than what's left of this month's income after spending and savings (${idr(Math.max(0,free))}). ` + (est.msg||""); }
  else if (amt>0 && type==="stock"){ tone="care"; }
  m.className = "slip-msg "+tone; m.textContent = text;
}
function goSave(type, fx){
  if (location.hash!=="#savings") location.hash = "savings"; else showView("savings");
  setTimeout(()=>{ $("#svType").value = type; if (fx) $("#svFx").value = fx; renderSaveEstimate(); flashTo($("#saveCard")); $("#svAmount").focus({preventScroll:true}); }, 60);
}
["#svType","#svFx","#svDate"].forEach(s=>$(s).addEventListener("change", renderSaveEstimate));
$("#svAmount").addEventListener("input", renderSaveEstimate);
$("#svAmount").addEventListener("blur", e=>{ const v = parseIDR(e.target.value); if (isFinite(v)) e.target.value = v.toLocaleString("id-ID"); });
$("#svChips").addEventListener("click", e=>{ const c = e.target.closest("[data-svamt]"); if (!c) return; $("#svAmount").value = (+c.dataset.svamt).toLocaleString("id-ID"); setErr("#esvAmount","#svAmount",""); renderSaveEstimate(); });
$("#saveForm").addEventListener("submit", e=>{
  e.preventDefault();
  const amt = parseIDR($("#svAmount").value), date = $("#svDate").value, type = $("#svType").value;
  let ok = setErr("#esvAmount","#svAmount", amt>0 ? "" : "Enter how much you're setting aside.");
  ok = setErr("#esvDate","#svDate", /^\d{4}-\d{2}-\d{2}$/.test(date) ? "" : "Pick a date.") && ok;
  if (!ok) return;
  const s = mkSaving(date, type, amt, $("#svNote").value.trim(), $("#svFx").value); s.created = Date.now();
  state.savings.push(s); save();
  if (date.slice(0,7)!==ui.month) ui.month = date.slice(0,7);
  $("#svAmount").value = ""; $("#svNote").value = "";
  renderAll();
  const cf = cashflow(ui.month);
  toast(cf.left<0 ? `Saved, but savings now exceed what's left of your income by ${money(-cf.left)}` : `Added ${idr(amt)} to ${INST[type].name}`, cf.left<0 ? "care" : undefined);
});
document.addEventListener("click", e=>{
  const d = e.target.closest("[data-detail]"); if (d){ openInstrument(d.dataset.detail); return; }
  const p = e.target.closest("[data-pick]"); if (p){ goSave(p.dataset.pick); }
});

/* ---------- instrument details ---------- */
let calcType = null;
function srcLink(url, label){ return `<a href="${url}" target="_blank" rel="noopener">${esc(label)}</a>`; }
function calcBox(defaultAmt, withFx){
  return `<div class="calc-box"><label for="calcAmt" style="font-weight:600;font-size:13px">Try an amount</label>
    <div class="row"><div class="money" style="flex:1 1 200px"><span class="cur">Rp</span><input class="input" id="calcAmt" inputmode="numeric" value="${defaultAmt.toLocaleString("id-ID")}"></div>
    ${withFx?`<select class="select" id="calcFx" style="flex:0 1 200px">${MARKET.fx.rates.map(r=>`<option value="${r[0]}">${r[0]} — ${esc(r[1])}</option>`).join("")}</select>`:""}</div>
    <div class="calc-out" id="calcOut"></div></div>`;
}
function updateCalc(){
  const out = $("#calcOut"); if (!out) return;
  const amt = parseIDR($("#calcAmt").value);
  if (!(amt>0)){ out.textContent = "Type an amount in rupiah."; return; }
  if (calcType==="bank"){ const net = amt*MARKET.lps.idr/100*0.8; out.innerHTML = `After 1 year at up to ${MARKET.lps.idr}%: <b>${idr(amt+net)}</b> (interest ${idr(net)} after 20% tax).`; }
  else if (calcType==="gold"){ const g = amt/MARKET.gold.buy; out.innerHTML = `Buys about <b>${grams(g)}</b> of Antam gold. Selling it back today would return <b>${idr(g*MARKET.gold.buyback)}</b>.`; }
  else if (calcType==="sbn"){ out.innerHTML = MARKET.sbn.map(s=>`${s.series}: <b>${idr(amt*s.rate/100*0.9/12)}</b> a month after tax`).join("<br>") + (amt<1000000?`<br>Minimum purchase is Rp 1,000,000.`:""); }
  else if (calcType==="mmf"){ out.innerHTML = `If a fund returned the BI Rate (${MARKET.bi.rate}%) for a year: about <b>${idr(amt*MARKET.bi.rate/100)}</b>. Real returns vary by fund.`; }
  else if (calcType==="fx"){ const f = FX[$("#calcFx").value]; out.innerHTML = `${idr(amt)} buys about <b>${fxMoney(amt/f.sell, f.code)}</b> at Bank Indonesia's selling rate.`; }
}
function openInstrument(key){
  calcType = key; const i = INST[key];
  let html = "", title = i ? i.name : "Other currencies", sub = "";
  const why = i ? `<h3>Why save here</h3><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">${i.why.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>` : "";
  const saveBtn = k => `<div class="row"><button class="btn btn-primary btn-sm" data-savehere="${k}">Save here</button></div>`;
  if (key==="bank"){
    sub = "Savings accounts and time deposits";
    html = `<div class="kv">
      <div>LPS guarantee rate, commercial banks (IDR)</div><div>${MARKET.lps.idr}%</div>
      <div>LPS guarantee rate, rural banks (BPR)</div><div>${MARKET.lps.bpr}%</div>
      <div>LPS guarantee rate, foreign currency</div><div>${MARKET.lps.fx.toFixed(2)}%</div>
      <div>Valid for</div><div>${MARKET.lps.period}</div>
      <div>BI Rate (set ${MARKET.bi.date})</div><div>${MARKET.bi.rate}%</div>
      <div>Guaranteed up to</div><div>Rp 2 billion per bank</div>
      <div>Tax on interest</div><div>20%</div></div>
      ${why}${calcBox(5000000)}
      <p class="disclaimer">A deposit paying more than the LPS rate is not guaranteed. Emergency fund rule of thumb: 3–6 months of expenses.</p>
      <p class="src-links">Sources: ${srcLink(MARKET.lps.src,"LPS")} · ${srcLink(MARKET.bi.src,"Bank Indonesia")}</p>${saveBtn("bank")}`;
  } else if (key==="gold"){
    const spread = 1 - MARKET.gold.buyback/MARKET.gold.buy;
    sub = "Antam Logam Mulia prices, updated " + MARKET.gold.updated;
    html = `<div class="kv">
      <div>Buying price (1 g)</div><div>${idr(MARKET.gold.buy)}</div>
      <div>Buy-back price (1 g)</div><div>${idr(MARKET.gold.buyback)}</div>
      <div>Spread (cost of buying and selling)</div><div>${fmtPct(spread)}</div>
      <div>Antam BRANKAS digital gold (1 g)</div><div>${idr(MARKET.gold.brankas)}</div>
      <div>Silver (1 g)</div><div>${idr(MARKET.gold.silver)}</div>
      <div>About 0.5 g</div><div>${idr(MARKET.gold.buy*0.5)}</div>
      <div>About 5 g</div><div>${idr(MARKET.gold.buy*5)}</div>
      <div>About 10 g</div><div>${idr(MARKET.gold.buy*10)}</div></div>
      <p class="disclaimer">Bar prices per gram differ slightly by size; the larger sizes are an estimate from the 1 g price.</p>
      ${why}${calcBox(MARKET.gold.buy)}
      <p class="src-links">Source: ${srcLink(MARKET.gold.src,"logammulia.com — today's gold price")}</p>${saveBtn("gold")}`;
  } else if (key==="sbn"){
    sub = "Retail government bonds: ORI, SR, SBR, ST";
    html = `<h3>Latest series</h3><div class="table-wrap"><table><thead><tr><th>Series</th><th>Type</th><th>Tenor</th><th class="r">Coupon / yr</th><th>Offer period</th></tr></thead><tbody>
      ${MARKET.sbn.map(s=>`<tr><td><b>${s.series}</b></td><td>${esc(s.kind)}</td><td>${s.tenor}</td><td class="r">${s.rate.toFixed(2)}%</td><td style="white-space:nowrap">${s.offered}</td></tr>`).join("")}</tbody></table></div>
      <div class="kv"><div>Minimum purchase</div><div>Rp 1,000,000</div><div>Coupon paid</div><div>Monthly</div><div>Tax on coupon</div><div>10%</div><div>Buy through</div><div>Banks & apps appointed by the Ministry of Finance</div></div>
      <p class="disclaimer">Both offers above have closed. The government opens new retail series several times a year — check the schedule before saving for one.</p>
      ${why}${calcBox(5000000)}
      <p class="src-links">Source: ${srcLink(MARKET.sbnSrc,"DJPPR, Ministry of Finance")}</p>${saveBtn("sbn")}`;
  } else if (key==="mmf"){
    sub = "Reksa dana pasar uang";
    html = `<div class="kv">
      <div>Typical minimum</div><div>About Rp 10,000</div>
      <div>Money back after selling</div><div>Usually 1–2 business days</div>
      <div>Tax on your gains</div><div>None</div>
      <div>Supervised by</div><div>OJK</div>
      <div>Reference: BI Rate</div><div>${MARKET.bi.rate}%</div>
      <div>Reference: LPS deposit rate</div><div>${MARKET.lps.idr}%</div></div>
      ${why}${calcBox(1000000)}
      <p class="disclaimer">Returns aren't guaranteed. Compare funds by their 1-year return and fees on the fund fact sheet.</p>
      <p class="src-links">Reference: ${srcLink(MARKET.bi.src,"Bank Indonesia — BI Rate")}</p>${saveBtn("mmf")}`;
  } else if (key==="fx"){
    title = "Foreign currency vs rupiah"; sub = "Bank Indonesia transaction rates, " + MARKET.fx.date;
    html = `<div class="table-wrap"><table><thead><tr><th>Currency</th><th class="r">BI buys at</th><th class="r">BI sells at</th><th class="r">Middle rate</th><th class="r"><span class="muted">Save</span></th></tr></thead><tbody>
      ${MARKET.fx.rates.map(r=>`<tr><td><b>${r[2]===100?"100 ":""}${r[0]}</b> <span class="t-store">${esc(r[1])}</span></td><td class="r">${idr(r[4],2)}</td><td class="r">${idr(r[3],2)}</td><td class="r"><b>${idr((r[3]+r[4])/2,2)}</b></td><td class="r"><button class="btn btn-ghost btn-sm" data-savehere="fx" data-fx="${r[0]}">Save</button></td></tr>`).join("")}</tbody></table></div>
      ${INST.fx ? `<h3>Why save in another currency</h3><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">${INST.fx.why.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      ${calcBox(1000000, true)}
      <p class="disclaimer">These are Bank Indonesia's reference rates. Banks and money changers use their own rates, usually a little worse.</p>
      <p class="src-links">Source: ${srcLink(MARKET.fx.src,"Bank Indonesia — transaction rates")}</p>`;
    calcType = "fx";
  } else if (key==="stock"){
    const ih = MARKET.ihsg;
    sub = "Information only";
    html = `<div class="kv">
      <div>IHSG (Jakarta Composite Index)</div><div>${ih.value.toLocaleString("id-ID",{maximumFractionDigits:3})}</div>
      <div>Change from previous close (${ih.prev.toLocaleString("id-ID",{maximumFractionDigits:3})})</div><div style="color:${ih.pct<0?"var(--over)":"var(--ok)"}">${ih.pct>0?"+":""}${ih.pct}%</div>
      <div>LQ45 index</div><div>${ih.lq45.toLocaleString("id-ID",{maximumFractionDigits:3})}</div>
      <div>As of</div><div>${ih.time}</div>
      <div>Smallest purchase</div><div>1 lot = 100 shares</div>
      <div>Settlement</div><div>2 trading days after the trade</div></div>
      ${why}
      <h3>How to start</h3><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px"><li>Open an account with a securities company licensed by OJK</li><li>Start with an index fund or large, established companies</li><li>Don't use your emergency fund or money needed within 5 years</li></ul>
      <p class="disclaimer">Individual stock prices aren't listed here — they change every trading second. Use your broker's app for live prices.</p>
      <p class="src-links">Source: ${srcLink(ih.src,"Indonesia Stock Exchange (IDX)")}</p>`;
  }
  openModal(title, sub, html);
  updateCalc();
}

/* ---------- downloads ---------- */
const dlReady = (window.claude && typeof window.claude.use==="function") ? window.claude.use("downloads").catch(()=>null) : null;
async function offerFile(filename, data, mime){
  const dl = dlReady ? await dlReady : null;
  if (dl){
    try { await dl.save({filename, data}); toast("Saved "+filename); }
    catch(err){ const c = err && err.code; toast(c==="declined" ? "Download cancelled" : c==="rate_limited" ? "A download prompt is already open" : "Downloads aren't available in this view"); }
    return;
  }
  const blob = data instanceof Blob ? data : new Blob([data], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
  toast("Downloaded "+filename);
}
const scopeFilter = arr => (ui.scope==="all" ? arr.slice() : inMonth(arr, ui.month)).sort((a,b)=>a.date.localeCompare(b.date) || (a.created||0)-(b.created||0));
const scopeRows = () => scopeFilter(state.expenses);
const scopeTag = () => ui.scope==="all" ? "all-months" : ui.month;
const scopeLabel = () => ui.scope==="all" ? "All months" : monthName(ui.month);
const monthsIn = rows => Array.from(new Set(rows.map(r=>r.date.slice(0,7)))).sort();
function scopeMonths(){ return ui.scope==="all" ? monthsIn([...state.expenses, ...state.incomes, ...state.savings]) : [ui.month]; }
const STATUS_TXT = {none:"No limit",ok:"On track",care:"Near limit",over:"Over limit"};

function downloadXlsx(){
  if (!window.XLSX){ toast("Excel export needs an internet connection to load. Try CSV instead.", "care"); return; }
  const months = scopeMonths();
  if (!months.length){ toast("Nothing to export for "+scopeLabel()); return; }
  const X = window.XLSX, moneyFmt = cfg().dec ? "#,##0.00" : "#,##0";
  const fmt = (ws, moneyCols, pctCols, startRow) => {
    const rg = X.utils.decode_range(ws["!ref"]);
    for (let R=startRow||1; R<=rg.e.r; R++){
      moneyCols.forEach(C=>{ const c = ws[X.utils.encode_cell({r:R,c:C})]; if (c && typeof c.v==="number") c.z = moneyFmt; });
      (pctCols||[]).forEach(C=>{ const c = ws[X.utils.encode_cell({r:R,c:C})]; if (c && typeof c.v==="number") c.z = "0.0%"; });
    }
  };
  const wb = X.utils.book_new();
  // Summary
  const sum = [["Pocket Ledger — "+ownerName()+" — "+scopeLabel()], ["Currency", state.currency, "", "Monthly spending limit", state.budget||"Not set", "", "Savings target", state.target/100], [],
    ["Month","Income","Spending","Savings","Left over","Purchases","Discounts","Spending limit","Limit left","Limit status","Savings rate","Result"]];
  months.forEach(m=>{ const cf = cashflow(m), s = summarize(rowsFor(m)), st = budgetStatus(s.paid);
    sum.push([monthName(m), cf.income, cf.spent, cf.saved, cf.left, s.count, s.saved, state.budget||"", state.budget? st.left : "", STATUS_TXT[st.key], cf.income? cf.rate : "", flowMessage(cf,m).text.replace(/<[^>]+>/g,"")]); });
  const ws0 = X.utils.aoa_to_sheet(sum);
  ws0["!cols"] = [{wch:18},{wch:15},{wch:15},{wch:15},{wch:15},{wch:10},{wch:14},{wch:15},{wch:15},{wch:12},{wch:12},{wch:90}];
  fmt(ws0,[1,2,3,4,6,7,8],[10],4);
  const t = ws0[X.utils.encode_cell({r:1,c:4})]; if (t && typeof t.v==="number") t.z = moneyFmt;
  const tg = ws0[X.utils.encode_cell({r:1,c:7})]; if (tg) tg.z = "0%";
  X.utils.book_append_sheet(wb, ws0, "Summary");
  // Daily
  const daily = [["Date","Day","Purchases","Starting price","Discount","Paid","Month so far","Daily limit","Vs limit","Items"]];
  months.forEach(m=>{ const lim = dailyLimit(m);
    dayTable(m).forEach(d=>{ daily.push([d.date, weekday(d.date), d.count, d.original, d.saved, d.paid, d.running, lim? Math.round(lim) : "", lim ? (d.paid>lim ? "Over by "+plain(round(d.paid-lim)) : d.count ? "Under by "+plain(round(lim-d.paid)) : "") : "", d.items.map(r=>r.item+" ("+plain(r.final)+")").join("; ")]); });
    const s = summarize(rowsFor(m)); daily.push(["Total "+monthName(m),"", s.count, s.original, s.saved, s.paid, "", "", "", ""]); daily.push([]);
  });
  const ws1 = X.utils.aoa_to_sheet(daily);
  ws1["!cols"] = [{wch:20},{wch:6},{wch:10},{wch:15},{wch:13},{wch:15},{wch:15},{wch:13},{wch:18},{wch:70}];
  fmt(ws1,[3,4,5,6,7]);
  X.utils.book_append_sheet(wb, ws1, "Daily");
  // Expenses
  const rows = scopeRows(), s = summarize(rows);
  const aoa = [["Date","Item","Bought from","Store / app","Starting price","Discount","Discount %","Final price"]].concat(rows.map(r=>[r.date, r.item, r.source, r.store||"", +r.original, +(r.original-r.final), r.original? (r.original-r.final)/r.original : 0, +r.final]));
  aoa.push([]); aoa.push(["Total","","","", s.original, s.saved, pct(s.saved,s.original), s.paid]);
  const ws2 = X.utils.aoa_to_sheet(aoa);
  ws2["!cols"] = [{wch:12},{wch:34},{wch:20},{wch:18},{wch:16},{wch:14},{wch:11},{wch:16}];
  fmt(ws2,[4,5,7],[6]);
  X.utils.book_append_sheet(wb, ws2, "Expenses");
  // Income
  const inc = scopeFilter(state.incomes);
  const ai = [["Date","Type","Description","Amount"]].concat(inc.map(r=>[r.date, r.source, r.note||"", +r.amount]));
  ai.push([]); ai.push(["Total","","", sumBy(inc,r=>r.amount)]);
  const ws3 = X.utils.aoa_to_sheet(ai); ws3["!cols"] = [{wch:12},{wch:22},{wch:34},{wch:16}]; fmt(ws3,[3]);
  X.utils.book_append_sheet(wb, ws3, "Income");
  // Savings
  const sv = scopeFilter(state.savings);
  const as = [["Date","Where","Currency","Note","Amount (IDR)","Rate used","Units (g / foreign)"]].concat(sv.map(r=>[r.date, INST[r.type]?INST[r.type].name:r.type, r.fx||"", r.note||"", +r.amount, r.rate||"", r.units ? Math.round(r.units*1000)/1000 : ""]));
  as.push([]); as.push(["Total","","","", sumBy(sv,r=>r.amount)]);
  const ws4 = X.utils.aoa_to_sheet(as); ws4["!cols"] = [{wch:12},{wch:28},{wch:9},{wch:30},{wch:16},{wch:14},{wch:18}]; fmt(ws4,[4]);
  X.utils.book_append_sheet(wb, ws4, "Savings");
  // By source
  const by = {}; rows.forEach(r=>{ (by[r.source]=by[r.source]||{n:0,p:0,d:0}); by[r.source].n++; by[r.source].p+=+r.final; by[r.source].d+=r.original-r.final; });
  const ab = [["Bought from","Purchases","Discounts","Paid","Share"]].concat(Object.entries(by).sort((a,b)=>b[1].p-a[1].p).map(([k,v])=>[k, v.n, v.d, v.p, pct(v.p,s.paid)]));
  const ws5 = X.utils.aoa_to_sheet(ab); ws5["!cols"] = [{wch:22},{wch:10},{wch:14},{wch:16},{wch:9}]; fmt(ws5,[2,3],[4]);
  X.utils.book_append_sheet(wb, ws5, "By source");
  const buf = X.write(wb, {bookType:"xlsx", type:"array"});
  offerFile(`pocket-ledger_${ownerTag()}_${scopeTag()}.xlsx`, new Blob([buf]), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
function downloadCsv(){
  const rows = scopeRows();
  if (!rows.length){ toast("No expenses to export for "+scopeLabel()); return; }
  const q = v => { const s = String(v==null?"":v); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const lines = [["Date","Item","Bought from","Store / app","Starting price","Discount","Discount %","Final price"].join(",")];
  rows.forEach(r=> lines.push([r.date, r.item, r.source, r.store||"", r.original, round(r.original-r.final), (pct(r.original-r.final,r.original)*100).toFixed(1), r.final].map(q).join(",")));
  offerFile(`pocket-ledger_${ownerTag()}_${scopeTag()}.csv`, "﻿"+lines.join("\r\n"), "text/csv");
}
function downloadBackup(){
  const data = { app:"Pocket Ledger", version:2, exportedAt: new Date().toISOString(), currency: state.currency, budget: state.budget, target: state.target, sources: state.sources, expenses: state.expenses, incomes: state.incomes, savings: state.savings };
  offerFile(`pocket-ledger_backup_${ownerTag()}_${todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
}
function reportHtml(){
  const months = scopeMonths(), rows = scopeRows(), s = summarize(rows);
  const inc = scopeFilter(state.incomes), sv = scopeFilter(state.savings);
  const I = sumBy(inc,r=>r.amount), V = sumBy(sv,r=>r.amount);
  const msgs = months.map(m=>{ const ms = summarize(rowsFor(m)), st = budgetStatus(ms.paid), fm = flowMessage(cashflow(m), m);
    return `<div class="msg ${st.key}"><b>${monthName(m)} · spending:</b> ${statusMessage(ms, st, m)}</div><div class="msg ${fm.tone}"><b>${monthName(m)} · income:</b> ${fm.text}</div>`; }).join("");
  const monthRows = months.map(m=>{ const cf=cashflow(m), ms=summarize(rowsFor(m)), st=budgetStatus(ms.paid);
    return `<tr><td>${monthName(m)}</td><td class="r">${money(cf.income)}</td><td class="r">${money(cf.spent)}</td><td class="r">${money(cf.saved)}</td><td class="r ${cf.left<0?"over":"ok"}"><b>${cf.left<0?"− ":""}${money(Math.abs(cf.left))}</b></td><td class="r ${st.key}">${state.budget?(st.left>=0?money(st.left)+" left":"over by "+money(-st.left)):"—"}</td></tr>`; }).join("");
  const dayRows = months.map(m=>{ const lim = dailyLimit(m); return dayTable(m).filter(d=>d.count).map(d=>`<tr><td>${weekday(d.date)}, ${longDate(d.date)}</td><td class="r">${d.count}</td><td class="r">− ${money(d.saved)}</td><td class="r"><b>${money(d.paid)}</b></td><td class="r">${money(d.running)}</td><td class="r ${lim&&d.paid>lim?"over":"ok"}">${lim?(d.paid>lim?"+ "+money(round(d.paid-lim))+" over":money(round(lim-d.paid))+" under"):"—"}</td></tr>`).join(""); }).join("");
  const itemRows = rows.map(r=>`<tr><td>${longDate(r.date)}</td><td>${esc(r.item)}${r.store?`<div class="sub">${esc(r.store)}</div>`:""}</td><td>${esc(r.source)}</td><td class="r">${money(r.original)}</td><td class="r">${r.original>r.final?"− "+money(r.original-r.final):"—"}</td><td class="r"><b>${money(r.final)}</b></td></tr>`).join("");
  const incRows = inc.map(r=>`<tr><td>${longDate(r.date)}</td><td>${esc(r.source)}</td><td>${esc(r.note)}</td><td class="r"><b>${money(r.amount)}</b></td></tr>`).join("");
  const svRows = sv.map(r=>`<tr><td>${longDate(r.date)}</td><td>${esc(INST[r.type]?INST[r.type].name:r.type)}${r.fx?" ("+r.fx+")":""}</td><td>${esc(r.note)}</td><td class="r"><b>${money(r.amount)}</b></td><td class="r">${savingEstimate(r)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket Ledger report — ${esc(scopeLabel())}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#10201e;margin:0;background:#f3f6f5;line-height:1.5}
.page{max-width:900px;margin:32px auto;background:#fff;padding:40px;border-radius:18px;box-shadow:0 10px 40px -12px rgba(0,0,0,.15)}
h1{margin:0;font-size:28px;letter-spacing:-.02em}.meta{color:#6b7d7a;font-size:13px;margin-top:4px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#6b7d7a;margin:32px 0 10px}
.calc{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}.calc div{background:#eef4f2;border-radius:12px;padding:14px 16px}.calc span{display:block;font-size:11px;color:#6b7d7a;font-weight:600;text-transform:uppercase;letter-spacing:.06em}.calc b{font-size:18px}
.msg{padding:10px 14px;border-radius:12px;background:#eef4f2;margin:8px 0;font-size:14px}.msg.over{background:#fbe9e7}.msg.care{background:#fdf1dc}.msg.ok{background:#e6f4ec}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7d7a;border-bottom:1px solid #cfd9d7;padding:8px 6px}td{padding:7px 6px;border-bottom:1px solid #e6ecea;vertical-align:top}.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.sub{font-size:11px;color:#6b7d7a}td.over{color:#bb3027;font-weight:600}td.ok{color:#17784a}
tfoot td{font-weight:700;border:0}.bar{display:flex;justify-content:flex-end;margin-bottom:12px}.bar button{font:inherit;font-weight:600;background:#0b7a6c;color:#fff;border:0;border-radius:999px;padding:10px 18px;cursor:pointer}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;padding:0}.bar{display:none}h2{break-after:avoid}tr{break-inside:avoid}}
@media (max-width:640px){.page{padding:20px;margin:0;border-radius:0}.calc{grid-template-columns:1fr 1fr}}
</style></head><body><div class="page">
<div class="bar"><button onclick="window.print()">Print or save as PDF</button></div>
<h1>Monthly money report</h1><div class="meta">${esc(ownerName())} · ${esc(scopeLabel())} · ${plural(rows.length,"purchase")} · created ${longDate(todayISO())}</div>
<div class="calc"><div><span>Income</span><b>${money(I)}</b></div><div><span>Spending</span><b>${money(s.paid)}</b></div><div><span>Savings</span><b>${money(V)}</b></div><div><span>${I-s.paid-V<0?"Short by":"Left over"}</span><b>${money(Math.abs(I-s.paid-V))}</b></div></div>
<h2>Result</h2>${msgs}
<h2>By month</h2><table><thead><tr><th>Month</th><th class="r">Income</th><th class="r">Spending</th><th class="r">Savings</th><th class="r">Left over</th><th class="r">Spending limit</th></tr></thead><tbody>${monthRows}</tbody></table>
<h2>Spending calculation</h2><table><tbody><tr><td>Price before discount</td><td class="r">${money(s.original)}</td></tr><tr><td>Discounts</td><td class="r">− ${money(s.saved)}</td></tr><tr><td><b>You paid</b></td><td class="r"><b>${money(s.paid)}</b></td></tr></tbody></table>
<h2>Day by day</h2><table><thead><tr><th>Date</th><th class="r">Purchases</th><th class="r">Discounts</th><th class="r">Paid</th><th class="r">Month so far</th><th class="r">Vs daily limit</th></tr></thead><tbody>${dayRows||'<tr><td colspan="6">No spending.</td></tr>'}</tbody></table>
<h2>Income</h2><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="r">Amount</th></tr></thead><tbody>${incRows||'<tr><td colspan="4">No income recorded.</td></tr>'}</tbody><tfoot><tr><td colspan="3">Total</td><td class="r">${money(I)}</td></tr></tfoot></table>
<h2>Savings</h2><table><thead><tr><th>Date</th><th>Where</th><th>Note</th><th class="r">Amount</th><th class="r">Estimate</th></tr></thead><tbody>${svRows||'<tr><td colspan="5">No savings recorded.</td></tr>'}</tbody><tfoot><tr><td colspan="3">Total</td><td class="r">${money(V)}</td><td></td></tr></tfoot></table>
<h2>All expenses</h2><table><thead><tr><th>Date</th><th>Item</th><th>Bought from</th><th class="r">Starting price</th><th class="r">Discount</th><th class="r">Final price</th></tr></thead><tbody>${itemRows||'<tr><td colspan="6">No expenses.</td></tr>'}</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="r">${money(s.original)}</td><td class="r">− ${money(s.saved)}</td><td class="r">${money(s.paid)}</td></tr></tfoot></table>
</div></body></html>`;
}
function downloadReport(){ if (!scopeMonths().length){ toast("Nothing to export for "+scopeLabel()); return; } offerFile(`pocket-ledger_report_${ownerTag()}_${scopeTag()}.html`, reportHtml(), "text/html"); }

/* ---------- import ---------- */
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
$("#importFile").addEventListener("change", e=>{
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const ex = (data.expenses||[]).filter(r=>r && typeof r.item==="string" && validDate(r.date) && isFinite(+r.original) && isFinite(+r.final)).map(r=>({id:r.id||uid(), date:r.date, item:r.item, source:r.source||"Other", store:r.store||"", original:+r.original, final:+r.final, created:r.created||Date.now()}));
      const inc = (data.incomes||[]).filter(r=>r && validDate(r.date) && isFinite(+r.amount)).map(r=>({id:r.id||uid(), date:r.date, source:r.source||"Other", note:r.note||"", amount:+r.amount, created:r.created||Date.now()}));
      const sv = (data.savings||[]).filter(r=>r && validDate(r.date) && isFinite(+r.amount) && INST[r.type]).map(r=>Object.assign({}, r, {id:r.id||uid(), amount:+r.amount}));
      if (!ex.length && !inc.length && !sv.length) throw new Error("empty");
      ui.pendingImport = { ex, inc, sv, budget: Number(data.budget)||0, target: isFinite(+data.target)?+data.target:null, currency: CURRENCIES[data.currency]?data.currency:null, sources: Array.isArray(data.sources)?data.sources:null };
      $("#importText").innerHTML = `Found <b>${plural(ex.length,"expense")}</b>, <b>${inc.length} income ${inc.length===1?"entry":"entries"}</b> and <b>${sv.length} savings ${sv.length===1?"entry":"entries"}</b>. Add them to your current data, or replace everything?`;
      $("#importPanel").hidden = false;
    } catch(err){ toast("That file isn't a Pocket Ledger backup. Choose the .json file you downloaded from this app.", "over"); }
    e.target.value = "";
  };
  reader.readAsText(file);
});
$("#importMerge").addEventListener("click", ()=>{
  const p = ui.pendingImport; if (!p) return; let added = 0;
  [["expenses",p.ex],["incomes",p.inc],["savings",p.sv]].forEach(([k,list])=>{ const ids = new Set(state[k].map(r=>r.id)); list.forEach(r=>{ if (!ids.has(r.id)){ state[k].push(r); added++; } }); });
  if (p.sources) p.sources.forEach(s=>{ if(!state.sources.includes(s)) state.sources.push(s); });
  ui.pendingImport=null; $("#importPanel").hidden = true; save(); renderAll(); toast(`Added ${plural(added,"entry").replace("entrys","entries")}`);
});
$("#importReplace").addEventListener("click", ()=>{
  const p = ui.pendingImport; if (!p) return;
  state.expenses = p.ex; state.incomes = p.inc; state.savings = p.sv;
  if (p.budget) state.budget = p.budget; if (p.target!=null) state.target = p.target; if (p.currency) state.currency = p.currency; if (p.sources && p.sources.length) state.sources = p.sources;
  ui.pendingImport=null; $("#importPanel").hidden = true; save(); renderAll(); toast("Backup restored");
});
$("#importCancel").addEventListener("click", ()=>{ ui.pendingImport=null; $("#importPanel").hidden = true; });

/* ---------- reports view ---------- */
function renderReports(){
  $("#scopeMonth").textContent = monthName(ui.month);
  $("#scopeMonth").setAttribute("aria-pressed", String(ui.scope==="month"));
  $("#scopeAll").setAttribute("aria-pressed", String(ui.scope==="all"));
  const rows = scopeRows(), s = summarize(rows), I = sumBy(scopeFilter(state.incomes),r=>r.amount), V = sumBy(scopeFilter(state.savings),r=>r.amount);
  $("#scopeNote").textContent = scopeMonths().length ? `${scopeLabel()}: income ${money(I)} · spending ${money(s.paid)} (${plural(rows.length,"purchase")}) · savings ${money(V)}` : `Nothing recorded in ${scopeLabel()} yet.`;
  $("#dlXlsx").disabled = !window.XLSX; $("#dlXlsx").title = window.XLSX ? "" : "Needs an internet connection";
}

/* ---------- settings ---------- */
function renderSettings(){
  const bi = $("#sBudget");
  if (document.activeElement !== bi) bi.value = state.budget ? plain(state.budget) : "";
  const presets = state.currency==="IDR" ? [3000000,5000000,7500000,10000000] : [1000,2000,3000,5000];
  $("#budgetChips").innerHTML = presets.map(p=>`<button type="button" class="chip" data-budget="${p}" aria-pressed="${state.budget===p}">${state.currency==="IDR"? "Rp "+compact(p).replace("M"," mio") : money(p)}</button>`).join("");
  const now = summarize(rowsFor(currentYM())).paid;
  $("#budgetNow").textContent = state.budget ? `This month you've spent ${money(now)} of ${money(state.budget)} (${fmtPct(now/state.budget)}). Daily limit: ${money(round(dailyLimit(currentYM())))}.` : "No limit set. The dashboard will only show totals.";
  $("#targetChips").innerHTML = [0,10,15,20,25,30].map(t=>`<button type="button" class="chip" data-target="${t}" aria-pressed="${state.target===t}">${t?t+"%":"No target"}</button>`).join("");
  $("#sCurrency").value = state.currency;
  $("#srcChips").innerHTML = state.sources.map((s,i)=>`<span class="src-chip">${esc(s)}<button type="button" data-rm="${i}" aria-label="Remove ${esc(s)}"><svg class="ico" style="width:14px;height:14px" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>`).join("");
  const ms = monthsIn([...state.expenses, ...state.incomes, ...state.savings]);
  $("#dataStats").textContent = `${plural(state.expenses.length,"expense")}, ${state.incomes.length} income and ${state.savings.length} savings entries across ${plural(ms.length,"month")}.`;
  const w = $("#wipeBtn"); if (!w.dataset.armed) w.textContent = "Delete everything";
}
$("#budgetChips").addEventListener("click", e=>{ const c=e.target.closest("[data-budget]"); if(!c) return; $("#sBudget").value = plain(+c.dataset.budget); });
$("#targetChips").addEventListener("click", e=>{ const c=e.target.closest("[data-target]"); if(!c) return; state.target = +c.dataset.target; save(); renderAll(); toast(state.target ? `Savings target set to ${state.target}% of income` : "Savings target removed"); });
$("#saveBudget").addEventListener("click", ()=>{
  const v = parseAmount($("#sBudget").value);
  if (!(v>0)){ toast("Enter a limit above zero, or choose Remove limit.", "care"); $("#sBudget").focus(); return; }
  state.budget = round(v); save(); renderAll();
  const st = budgetStatus(summarize(rowsFor(currentYM())).paid);
  toast(st.key==="over" ? `Limit saved. You're already ${money(-st.left)} over this month.` : `Limit saved: ${money(state.budget)} per month`, st.key==="over"?"over":undefined);
});
$("#clearBudget").addEventListener("click", ()=>{ state.budget = 0; save(); renderAll(); toast("Monthly limit removed"); });
$("#sBudget").addEventListener("blur", e=>formatField(e.target));
$("#sBudget").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); $("#saveBudget").click(); } });
$("#sCurrency").addEventListener("change", e=>{ state.currency = e.target.value; save(); renderAll(); toast("Display currency changed to "+state.currency); });
$("#srcChips").addEventListener("click", e=>{ const b=e.target.closest("[data-rm]"); if(!b) return; const s=state.sources[+b.dataset.rm]; if(state.sources.length<=1){ toast("Keep at least one source"); return; } state.sources.splice(+b.dataset.rm,1); save(); renderAll(); toast(`Removed “${s}”. Existing expenses keep it.`); });
$("#addSourceForm").addEventListener("submit", e=>{ e.preventDefault(); const v=$("#newSource").value.trim(); if(!v) return; if(state.sources.some(s=>s.toLowerCase()===v.toLowerCase())){ toast("That source is already in the list"); return; } state.sources.push(v); $("#newSource").value=""; save(); renderAll(); toast(`Added “${v}”`); });
$("#wipeBtn").addEventListener("click", e=>{
  const b = e.currentTarget;
  if (!b.dataset.armed){ b.dataset.armed="1"; b.textContent="Tap again to delete everything"; setTimeout(()=>{ delete b.dataset.armed; b.textContent="Delete everything"; }, 4000); return; }
  delete b.dataset.armed; state.deleted = (state.deleted||[]).concat([...state.expenses, ...state.incomes, ...state.savings].map(x=>x.id)).slice(-1000); state.expenses = []; state.incomes = []; state.savings = []; state.onboardHidden = false; save(); resetForm(); resetIncome(); renderAll(); toast("All entries deleted");
});

/* ---------- wiring ---------- */
function setMonth(ym, dir){
  ui.month = ym;
  if (!reduceMotion && dir){
    const v = $("#view-"+ui.view), lbl = $("#monthLabel");
    v.classList.remove("slide-l","slide-r","entering"); lbl.classList.remove("swap"); void v.offsetWidth;
    v.classList.add(dir>0 ? "slide-l" : "slide-r"); lbl.classList.add("swap");
    clearTimeout(ui._slideT); ui._slideT = setTimeout(()=>{ v.classList.remove("slide-l","slide-r"); lbl.classList.remove("swap"); }, 700);
  }
  if (!ui.editing) $("#fDate").value = defaultDate();
  if (!ui.editingIncome) $("#iDate").value = defaultDate();
  $("#svDate").value = defaultDate();
  renderAll();
}
$("#prevMonth").addEventListener("click", ()=>setMonth(shiftMonth(ui.month,-1), -1));
$("#nextMonth").addEventListener("click", ()=>setMonth(shiftMonth(ui.month,1), 1));
$("#addBtn").addEventListener("click", ()=>{
  if (ui.view==="income"){ flashTo($("#incomeCard")); $("#iAmount").focus({preventScroll:true}); return; }
  if (ui.view==="savings"){ flashTo($("#saveCard")); $("#svAmount").focus({preventScroll:true}); return; }
  if (effectiveRole()==="child"){ go("income"); setTimeout(()=>{ flashTo($("#incomeCard")); $("#iAmount").focus({preventScroll:true}); }, 80); return; }
  goAddExpense();
});
$("#expenseForm").addEventListener("submit", submitForm);
["#fItem","#fOriginal","#fFinal","#fDate","#fSource"].forEach(s=>$(s).addEventListener("input", ()=>{ renderSlip(); const err = $(s.replace("#f","#e")); if (err && err.textContent){ err.textContent=""; $(s).removeAttribute("aria-invalid"); } }));
["#fOriginal","#fFinal"].forEach(s=>$(s).addEventListener("blur", e=>{ formatField(e.target); renderSlip(); }));
$("#discChips").addEventListener("click", e=>{
  const c = e.target.closest("[data-disc]"); if (!c) return;
  const o = parseAmount($("#fOriginal").value);
  if (!(o>0)){ setErr("#eOriginal","#fOriginal","Enter the starting price first."); $("#fOriginal").focus(); return; }
  $("#fFinal").value = plain(round(o*(1-(+c.dataset.disc)/100))); setErr("#eFinal","#fFinal",""); renderSlip();
});
$("#resetForm").addEventListener("click", ()=>resetForm(false));
$("#cancelEdit").addEventListener("click", ()=>resetForm(true));
$("#search").addEventListener("input", e=>{ ui.search = e.target.value; renderTable(); });
$("#filterSource").addEventListener("change", e=>{ ui.filter = e.target.value; renderTable(); });
$("#sortBy").addEventListener("change", e=>{ ui.sort = e.target.value; renderTable(); });
$("#scopeMonth").addEventListener("click", ()=>{ ui.scope="month"; renderReports(); });
$("#scopeAll").addEventListener("click", ()=>{ ui.scope="all"; renderReports(); });
$("#dlXlsx").addEventListener("click", downloadXlsx);
$("#dlCsv").addEventListener("click", downloadCsv);
$("#dlBackup").addEventListener("click", downloadBackup);
$("#dlReport").addEventListener("click", downloadReport);
document.addEventListener("keydown", e=>{ if (e.key==="Escape" && !modal.open){ if (ui.editing) resetForm(true); if (ui.editingIncome) resetIncome(); } });
window.addEventListener("hashchange", route);
window.addEventListener("storage", e=>{ if (session && !ui.readOnly && MODE==="local" && e.key===storeKey()){ state = load(); renderAll(); } });

/* ---------- responsive table labels ---------- */
function labelTables(root){
  (root||document).querySelectorAll(".table-wrap table").forEach(t=>{
    const heads = [...t.querySelectorAll("thead th")].map(th=>th.textContent.trim());
    t.querySelectorAll("tbody tr, tfoot tr").forEach(tr=>{ let i=0; [...tr.children].forEach(td=>{ if (!td.hasAttribute("data-label")) td.setAttribute("data-label", td.colSpan>1 ? "" : (heads[i]||"")); i += td.colSpan||1; }); });
  });
}
let lblQueued = false;
new MutationObserver(()=>{ if (lblQueued) return; lblQueued = true; requestAnimationFrame(()=>{ lblQueued = false; labelTables(); }); })
  .observe(document.body, {childList:true, subtree:true});

/* ---------- accounts: roles ---------- */
function effectiveRole(){ return ui.viewing ? ui.viewing.role : (session ? session.role : "adult"); }
function ownerTag(){ return (ui.viewing || session || {id:"me"}).id; }
function ownerName(){ return (ui.viewing || session || {name:""}).name; }
function allowedViews(){
  if (!session) return [];
  if (session.role==="superadmin"){
    if (!ui.viewing) return ["family"];
    return ["family"].concat(ui.viewing.role==="child" ? ["dashboard","income","savings","reports"] : ["dashboard","expenses","daily","income","savings","reports"]);
  }
  return ROLE_VIEWS[session.role] || ROLE_VIEWS.adult;
}
function go(view){ if (location.hash === "#"+view) showView(view, true); else location.hash = view; }
function applyRole(){
  const b = document.body;
  b.classList.toggle("role-child", effectiveRole()==="child");
  b.classList.toggle("role-admin", !!session && session.role==="superadmin");
  b.classList.toggle("readonly", ui.readOnly);
  if (session){
    const av = $("#meAvatar");
    av.textContent = INITIALS[session.id] || session.name[0];
    av.className = "avatar av-" + session.id;
    $("#meName").textContent = session.name;
  }
  const vb = $("#viewingBanner");
  vb.hidden = !ui.viewing;
  if (ui.viewing) $("#viewingTitle").textContent = `Viewing ${ui.viewing.name}'s ledger`;
}
function updateNav(){
  const allowed = allowedViews();
  $$(".nav a").forEach(a=>{ a.hidden = !allowed.includes(a.dataset.view); });
  requestAnimationFrame(positionPill);
}

/* ---------- accounts: server calls ---------- */
function api(method, url, body, extra){
  return fetch(url, Object.assign({ method, credentials:"same-origin", cache:"no-store",
    headers: body ? {"Content-Type":"application/json"} : {}, body: body ? JSON.stringify(body) : undefined }, extra||{}));
}
async function detectMode(){
  if (/^https?:$/.test(location.protocol)){
    try {
      const r = await fetch("/api/session", { credentials:"same-origin", cache:"no-store" });
      if (r.ok && (r.headers.get("content-type")||"").includes("json")){
        const j = await r.json();
        if (j && j.app==="pocket-ledger"){ MODE = "cloud"; ui.setupError = j.setupError || null; session = j.user || null; return; }
      }
    } catch(e){}
  }
  MODE = "local";
  let id = null; try { id = localStorage.getItem(LOCAL_SESSION_KEY); } catch(e){}
  session = id && ACCOUNTS[id] ? { id, name:ACCOUNTS[id].name, role:ACCOUNTS[id].role } : null;
}

/* ---------- accounts: saving & syncing ---------- */
const sync = { rev:0, timer:null, retry:null, busy:false, again:false, status:"saved", at:null };
function persistLocal(){
  if (!session || session.role==="superadmin" || ui.readOnly) return;
  try { localStorage.setItem(storeKey(), JSON.stringify(Object.assign({}, state, { _rev: sync.rev }))); } catch(e){}
}
function save(){
  if (!session || ui.readOnly || session.role==="superadmin") return;
  if (MODE==="cloud"){ state._dirty = true; persistLocal(); scheduleSync(); }
  else persistLocal();
}
function scheduleSync(delay){
  clearTimeout(sync.timer); clearTimeout(sync.retry);
  setSync("saving");
  sync.timer = setTimeout(pushNow, delay==null ? 600 : delay);
}
async function pushNow(){
  if (MODE!=="cloud" || !session || session.role==="superadmin") return;
  if (sync.busy){ sync.again = true; return; }
  if (!state._dirty){ setSync("saved"); return; }
  sync.busy = true; sync.again = false;
  const snapshot = JSON.stringify(payload(state));
  try {
    const r = await api("PUT", "/api/data", { rev: sync.rev, data: JSON.parse(snapshot) });
    if (r.status===401){ sync.busy = false; return sessionExpired(); }
    const j = await r.json().catch(()=>({}));
    if (r.status===409){
      sync.rev = j.rev || 0;
      state = mergeStates(normalizeState(j.data), state); state._dirty = true;
      persistLocal(); renderAll(); sync.again = true;
    } else if (!r.ok){
      throw new Error(j.error || "Couldn't save.");
    } else {
      sync.rev = j.rev; sync.at = j.updatedAt;
      if (JSON.stringify(payload(state))===snapshot) delete state._dirty; else sync.again = true;
      persistLocal(); setSync("saved");
    }
  } catch(e){
    setSync("offline", e.message);
    sync.retry = setTimeout(()=>{ if (state._dirty) scheduleSync(0); }, 15000);
  } finally {
    sync.busy = false;
    if (sync.again) scheduleSync(300);
  }
}
async function pullNow(silent){
  if (MODE!=="cloud" || !session) return;
  if (session.role==="superadmin"){ if (!ui.viewing) loadFamily(true); return; }
  if (sync.busy || state._dirty) return;
  try {
    const r = await api("GET", "/api/data");
    if (r.status===401) return sessionExpired();
    if (!r.ok) return;
    const j = await r.json();
    if ((j.rev||0) !== sync.rev && !state._dirty){
      sync.rev = j.rev || 0; sync.at = j.updatedAt;
      state = normalizeState(j.data); persistLocal(); renderAll();
      if (!silent) toast("Updated with changes from another device");
    }
    setSync("saved");
  } catch(e){ setSync("offline"); }
}
function syncText(){
  if (MODE==="local") return { title:"Demo mode", text:"Saved in this browser only. Deploy to Vercel to sign in from any device." };
  if (session && session.role==="superadmin") return { title:"Super Admin", text:"You can view every account. Each person edits their own." };
  if (sync.status==="saving") return { title:"Saving…", text:"Your changes are being saved to your account." };
  if (sync.status==="offline") return { title:"Not saved yet", text:"No connection right now. Changes are kept on this device and will be saved automatically." };
  return { title:"Saved to your account", text: sync.at ? `Last saved ${timeAgo(sync.at)}. Sign in on any device to see it.` : "Sign in on any device to see your entries." };
}
function setSync(status){
  sync.status = status;
  const t = syncText();
  $("#syncNote").innerHTML = `<b>${esc(t.title)}</b>${esc(t.text)}`;
  const dot = $("#syncDot");
  dot.className = "sync-dot " + (MODE==="local" ? "local" : status);
  const sheet = $("#sheetSync"); if (sheet) sheet.textContent = t.title;
}
function timeAgo(iso){
  const d = (Date.now() - new Date(iso).getTime())/1000;
  if (!isFinite(d)) return "";
  if (d < 45) return "just now";
  if (d < 3600) return Math.round(d/60) + " min ago";
  if (d < 86400) return Math.round(d/3600) + " h ago";
  return Math.round(d/86400) + " days ago";
}
document.addEventListener("visibilitychange", ()=>{ if (!document.hidden) pullNow(); });
window.addEventListener("online", ()=>{ if (state._dirty) scheduleSync(0); else pullNow(true); });
setInterval(()=>{ if (!document.hidden) pullNow(true); }, 45000);
window.addEventListener("pagehide", ()=>{
  if (MODE==="cloud" && session && state._dirty && !sync.busy){
    try { api("PUT", "/api/data", { rev: sync.rev, data: payload(state) }, { keepalive:true }); } catch(e){}
  }
});

/* ---------- accounts: sign in & out ---------- */
let loginPick = null;
function showLogin(message){
  document.body.classList.add("signed-out");
  $("#login").hidden = false;
  let last = null; try { last = localStorage.getItem(LAST_USER_KEY); } catch(e){}
  loginPick = loginPick || (ACCOUNTS[last] ? last : "wife");
  $("#accountList").innerHTML = Object.keys(ACCOUNTS).map(id=>`
    <button type="button" class="acct" role="radio" aria-checked="${id===loginPick}" data-acct="${id}">
      <span class="avatar av-${id}">${INITIALS[id]}</span>
      <span><b>${ACCOUNTS[id].name}</b><small>${ACCOUNTS[id].desc}</small></span>
    </button>`).join("");
  $("#pwField").hidden = MODE!=="cloud";
  $("#setupCheckBtn").hidden = MODE!=="cloud"; $("#setupList").hidden = true;
  $("#loginPw").value = "";
  $("#loginErr").textContent = message || "";
  const note = $("#loginNote");
  note.classList.toggle("err-note", !!(MODE==="cloud" && ui.setupError));
  note.textContent = MODE==="cloud"
    ? (ui.setupError || "Each account has its own password. Your entries are saved to your account, so you'll see them on any device.")
    : "Demo mode: no password needed here, and entries stay in this browser. Once the app is on Vercel, each account signs in with its own password and works on any device.";
  if (MODE==="cloud") setTimeout(()=>$("#loginPw").focus(), 350);
}
async function runSetupCheck(){
  const list = $("#setupList");
  list.hidden = false; list.innerHTML = `<div class="setup-item"><span>Checking…</span></div>`;
  let j;
  try { const r = await fetch("/api/health", { cache:"no-store" }); j = await r.json(); }
  catch(e){ list.innerHTML = `<div class="setup-item bad"><span class="setup-mark">!</span><div><b>Couldn't reach the server</b><span>Check your internet connection and try again.</span></div></div>`; return; }
  const item = (cls, mark, title, text) => `<div class="setup-item ${cls}"><span class="setup-mark">${mark}</span><div><b>${esc(title)}</b><span>${esc(text)}</span></div></div>`;
  let html = item(j.database.ok ? "" : "bad", j.database.ok ? "✓" : "!", "Database", j.database.message);
  html += item("", "✓", "Session secret", j.sessionSecret);
  Object.keys(j.accounts).forEach(id=>{
    const a = j.accounts[id];
    if (a.locked) html += item("warn", "!", a.name, "Paused after too many wrong passwords. Wait 15 minutes, then try again.");
    else if (a.password==="missing") html += item("bad", "!", a.name, `No password yet. Add ${a.variable} in Vercel → Settings → Environment Variables, then redeploy.`);
    else html += item("", "✓", a.name, "Password " + a.password + ".");
  });
  list.innerHTML = html;
}
$("#setupCheckBtn").addEventListener("click", runSetupCheck);
function hideLogin(){ $("#login").hidden = true; document.body.classList.remove("signed-out"); }
$("#accountList").addEventListener("click", e=>{
  const b = e.target.closest("[data-acct]"); if (!b) return;
  loginPick = b.dataset.acct;
  $$("#accountList .acct").forEach(x=>x.setAttribute("aria-checked", String(x===b)));
  $("#loginErr").textContent = "";
  if (MODE==="cloud") $("#loginPw").focus();
});
$("#accountList").addEventListener("keydown", e=>{
  if (!["ArrowRight","ArrowDown","ArrowLeft","ArrowUp"].includes(e.key)) return;
  const ids = Object.keys(ACCOUNTS); let i = ids.indexOf(loginPick);
  i = (i + (e.key==="ArrowRight"||e.key==="ArrowDown" ? 1 : ids.length-1)) % ids.length;
  const b = $(`[data-acct="${ids[i]}"]`); b.click(); b.focus(); e.preventDefault();
});
$("#pwToggle").addEventListener("click", ()=>{
  const i = $("#loginPw"), show = i.type==="password";
  i.type = show ? "text" : "password"; $("#pwToggle").textContent = show ? "Hide" : "Show";
  $("#pwToggle").setAttribute("aria-label", show ? "Hide password" : "Show password");
});
$("#loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const id = loginPick, btn = $("#loginBtn");
  if (!ACCOUNTS[id]){ $("#loginErr").textContent = "Choose an account first."; return; }
  if (MODE==="cloud"){
    const pw = $("#loginPw").value;
    if (!pw){ $("#loginErr").textContent = "Enter the password for " + ACCOUNTS[id].name + "."; $("#loginPw").focus(); return; }
    btn.classList.add("loading"); btn.textContent = "Signing in ";
    try {
      const r = await api("POST", "/api/login", { username:id, password:pw });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j.error || "Couldn't sign in. Try again.");
      session = j.user;
    } catch(err){
      $("#loginErr").textContent = err.message;
      $("#setupCheckBtn").hidden = false;
      const card = $("#loginCard"); card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      btn.classList.remove("loading"); btn.textContent = "Sign in";
      return;
    }
    btn.classList.remove("loading"); btn.textContent = "Sign in";
  } else {
    session = { id, name:ACCOUNTS[id].name, role:ACCOUNTS[id].role };
    try { localStorage.setItem(LOCAL_SESSION_KEY, id); } catch(e){}
  }
  try { localStorage.setItem(LAST_USER_KEY, id); } catch(e){}
  await enterApp(true);
});
async function enterApp(fresh){
  ui.viewing = null; ui.readOnly = false; ui.family = null; ui.legacyDismissed = false; ui.view = "";
  applyRole(); updateNav();
  if (session.role==="superadmin"){
    state = freshState();
  } else {
    state = load();
    if (MODE==="cloud"){
      sync.rev = state._rev || 0;
      try {
        const r = await api("GET", "/api/data");
        if (r.status===401) return sessionExpired();
        const j = await r.json();
        const server = j.data ? normalizeState(j.data) : null;
        if (server && state._dirty) state = Object.assign(mergeStates(server, state), { _dirty:true });
        else if (server) state = server;
        else if (hasEntries(state)) state._dirty = true;
        sync.rev = j.rev || 0; sync.at = j.updatedAt;
        persistLocal(); setSync("saved");
        if (state._dirty) scheduleSync(0);
      } catch(e){ setSync("offline"); }
    }
  }
  setSync(sync.status);
  resetForm(); resetIncome();
  $("#fDate").value = defaultDate(); $("#iDate").value = defaultDate(); $("#svDate").value = defaultDate();
  hideLogin();
  renderAll();
  const want = (location.hash||"").slice(1);
  showView(allowedViews().includes(want) ? want : allowedViews()[0], true);
  if (fresh) toast(`Signed in as ${session.name}`);
  if (session.role==="superadmin") loadFamily();
}
function sessionExpired(){
  session = null; ui.viewing = null; ui.readOnly = false;
  showLogin("You were signed out. Sign in again to keep saving — your unsaved changes are kept on this device.");
}
async function signOut(){
  closeModal();
  if (MODE==="cloud"){
    if (state._dirty){ try { await pushNow(); } catch(e){} }
    try { await api("POST", "/api/logout"); } catch(e){}
    if (!state._dirty){ try { localStorage.removeItem(storeKey()); } catch(e){} }
  } else {
    try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch(e){}
  }
  session = null; state = freshState(); ui.viewing = null; ui.readOnly = false; ui.family = null; sync.rev = 0; sync.at = null;
  applyRole();
  try { history.replaceState(null, "", location.pathname + location.search); } catch(e){}
  showLogin();
}

/* ---------- accounts: account sheet ---------- */
$("#meBtn").addEventListener("click", ()=>{
  if (!session) return;
  const t = syncText();
  const roleLine = ACCOUNTS[session.id].desc;
  const html = `
    <div class="me-head"><span class="avatar lg av-${session.id}">${INITIALS[session.id]}</span><div><b>${esc(session.name)}</b><div class="small">${esc(roleLine)}</div></div></div>
    <div class="kv"><div>Status</div><div id="sheetSync">${esc(t.title)}</div><div>Where entries are kept</div><div>${MODE==="cloud" ? "Your account (any device)" : "This browser only"}</div></div>
    ${MODE==="cloud" ? `
    <h3>Change password</h3>
    <form class="stack" id="pwForm" novalidate>
      <div class="field"><label for="pwCur">Current password</label><input class="input" id="pwCur" type="password" autocomplete="current-password"></div>
      <div class="field"><label for="pwNext">New password</label><input class="input" id="pwNext" type="password" autocomplete="new-password" placeholder="At least 8 characters"></div>
      <div class="err" id="pwErr"></div>
      <div><button class="btn btn-primary btn-sm" type="submit">Change password</button></div>
    </form>` : ""}
    <div class="row"><button class="btn btn-danger btn-sm" data-signout>${MODE==="cloud" ? "Sign out" : "Switch account"}</button></div>`;
  openModal("Your account", MODE==="cloud" ? "Signed in" : "Demo mode", html);
});
$("#modalBody").addEventListener("click", e=>{ if (e.target.closest("[data-signout]")) signOut(); });
$("#modalBody").addEventListener("submit", async e=>{
  if (e.target.id!=="pwForm") return;
  e.preventDefault();
  const cur = $("#pwCur").value, next = $("#pwNext").value, err = $("#pwErr");
  if (next.length < 8){ err.textContent = "Use at least 8 characters for the new password."; return; }
  try {
    const r = await api("POST", "/api/password", { current:cur, newPassword:next });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j.error || "Couldn't change the password.");
    closeModal(); toast("Password changed. Other devices were signed out.");
  } catch(x){ err.textContent = x.message; }
});

/* ---------- accounts: Super Admin family view ---------- */
async function loadFamily(silent){
  if (!session || session.role!=="superadmin") return;
  const fam = {};
  if (MODE==="cloud"){
    try {
      const r = await api("GET", "/api/users");
      if (r.status===401) return sessionExpired();
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't load the accounts.");
      j.users.forEach(u=>{ fam[u.id] = u; });
    } catch(e){ if (!silent) toast(e.message, "over"); return; }
  } else {
    ["wife","husband","child"].forEach(id=>{ fam[id] = { id, name:ACCOUNTS[id].name, role:ACCOUNTS[id].role, data: readJSON(storeKeyFor(id)), updatedAt:null, passwordSet:true }; });
  }
  ui.family = fam;
  if (ui.viewing && fam[ui.viewing.id]){ state = normalizeState(fam[ui.viewing.id].data); renderAll(); }
  else renderFamily();
}
function memberSummary(m){
  return withState(normalizeState(m.data), ()=>{
    const cf = cashflow(ui.month), s = summarize(rowsFor(ui.month));
    return { cf, s, st: budgetStatus(s.paid), budget: state.budget, entries: state.expenses.length + state.incomes.length + state.savings.length };
  });
}
function renderFamily(){
  if (!session || session.role!=="superadmin") return;
  const fam = ui.family;
  $("#familyTitle").textContent = "Accounts · " + monthName(ui.month);
  $("#pwAdmin").hidden = MODE!=="cloud";
  if (!fam){ $("#members").innerHTML = `<div class="empty">Loading accounts…</div>`; return; }
  let I = 0, S = 0, V = 0;
  const cards = ["wife","husband","child"].map(id=>{
    const m = fam[id]; if (!m) return "";
    const x = memberSummary(m); I += x.cf.income; S += x.cf.spent; V += x.cf.saved;
    const child = m.role==="child";
    const pillTxt = child ? (x.cf.income ? fmtPct(x.cf.rate)+" saved" : "No income yet") : ({none:"No limit set", ok:"On track", care:"Near limit", over:"Over limit"}[x.st.key]);
    const pillCls = child ? (x.cf.saved>0 ? "ok" : "none") : x.st.key;
    const meter = (!child && x.budget) ? `<div class="meter"><div class="meter-track"><div class="meter-fill ${x.st.key==="over"?"over":x.st.key==="care"?"care":""}" style="transform:scaleX(${Math.min(1,x.st.ratio)})"></div></div><div class="meter-scale num"><span>${fmtPct(x.st.ratio)} of limit</span><span>${money(x.budget)}</span></div></div>` : "";
    return `<article class="member">
      <div class="member-top"><span class="avatar av-${id}">${INITIALS[id]}</span><div><h3>${esc(m.name)}</h3><p class="small">${m.updatedAt ? "Updated "+timeAgo(m.updatedAt) : (x.entries ? "Saved on this device" : "No entries yet")}${m.passwordSet===false ? " · no password set" : ""}</p></div><span class="pill ${pillCls}">${pillTxt}</span></div>
      <div class="member-nums">
        <div><span>Income</span><b>${money(x.cf.income)}</b></div>
        ${child ? "" : `<div><span>Spending</span><b>${money(x.cf.spent)}</b></div>`}
        <div><span>Savings</span><b>${money(x.cf.saved)}</b></div>
        <div><span>${x.cf.left<0?"Short by":"Left over"}</span><b style="color:${x.cf.left<0?"var(--over)":"var(--ok)"}">${money(Math.abs(x.cf.left))}</b></div>
      </div>
      ${meter}
      <button class="btn btn-ghost btn-sm" data-open-member="${id}">Open ${esc(m.name)}'s ledger</button>
    </article>`;
  }).join("");
  $("#members").innerHTML = cards;
  countTo($("#fIncome"), I, money); countTo($("#fSpent"), S, money); countTo($("#fSaved"), V, money);
  $("#fIncomeNote").textContent = "Wife, Husband and Child combined";
  $("#fSpentNote").textContent = I ? fmtPct(pct(S,I)) + " of family income" : "—";
  $("#fSavedNote").textContent = I ? fmtPct(pct(V,I)) + " of family income" : "—";
  const sel = $("#pwUser"), cur = sel.value;
  sel.innerHTML = ["wife","husband","child"].map(id=>`<option value="${id}">${ACCOUNTS[id].name}</option>`).join(""); if (cur) sel.value = cur;
}
$("#members").addEventListener("click", e=>{ const b = e.target.closest("[data-open-member]"); if (b) openMember(b.dataset.openMember); });
$("#familyRefresh").addEventListener("click", ()=>{ loadFamily(); toast("Accounts refreshed"); });
function openMember(id){
  const m = ui.family && ui.family[id]; if (!m) return;
  ui.viewing = { id, name:m.name, role:m.role }; ui.readOnly = true;
  state = normalizeState(m.data);
  applyRole(); updateNav(); renderAll();
  go("dashboard");
  window.scrollTo({ top:0, behavior: reduceMotion ? "auto" : "smooth" });
}
function exitMember(){
  ui.viewing = null; ui.readOnly = false; state = freshState();
  applyRole(); updateNav(); renderAll(); go("family");
  loadFamily(true);
}
$("#exitViewing").addEventListener("click", exitMember);
$("#pwAdminForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const user = $("#pwUser").value, pw = $("#pwNew").value, note = $("#pwAdminNote");
  if (pw.length < 8){ note.textContent = "Use at least 8 characters."; note.style.color = "var(--over)"; return; }
  try {
    const r = await api("POST", "/api/password", { username:user, newPassword:pw });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(j.error || "Couldn't set the password.");
    $("#pwNew").value = ""; note.style.color = "var(--ok)";
    note.textContent = `New password set for ${ACCOUNTS[user].name}. They've been signed out on every device.`;
    loadFamily(true);
  } catch(x){ note.style.color = "var(--over)"; note.textContent = x.message; }
});

/* ---------- accounts: entries saved before accounts existed ---------- */
function legacyState(){ const raw = readJSON(LEGACY_KEY); const st = raw ? normalizeState(raw) : null; return st && hasEntries(st) ? st : null; }
function renderLegacy(){
  const banner = $("#legacyBanner");
  const leg = (!session || session.role==="superadmin" || ui.readOnly || ui.legacyDismissed) ? null : legacyState();
  banner.hidden = !leg;
  if (leg) $("#legacyText").textContent = `This browser has ${plural(leg.expenses.length,"expense")}, ${leg.incomes.length} income and ${leg.savings.length} savings ${leg.savings.length===1?"entry":"entries"} from before accounts existed. Move them into ${session.name}'s account?`;
}
$("#legacyMove").addEventListener("click", ()=>{
  const leg = legacyState(); if (!leg) return;
  const budget = state.budget || leg.budget;
  state = Object.assign(mergeStates(state, leg), { budget, target: state.target, currency: state.currency, sources: state.sources });
  save();
  try { localStorage.removeItem(LEGACY_KEY); } catch(e){}
  renderAll(); toast(`Moved into ${session.name}'s account`);
});
$("#legacyDismiss").addEventListener("click", ()=>{ ui.legacyDismissed = true; renderLegacy(); });

/* ---------- boot ---------- */
$("#hideEmpty").checked = ui.hideEmpty;
(async function boot(){
  await detectMode();
  setSync("saved");
  if (session) await enterApp(false); else showLogin();
  labelTables();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionPill);
})();

window.__ledger = { cashflow, summarize, dayTable, estimateLines, parseAmount, state:()=>state };
})();
