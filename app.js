// ═══════════════════════════════════════════════
//  LedgerLite — app.js
//  Supabase-powered personal bookkeeping app
// ═══════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// ── CONFIG ─────────────────────────────────────
// Replace these two values with your own from supabase.com → Settings → API
const SUPABASE_URL  = https://izoserihhzlhdfaxykhv.supabase.co/rest/v1/
const SUPABASE_KEY  = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6b3NlcmloaHpsaGRmYXh5a2h2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1Mjc4OTUsImV4cCI6MjA5NDEwMzg5NX0.gCD-05Knw4yGTyZ92H6PKC7Q9HGveVcvOFliDoBOnS0

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── STATE ──────────────────────────────────────
let state = {
  user: null,
  tab: 'dashboard',
  authTab: 'login',
  transactions: [],
  shareConfig: [
    { name: 'Tithe & Offering',       pct: 10 },
    { name: 'Ministry Giving',         pct: 5  },
    { name: 'Charitable Giving',       pct: 5  },
    { name: 'Capital Project Savings', pct: 15 },
    { name: 'Investment',              pct: 20 },
    { name: 'Operational Funds',       pct: 30 },
    { name: 'Personal Payment',        pct: 15 },
  ],
  currency: '₦',
  setup: false,
  pending: null,
  deleteIdx: null,
  form: { date: today(), desc: '', category: 'income', amount: '', method: 'Bank Transfer', notes: '' },
  summaryPeriod: 'month',
  profitInput: '',
  authError: '',
  authLoading: false,
  saving: false,
  loading: true,
}

// ── HELPERS ────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10) }

function fmt(n) {
  const abs = Math.abs(Number(n) || 0)
  return state.currency + abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── SUPABASE: AUTH ─────────────────────────────
async function init() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    state.user = session.user
    await loadUserData()
  }
  state.loading = false
  render()

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user || null
    if (state.user) {
      await loadUserData()
    } else {
      state.transactions = []
      state.setup = false
      state.currency = '₦'
    }
    render()
  })
}

async function signUp(email, password, name) {
  state.authLoading = true; state.authError = ''; render()
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name } }
  })
  state.authLoading = false
  if (error) { state.authError = error.message; render() }
}

async function signIn(email, password) {
  state.authLoading = true; state.authError = ''; render()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  state.authLoading = false
  if (error) { state.authError = error.message; render() }
}

async function signOut() {
  await supabase.auth.signOut()
  state.user = null; state.setup = false; state.transactions = []
  render()
}

// ── SUPABASE: DATA ─────────────────────────────
async function loadUserData() {
  // Load transactions
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .order('date', { ascending: false })
  state.transactions = (txs || []).map(t => ({
    id: t.id,
    date: t.date,
    desc: t.description,
    category: t.category,
    amount: parseFloat(t.amount),
    method: t.method || '',
    notes: t.notes || '',
  }))

  // Load settings (currency, setup flag, share config)
  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', state.user.id)
    .single()

  if (settings) {
    state.currency    = settings.currency    || '₦'
    state.setup       = settings.setup_done  || false
    state.shareConfig = settings.share_config || state.shareConfig
  }
}

async function saveTransaction(tx) {
  state.saving = true; updateSaveStatus()
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id:     state.user.id,
      date:        tx.date,
      description: tx.desc,
      category:    tx.category,
      amount:      tx.amount,
      method:      tx.method,
      notes:       tx.notes,
    })
    .select()
    .single()

  if (!error && data) {
    state.transactions.unshift({
      id: data.id, date: data.date, desc: data.description,
      category: data.category, amount: parseFloat(data.amount),
      method: data.method || '', notes: data.notes || '',
    })
  }
  state.saving = false; updateSaveStatus()
  return error
}

async function deleteTransaction(id) {
  state.saving = true; updateSaveStatus()
  await supabase.from('transactions').delete().eq('id', id)
  state.transactions = state.transactions.filter(t => t.id !== id)
  state.saving = false; updateSaveStatus()
}

async function saveSettings() {
  state.saving = true; updateSaveStatus()
  await supabase
    .from('user_settings')
    .upsert({
      user_id:      state.user.id,
      currency:     state.currency,
      setup_done:   state.setup,
      share_config: state.shareConfig,
    }, { onConflict: 'user_id' })
  state.saving = false; updateSaveStatus()
}

function updateSaveStatus() {
  const el = document.getElementById('save-status')
  if (!el) return
  el.textContent = state.saving ? '⏳ Saving…' : '✓ Saved'
  el.className = 'save-status' + (state.saving ? ' saving' : '')
}

// ── DERIVED ────────────────────────────────────
function getDerived() {
  const t = state.transactions
  const income      = t.filter(x => x.category === 'income').reduce((s,x) => s + x.amount, 0)
  const expenditure = t.filter(x => x.category === 'expenditure').reduce((s,x) => s + x.amount, 0)
  const assets      = t.filter(x => x.category === 'asset').reduce((s,x) => s + x.amount, 0)
  const liabilities = t.filter(x => x.category === 'liability').reduce((s,x) => s + x.amount, 0)
  return { income, expenditure, assets, liabilities, equity: assets - liabilities, net: income - expenditure }
}

function getPeriodTxs() {
  const now = new Date()
  return state.transactions.filter(t => {
    const d = new Date(t.date)
    if (state.summaryPeriod === 'week') return (now - d) / 86400000 <= 7
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
}

// ── MAIN RENDER ────────────────────────────────
function render() {
  const root = document.getElementById('app')
  if (state.loading) {
    root.innerHTML = `<div class="splash"><div class="spinner"></div><p>Loading LedgerLite…</p></div>`
    return
  }
  if (!state.user) { root.innerHTML = buildAuth(); bindAuthEvents(); return }
  if (!state.setup) { root.innerHTML = `<div class="app-layout">${buildHeader()}<div class="content">${buildSetup()}</div></div>`; return }
  root.innerHTML = `
    <div class="app-layout">
      ${buildHeader()}
      ${buildNav()}
      <div class="content">
        ${state.pending  ? buildConfirmModal() : ''}
        ${state.deleteIdx !== null ? buildDeleteModal() : ''}
        ${buildTab()}
      </div>
    </div>`
}

// ── AUTH SCREEN ────────────────────────────────
function buildAuth() {
  const isLogin = state.authTab === 'login'
  return `
  <div class="auth-wrap">
  <div class="auth-card">
    <div class="auth-logo">📒</div>
    <h1>LedgerLite</h1>
    <p class="tagline">Personal bookkeeping, simply done.<br>Your books. Anywhere. Any device.</p>
    <div class="auth-tabs">
      <button class="${isLogin?'active':''}" onclick="setAuthTab('login')">Sign In</button>
      <button class="${!isLogin?'active':''}" onclick="setAuthTab('signup')">Create Account</button>
    </div>
    ${state.authError ? `<div class="alert danger" style="margin-bottom:14px"><i class="ti ti-alert-circle"></i>${esc(state.authError)}</div>` : ''}
    <div style="display:flex;flex-direction:column;gap:10px">
      ${!isLogin ? `
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="auth-name" placeholder="Your name">
      </div>` : ''}
      <div class="form-group">
        <label>Email Address</label>
        <input type="email" id="auth-email" placeholder="you@example.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="auth-password" placeholder="••••••••" ${isLogin?'':'minlength="6"'}>
      </div>
      <button class="btn primary full-width" id="auth-submit" onclick="handleAuth()" ${state.authLoading?'disabled':''} style="margin-top:4px">
        ${state.authLoading
          ? '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span> Please wait…'
          : isLogin ? '<i class="ti ti-login"></i> Sign In' : '<i class="ti ti-user-plus"></i> Create Account'}
      </button>
    </div>
    ${isLogin ? `<p style="font-size:12px;color:var(--text3);text-align:center;margin-top:14px">Don't have an account? <a href="#" onclick="setAuthTab('signup');return false" style="color:var(--blue)">Sign up free</a></p>` : ''}
  </div>
  </div>`
}

function bindAuthEvents() {
  const pw = document.getElementById('auth-password')
  if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth() })
}

// ── HEADER ─────────────────────────────────────
function buildHeader() {
  const d = getDerived()
  const warn = state.setup && d.assets > 0 && d.liabilities > d.assets
  const name = state.user?.user_metadata?.full_name || state.user?.email?.split('@')[0] || 'You'
  return `
  <div class="header">
    <div class="header-left">
      <span style="font-size:24px">📒</span>
      <div><h1>LedgerLite</h1><div class="sub">Personal Bookkeeping</div></div>
    </div>
    <div class="header-right">
      <span id="save-status" class="save-status">✓ Saved</span>
      ${state.setup ? `<span style="font-size:20px">${warn?'⚠️':'✅'}</span>` : ''}
      <span class="currency-badge">${esc(state.currency)}</span>
      <button class="user-btn" onclick="signOut()">
        <i class="ti ti-logout" aria-hidden="true"></i>${esc(name.split(' ')[0])}
      </button>
    </div>
  </div>`
}

// ── NAV ────────────────────────────────────────
function buildNav() {
  const tabs = [
    {id:'dashboard',icon:'ti-dashboard', label:'Dashboard'},
    {id:'record',   icon:'ti-plus',       label:'Record'},
    {id:'ledger',   icon:'ti-list',       label:'Ledger'},
    {id:'summary',  icon:'ti-chart-bar',  label:'Summary'},
    {id:'profit',   icon:'ti-coin',       label:'Profit Share'},
    {id:'settings', icon:'ti-settings',   label:'Settings'},
  ]
  return `<nav class="nav">${tabs.map(t => `
    <button class="${state.tab===t.id?'active':''}" onclick="setTab('${t.id}')">
      <i class="ti ${t.icon}" aria-hidden="true"></i>${t.label}
    </button>`).join('')}</nav>`
}

// ── TAB ROUTER ─────────────────────────────────
function buildTab() {
  switch(state.tab) {
    case 'dashboard': return buildDashboard()
    case 'record':    return buildRecord()
    case 'ledger':    return buildLedger()
    case 'summary':   return buildSummary()
    case 'profit':    return buildProfit()
    case 'settings':  return buildSettings()
    default:          return buildDashboard()
  }
}

// ── SETUP ──────────────────────────────────────
function buildSetup() {
  return `
  <div class="setup-wrap">
    <div style="font-size:48px;margin-bottom:14px">📒</div>
    <h2>Welcome to LedgerLite</h2>
    <p class="intro">Let's open your books. This takes about 30 seconds and only needs to be done once.</p>
    <div class="card">
      <div class="card-title">Opening Balances</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="form-group">
          <label>Currency</label>
          <select id="s-currency">
            ${['₦ Nigerian Naira|₦','$ US Dollar|$','£ British Pound|£','€ Euro|€','KSh Kenyan Shilling|KSh','GHS Ghana Cedis|GHS','ZAR South African Rand|ZAR']
              .map(c => { const [label,val] = c.split('|'); return `<option value="${val}" ${state.currency===val?'selected':''}>${label}</option>` }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Total cash &amp; bank balance right now</label>
          <input type="number" id="s-cash" placeholder="0" min="0" step="0.01">
        </div>
        <div class="form-group">
          <label>Other assets — property, equipment, savings…</label>
          <input type="number" id="s-assets" placeholder="0" min="0" step="0.01">
        </div>
        <div class="form-group">
          <label>Existing loans &amp; debts</label>
          <input type="number" id="s-liab" placeholder="0" min="0" step="0.01">
        </div>
        <button class="btn primary" onclick="doSetup()" style="margin-top:4px">
          <i class="ti ti-rocket" aria-hidden="true"></i> Open My Books
        </button>
      </div>
    </div>
  </div>`
}

// ── DASHBOARD ──────────────────────────────────
function buildDashboard() {
  const d = getDerived()
  const surplus = d.net >= 0
  return `
  <div class="sec-header">
    <h2>Financial Overview</h2>
    <span class="text-muted">${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span>
  </div>
  ${d.assets > 0 && d.liabilities > d.assets ? `<div class="alert warn"><i class="ti ti-alert-triangle"></i><div><strong>⚠️ Liabilities exceed Assets.</strong> Your equity is negative. Worth addressing soon.</div></div>` : ''}
  ${d.income > 0 && d.net < 0 ? `<div class="alert danger"><i class="ti ti-trending-down"></i><div><strong>Deficit:</strong> You've spent more than you've earned. Review your expenditure.</div></div>` : ''}
  <div class="metrics">
    <div class="metric"><div class="label">Total Income</div><div class="value green">${fmt(d.income)}</div><div class="sub">All money in</div></div>
    <div class="metric"><div class="label">Total Expenditure</div><div class="value red">${fmt(d.expenditure)}</div><div class="sub">All money out</div></div>
    <div class="metric"><div class="label">Net Position</div><div class="value ${surplus?'green':'red'}">${surplus?'+':'–'}${fmt(Math.abs(d.net))}</div><div class="sub">${surplus?'✅ Surplus':'❌ Deficit'}</div></div>
    <div class="metric"><div class="label">Total Assets</div><div class="value blue">${fmt(d.assets)}</div><div class="sub">Everything you own</div></div>
    <div class="metric"><div class="label">Liabilities</div><div class="value ${d.liabilities>0?'amber':'blue'}">${fmt(d.liabilities)}</div><div class="sub">What you owe</div></div>
    <div class="metric"><div class="label">Equity</div><div class="value ${d.equity>=0?'purple':'red'}">${fmt(d.equity)}</div><div class="sub">Assets – Liabilities</div></div>
  </div>
  <div class="card">
    <div class="card-title">Accounting Equation</div>
    <p style="font-size:12px;color:var(--text3);margin-bottom:10px">Assets = Liabilities + Equity — must always balance.</p>
    <div class="eq-row">
      <span class="eq-val blue">${fmt(d.assets)}</span>
      <span class="eq-op">=</span>
      <span class="eq-val amber">${fmt(d.liabilities)}</span>
      <span class="eq-op">+</span>
      <span class="eq-val purple">${fmt(d.equity)}</span>
      <span style="margin-left:auto;font-size:22px">✅</span>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Recent Entries</div>
    ${state.transactions.length === 0
      ? `<div class="empty"><i class="ti ti-file-text" aria-hidden="true"></i><p>No transactions yet.<br>Go to <strong>Record</strong> to add your first entry.</p></div>`
      : buildMiniTable(state.transactions.slice(0,6))}
    ${state.transactions.length > 6 ? `<div style="text-align:center;padding-top:10px"><button class="btn" onclick="setTab('ledger')">View All <i class="ti ti-arrow-right"></i></button></div>` : ''}
  </div>`
}

function buildMiniTable(txs) {
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Date</th><th>Description</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${txs.map(t => `<tr>
      <td style="color:var(--text3);white-space:nowrap;font-size:12px">${esc(t.date)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.desc)}</td>
      <td><span class="badge ${t.category}">${t.category}</span></td>
      <td style="text-align:right;font-weight:600;white-space:nowrap;color:${t.category==='income'?'var(--green-dark)':t.category==='expenditure'?'var(--red)':'var(--text)'}">${fmt(t.amount)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`
}

// ── RECORD ─────────────────────────────────────
function buildRecord() {
  const f = state.form
  return `
  <div class="sec-header"><h2>Record a Transaction</h2></div>
  <div class="card">
    <div class="form-grid">
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="f-date" value="${esc(f.date)}">
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="f-cat">
          <option value="income"      ${f.category==='income'     ?'selected':''}>💰 Income</option>
          <option value="expenditure" ${f.category==='expenditure'?'selected':''}>💸 Expenditure</option>
          <option value="asset"       ${f.category==='asset'      ?'selected':''}>🏦 Asset</option>
          <option value="liability"   ${f.category==='liability'  ?'selected':''}>📋 Liability</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Description — what was this for?</label>
        <input type="text" id="f-desc" value="${esc(f.desc)}" placeholder="e.g. Client payment, office rent, equipment…">
      </div>
      <div class="form-group">
        <label>Amount (${esc(state.currency)})</label>
        <input type="number" id="f-amount" value="${esc(f.amount)}" placeholder="0.00" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label>Payment Method</label>
        <select id="f-method">
          ${['Bank Transfer','Cash','Card','Mobile Money','Cheque','Other'].map(m=>`<option ${f.method===m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label>Notes (optional)</label>
        <textarea id="f-notes" placeholder="Any extra details…">${esc(f.notes)}</textarea>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn primary" onclick="prepareEntry()"><i class="ti ti-check" aria-hidden="true"></i> Review &amp; Save</button>
      <button class="btn" onclick="clearForm()"><i class="ti ti-refresh" aria-hidden="true"></i> Clear</button>
    </div>
  </div>
  <div class="card" style="background:var(--blue-bg);border-color:var(--blue)">
    <div style="font-size:13px;color:var(--blue-dark);line-height:1.75">
      <strong>💡 Quick guide</strong><br>
      <strong>Income</strong> — money received (sales, salary, payments in)<br>
      <strong>Expenditure</strong> — money spent (bills, purchases, running costs)<br>
      <strong>Asset</strong> — something you own with value (equipment, property, cash)<br>
      <strong>Liability</strong> — a debt or obligation (loan, unpaid bill)
    </div>
  </div>`
}

// ── LEDGER ─────────────────────────────────────
function buildLedger() {
  const txs = state.transactions
  return `
  <div class="sec-header">
    <h2>Full Ledger</h2>
    <span class="text-muted">${txs.length} entr${txs.length===1?'y':'ies'}</span>
  </div>
  ${txs.length === 0
    ? `<div class="card"><div class="empty"><i class="ti ti-file-text" aria-hidden="true"></i><p>No transactions yet.</p></div></div>`
    : `<div class="card"><div class="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Method</th><th style="text-align:right">Amount</th><th></th></tr></thead>
        <tbody>${txs.map((t,i) => `<tr>
          <td style="white-space:nowrap;font-size:12px;color:var(--text3)">${esc(t.date)}</td>
          <td>
            <div style="font-weight:500;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.desc)}</div>
            ${t.notes?`<div style="font-size:11px;color:var(--text3)">${esc(t.notes)}</div>`:''}
          </td>
          <td><span class="badge ${t.category}">${t.category}</span></td>
          <td style="font-size:12px;color:var(--text3);white-space:nowrap">${esc(t.method)}</td>
          <td style="text-align:right;font-weight:600;white-space:nowrap;color:${t.category==='income'?'var(--green-dark)':t.category==='expenditure'?'var(--red)':'var(--text)'}">${fmt(t.amount)}</td>
          <td><button class="btn danger sm" onclick="confirmDelete(${i})" title="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`}`
}

// ── SUMMARY ────────────────────────────────────
function buildSummary() {
  const pt  = getPeriodTxs()
  const inc = pt.filter(x=>x.category==='income').reduce((s,x)=>s+x.amount,0)
  const exp = pt.filter(x=>x.category==='expenditure').reduce((s,x)=>s+x.amount,0)
  const net = inc - exp
  const d   = getDerived()
  const lbl = state.summaryPeriod==='week' ? 'This Week' : 'This Month'
  const maxV = Math.max(d.assets, d.liabilities, 1)

  return `
  <div class="sec-header">
    <h2>Summary</h2>
    <div class="period-tabs">
      <button class="${state.summaryPeriod==='week'?'active':''}" onclick="setPeriod('week')">Weekly</button>
      <button class="${state.summaryPeriod==='month'?'active':''}" onclick="setPeriod('month')">Monthly</button>
    </div>
  </div>
  <div class="card">
    <div class="card-title">${lbl} — Income vs Expenditure</div>
    <div class="metrics" style="margin-bottom:10px">
      <div class="metric"><div class="label">Income</div><div class="value green">${fmt(inc)}</div></div>
      <div class="metric"><div class="label">Expenditure</div><div class="value red">${fmt(exp)}</div></div>
      <div class="metric"><div class="label">Net</div><div class="value ${net>=0?'green':'red'}">${net>=0?'+':'–'}${fmt(Math.abs(net))}</div></div>
    </div>
    <div class="alert ${net>=0?'success':'danger'}" style="margin-bottom:0">
      <i class="ti ${net>=0?'ti-trending-up':'ti-trending-down'}" aria-hidden="true"></i>
      <span>${net>=0
        ? `✅ You earned more than you spent ${lbl.toLowerCase()} — great going!`
        : `❌ You spent more than you earned ${lbl.toLowerCase()}. Consider reviewing expenses.`}</span>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Balance Sheet — All Time</div>
    ${[
      {label:'Total Assets',      val:d.assets,      color:'var(--blue-dark)',    icon:'ti-building-bank'},
      {label:'Total Liabilities', val:d.liabilities, color:'var(--amber-dark)',   icon:'ti-credit-card'},
      {label:'Equity (Net Worth)',val:d.equity,       color:d.equity>=0?'var(--purple-dark)':'var(--red)', icon:'ti-chart-pie'},
    ].map(r=>`
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:13px;color:var(--text2);display:flex;align-items:center;gap:6px">
            <i class="ti ${r.icon}" style="font-size:15px" aria-hidden="true"></i>${r.label}
          </span>
          <span style="font-size:15px;font-weight:700;font-family:var(--font);color:${r.color}">${fmt(r.val)}</span>
        </div>
        <div class="progress-bg">
          <div class="progress-fill" style="width:${Math.min(100,Math.max(0,(Math.abs(r.val)/maxV)*100)).toFixed(1)}%;background:${r.color}"></div>
        </div>
      </div>`).join('')}
    <div class="divider"></div>
    <div style="font-size:13px;color:var(--text2)">
      Equity = <strong>${fmt(d.assets)}</strong> − <strong>${fmt(d.liabilities)}</strong> = 
      <strong style="color:${d.equity>=0?'var(--purple-dark)':'var(--red)'}">${fmt(d.equity)}</strong>
    </div>
  </div>
  <div class="card">
    <div class="card-title">${lbl} — All Entries</div>
    ${pt.length===0
      ? `<div class="empty" style="padding:20px"><i class="ti ti-inbox" aria-hidden="true"></i><p>No transactions in this period.</p></div>`
      : buildMiniTable(pt)}
  </div>`
}

// ── PROFIT SHARE ───────────────────────────────
function buildProfit() {
  const total = parseFloat(state.profitInput) || 0
  const sum   = state.shareConfig.reduce((s,x) => s+x.pct, 0)
  const valid = Math.abs(sum-100) < 0.01

  return `
  <div class="sec-header"><h2>Profit Share Calculator</h2></div>
  <div class="card">
    <div class="card-title">Enter Profit Amount</div>
    <div class="form-group">
      <label>Total Profit (${esc(state.currency)})</label>
      <input type="number" id="profit-input" value="${esc(state.profitInput)}" placeholder="e.g. 500000" oninput="onProfitInput(this.value)">
    </div>
  </div>
  ${!valid
    ? `<div class="alert warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i><div><strong>Percentages must add up to 100%.</strong> Currently: ${sum.toFixed(1)}%. Adjust below.</div></div>`
    : total > 0
      ? `<div class="alert success"><i class="ti ti-check" aria-hidden="true"></i>✅ All percentages add up to 100% — breakdown is ready.</div>`
      : ''}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div class="card-title" style="margin-bottom:0">Allocation</div>
      <span id="pct-sum" style="font-size:13px;font-weight:700;color:${valid?'var(--green-dark)':'var(--red)'}">${sum.toFixed(1)}% / 100%</span>
    </div>
    ${state.shareConfig.map((s,i) => `
      <div class="share-row">
        <div class="share-label-col">
          <div class="share-name">${esc(s.name)}</div>
          <div class="pct-bar-bg"><div class="pct-bar" id="bar-${i}" style="width:${Math.min(s.pct,100)}%"></div></div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <input type="number" class="share-pct-input" value="${s.pct}" min="0" max="100" step="1" oninput="onShareInput(${i},this.value)">
          <span style="font-size:13px;color:var(--text2)">%</span>
        </div>
        <div class="share-amount" id="share-amt-${i}">${total>0&&valid ? fmt(total*s.pct/100) : '—'}</div>
      </div>`).join('')}
    <div class="divider"></div>
    <div class="total-row">
      <span>Total</span>
      <span id="share-total" style="font-family:var(--font)">${total>0&&valid ? fmt(total) : esc(state.currency)+'0'}</span>
    </div>
  </div>`
}

// ── SETTINGS ───────────────────────────────────
function buildSettings() {
  const name  = state.user?.user_metadata?.full_name || '—'
  const email = state.user?.email || '—'
  return `
  <div class="sec-header"><h2>Settings</h2></div>
  <div class="card">
    <div class="card-title">Your Account</div>
    <div style="font-size:13px;color:var(--text2);line-height:2">
      <strong>Name:</strong> ${esc(name)}<br>
      <strong>Email:</strong> ${esc(email)}
    </div>
    <div class="btn-row">
      <button class="btn danger" onclick="signOut()"><i class="ti ti-logout"></i> Sign Out</button>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Currency</div>
    <div class="form-group">
      <label>Your Currency Symbol</label>
      <select onchange="changeCurrency(this.value)">
        ${['₦','$','£','€','KSh','GHS','ZAR'].map(c=>`<option ${state.currency===c?'selected':''}>${c}</option>`).join('')}
      </select>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Data &amp; Backup</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px;line-height:1.6">Your data is saved to the cloud and works on any device. Export a CSV backup whenever you like.</p>
    <div class="btn-row">
      <button class="btn" onclick="exportCSV()"><i class="ti ti-download" aria-hidden="true"></i> Export CSV</button>
      <button class="btn danger" onclick="confirmClearAll()"><i class="ti ti-trash" aria-hidden="true"></i> Clear All Transactions</button>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Reset Opening Setup</div>
    <button class="btn" onclick="resetSetup()"><i class="ti ti-rotate" aria-hidden="true"></i> Run Setup Again</button>
  </div>`
}

// ── MODALS ─────────────────────────────────────
function buildConfirmModal() {
  const p = state.pending
  return `
  <div class="modal-overlay" onclick="cancelPending()">
  <div class="modal-box" onclick="event.stopPropagation()">
    <h3>Confirm Entry</h3>
    <p>
      📅 <strong>${esc(p.date)}</strong><br>
      📝 <strong>${esc(p.desc)}</strong><br>
      🏷️ Category: <strong>${esc(p.category)}</strong><br>
      💰 Amount: <strong>${fmt(p.amount)}</strong><br>
      💳 Via: <strong>${esc(p.method)}</strong>
      ${p.notes ? `<br>📌 ${esc(p.notes)}` : ''}
      <br><br>Is that correct?
    </p>
    <div class="btn-row">
      <button class="btn primary" onclick="saveEntry()"><i class="ti ti-check"></i> Yes, Save It</button>
      <button class="btn" onclick="cancelPending()"><i class="ti ti-edit"></i> Edit</button>
    </div>
  </div></div>`
}

function buildDeleteModal() {
  const t = state.transactions[state.deleteIdx]
  if (!t) return ''
  return `
  <div class="modal-overlay" onclick="state.deleteIdx=null;render()">
  <div class="modal-box" onclick="event.stopPropagation()">
    <h3>Delete Entry?</h3>
    <p>Remove <strong>${esc(t.desc)}</strong> (${fmt(t.amount)}) from ${esc(t.date)}?<br>This cannot be undone.</p>
    <div class="btn-row">
      <button class="btn danger" onclick="doDelete()"><i class="ti ti-trash"></i> Delete</button>
      <button class="btn" onclick="state.deleteIdx=null;render()">Cancel</button>
    </div>
  </div></div>`
}

// ── ACTIONS ────────────────────────────────────
function setTab(t)    { syncForm(); state.tab = t; render() }
function setPeriod(p) { state.summaryPeriod = p; render() }
function setAuthTab(t){ state.authTab = t; state.authError = ''; render() }

async function handleAuth() {
  const email    = document.getElementById('auth-email')?.value?.trim()
  const password = document.getElementById('auth-password')?.value
  const name     = document.getElementById('auth-name')?.value?.trim()
  if (!email || !password) { state.authError = 'Please enter your email and password.'; render(); return }
  if (state.authTab === 'signup') await signUp(email, password, name)
  else await signIn(email, password)
}

async function doSetup() {
  const currency = document.getElementById('s-currency').value
  const cash   = parseFloat(document.getElementById('s-cash').value)   || 0
  const assets = parseFloat(document.getElementById('s-assets').value) || 0
  const liab   = parseFloat(document.getElementById('s-liab').value)   || 0
  state.currency = currency
  state.setup    = true
  const d = today()
  if (cash   > 0) await saveTransaction({date:d, desc:'Opening cash / bank balance', category:'asset',     amount:cash,   method:'Opening Balance', notes:'Setup'})
  if (assets > 0) await saveTransaction({date:d, desc:'Opening other assets',         category:'asset',     amount:assets, method:'Opening Balance', notes:'Setup'})
  if (liab   > 0) await saveTransaction({date:d, desc:'Opening liabilities / loans',  category:'liability', amount:liab,   method:'Opening Balance', notes:'Setup'})
  await saveSettings()
  render()
}

function syncForm() {
  const g = id => { const el = document.getElementById(id); return el ? el.value : null }
  if (g('f-date') === null) return
  state.form = {
    date:     g('f-date')   || today(),
    desc:     g('f-desc')   || '',
    category: g('f-cat')    || 'income',
    amount:   g('f-amount') || '',
    method:   g('f-method') || 'Bank Transfer',
    notes:    g('f-notes')  || '',
  }
}

function prepareEntry() {
  syncForm()
  const f = state.form
  if (!f.desc.trim())                                              { alert('Please add a description.');                       return }
  if (!f.amount || isNaN(parseFloat(f.amount)) || +f.amount <= 0) { alert('Please enter a valid amount greater than zero.'); return }
  state.pending = { ...f, amount: parseFloat(f.amount) }
  render()
}

async function saveEntry() {
  if (!state.pending) return
  const err = await saveTransaction(state.pending)
  if (err) { alert('Could not save: ' + err.message); return }
  state.pending = null
  state.form    = { date: today(), desc: '', category: 'income', amount: '', method: 'Bank Transfer', notes: '' }
  state.tab     = 'dashboard'
  render()
}

function cancelPending() { syncForm(); state.pending = null; render() }

function clearForm() {
  state.form = { date: today(), desc: '', category: 'income', amount: '', method: 'Bank Transfer', notes: '' }
  render()
}

function confirmDelete(i) { state.deleteIdx = i; render() }

async function doDelete() {
  if (state.deleteIdx === null) return
  const t = state.transactions[state.deleteIdx]
  await deleteTransaction(t.id)
  state.deleteIdx = null
  render()
}

function onProfitInput(v) {
  state.profitInput = v
  const total = parseFloat(v) || 0
  const sum   = state.shareConfig.reduce((s,x) => s+x.pct, 0)
  const valid = Math.abs(sum-100) < 0.01
  state.shareConfig.forEach((_,i) => {
    const el = document.getElementById('share-amt-'+i)
    if (el) el.textContent = total>0&&valid ? fmt(total*state.shareConfig[i].pct/100) : '—'
  })
  const tot = document.getElementById('share-total')
  if (tot) tot.textContent = total>0&&valid ? fmt(total) : state.currency+'0'
}

function onShareInput(i, v) {
  state.shareConfig[i].pct = parseFloat(v) || 0
  const sum   = state.shareConfig.reduce((s,x) => s+x.pct, 0)
  const valid = Math.abs(sum-100) < 0.01
  const sumEl = document.getElementById('pct-sum')
  if (sumEl) { sumEl.textContent = sum.toFixed(1)+'% / 100%'; sumEl.style.color = valid?'var(--green-dark)':'var(--red)' }
  const bar = document.getElementById('bar-'+i)
  if (bar) bar.style.width = Math.min(state.shareConfig[i].pct, 100)+'%'
  const total = parseFloat(state.profitInput) || 0
  state.shareConfig.forEach((_,j) => {
    const el = document.getElementById('share-amt-'+j)
    if (el) el.textContent = total>0&&valid ? fmt(total*state.shareConfig[j].pct/100) : '—'
  })
  const tot = document.getElementById('share-total')
  if (tot) tot.textContent = total>0&&valid ? fmt(total) : state.currency+'0'
  saveSettings()
}

async function changeCurrency(v) { state.currency = v; await saveSettings(); render() }

async function resetSetup() {
  if (confirm('Run setup again? Your existing transactions will be kept.')) {
    state.setup = false; await saveSettings(); render()
  }
}

async function confirmClearAll() {
  if (confirm('Delete ALL transactions? This cannot be undone.')) {
    state.saving = true; updateSaveStatus()
    await supabase.from('transactions').delete().eq('user_id', state.user.id)
    state.transactions = []
    state.saving = false; updateSaveStatus()
    render()
  }
}

function exportCSV() {
  const rows = [['Date','Description','Category','Amount','Method','Notes']]
  state.transactions.forEach(t => rows.push([t.date, t.desc, t.category, t.amount, t.method||'', t.notes||'']))
  const csv  = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n')
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'LedgerLite-'+today()+'.csv' })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// ── EXPOSE TO HTML onclick handlers ────────────
Object.assign(window, {
  setTab, setPeriod, setAuthTab, handleAuth, doSetup, syncForm,
  prepareEntry, saveEntry, cancelPending, clearForm,
  confirmDelete, doDelete, onProfitInput, onShareInput,
  changeCurrency, resetSetup, confirmClearAll, exportCSV, signOut,
})

// ── START ──────────────────────────────────────
init()
