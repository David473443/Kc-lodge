// ClassMind AI — Shared auth helpers & navigation
'use strict';

const Auth = {
  getToken: () => localStorage.getItem('cm_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('cm_user') || 'null'); } catch { return null; } },
  setAuth(token, user) {
    localStorage.setItem('cm_token', token);
    localStorage.setItem('cm_user', JSON.stringify(user));
  },
  clearAuth() {
    localStorage.removeItem('cm_token');
    localStorage.removeItem('cm_user');
  },
  requireAuth() {
    if (!this.getToken()) { window.location.href = '/login.html'; return false; }
    return true;
  },
  headers() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.getToken() };
  },
  async fetchMe() {
    const res = await fetch('/api/auth/me', { headers: this.headers() });
    if (!res.ok) { this.clearAuth(); window.location.href = '/login.html'; return null; }
    const user = await res.json();
    localStorage.setItem('cm_user', JSON.stringify(user));
    return user;
  },
  logout() {
    this.clearAuth();
    window.location.href = '/login.html';
  }
};

const NAV_ITEMS = [
  { href: '/dashboard.html',  icon: '⊞', label: 'Dashboard' },
  { href: '/study.html',      icon: '📚', label: 'Study Hub' },
  { href: '/kb.html',         icon: '🧠', label: 'Course Chat' },
  { href: '/projects.html',   icon: '📄', label: 'Projects' },
  { href: '/tasks.html',      icon: '✓',  label: 'Task Board' },
  { href: '/cgpa.html',       icon: '📈', label: 'CGPA Calc' },
  { href: '/notes.html',      icon: '🗂',  label: 'Notes' },
  { href: '/reminders.html',  icon: '🔔', label: 'Reminders', badge: true },
  { href: '/feedback.html',   icon: '💬', label: 'Feedback' },
  { href: '/settings.html',   icon: '⚙',  label: 'Settings' },
];

function renderNav(activePage) {
  const user = Auth.getUser();
  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const sidebarHTML = `
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <svg width="26" height="26" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0;vertical-align:middle">
          <rect width="48" height="48" rx="11" fill="#1B3F6E"/>
          <path d="M8 34V18C8 16.34 9.34 15 11 15H23V34Q16 32 11 32C9.34 32 8 33.34 8 35Z" fill="white" opacity="0.92"/>
          <path d="M40 34V18C40 16.34 38.66 15 37 15H25V34Q32 32 37 32C38.66 32 40 33.34 40 35Z" fill="white" opacity="0.7"/>
          <line x1="24" y1="15" x2="24" y2="34" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
          <circle cx="24" cy="8.5" r="3" fill="#C4933F"/>
          <circle cx="14.5" cy="12" r="1.8" fill="rgba(255,255,255,0.55)"/>
          <circle cx="33.5" cy="12" r="1.8" fill="rgba(255,255,255,0.55)"/>
          <line x1="14.5" y1="12" x2="24" y2="8.5" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
          <line x1="33.5" y1="12" x2="24" y2="8.5" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
        </svg>
        <span class="sidebar-logo-text">ClassMind</span><span class="sidebar-logo-badge">AI</span>
      </div>
      <ul class="sidebar-nav">
        ${NAV_ITEMS.map(item => `
          <li>
            <a href="${item.href}" class="sidebar-link ${activePage === item.label ? 'active' : ''}">
              <span class="sidebar-icon">${item.icon}</span>
              <span class="sidebar-label">${item.label}${item.badge ? `<span class="rm-badge" style="display:none;background:#B91C1C;color:#fff;border-radius:10px;font-size:10px;font-weight:700;min-width:17px;height:17px;padding:0 4px;margin-left:6px;vertical-align:middle;display:none;line-height:17px;text-align:center"></span>` : ''}</span>
            </a>
          </li>
        `).join('')}
      </ul>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-avatar">${initials}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${escHtml(user?.name || 'Student')}</div>
            <div class="sidebar-user-uni">${escHtml(user?.university || 'Set up profile')}</div>
          </div>
        </div>
        <button class="sidebar-logout" onclick="Auth.logout()">Sign out</button>
      </div>
    </nav>
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>
    <div class="mobile-topbar">
      <button class="hamburger" onclick="openSidebar()">☰</button>
      <div class="mobile-logo">ClassMind<span class="sidebar-logo-badge" style="font-size:9px;padding:1px 5px">AI</span></div>
    </div>
  `;

  const sidebarCSS = `
    <style>
      .app-layout { display: flex; min-height: 100vh; }
      .sidebar {
        width: 220px; flex-shrink: 0;
        background: #fff; border-right: 1px solid #E2E2DC;
        display: flex; flex-direction: column;
        position: fixed; top: 0; left: 0; height: 100vh;
        z-index: 200; overflow-y: auto;
      }
      .sidebar-logo {
        padding: 18px 16px 15px;
        font-family: 'Playfair Display', Georgia, serif;
        font-size: 17px; font-weight: 700; color: #1B3F6E;
        border-bottom: 1px solid #E2E2DC;
        display: flex; align-items: center; gap: 9px;
      }
      .sidebar-logo-badge {
        display: inline-block; background: #C4933F; color: #fff;
        font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 700;
        letter-spacing: 1.5px; padding: 2px 7px; border-radius: 4px;
        margin-left: 4px; vertical-align: middle; position: relative; top: -2px;
      }
      .sidebar-nav { list-style: none; padding: 12px 0; flex: 1; }
      .sidebar-nav li { margin: 2px 8px; }
      .sidebar-link {
        display: flex; align-items: center; gap: 10px;
        padding: 9px 12px; border-radius: 8px; text-decoration: none;
        color: #747474; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500;
        transition: background 0.15s, color 0.15s;
      }
      .sidebar-link:hover { background: #F6F6F3; color: #141414; }
      .sidebar-link.active { background: #EBF0F7; color: #1B3F6E; font-weight: 600; }
      .sidebar-icon { font-size: 16px; width: 20px; text-align: center; }
      .sidebar-footer { padding: 14px 16px; border-top: 1px solid #E2E2DC; }
      .sidebar-user { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .sidebar-avatar {
        width: 34px; height: 34px; border-radius: 50%; background: #1B3F6E;
        color: #fff; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .sidebar-user-name { font-size: 13px; font-weight: 600; color: #141414; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
      .sidebar-user-uni { font-size: 11px; color: #747474; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
      .sidebar-logout {
        width: 100%; padding: 7px; border: 1.5px solid #E2E2DC; border-radius: 7px;
        background: transparent; color: #747474; font-family: 'Inter', sans-serif;
        font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s;
      }
      .sidebar-logout:hover { border-color: #B91C1C; color: #B91C1C; }
      .page-content { margin-left: 220px; flex: 1; min-width: 0; }
      .mobile-topbar { display: none; }
      .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 199; }
      @media (max-width: 768px) {
        .sidebar { transform: translateX(-100%); transition: transform 0.25s; }
        .sidebar.open { transform: translateX(0); }
        .sidebar-overlay.open { display: block; }
        .page-content { margin-left: 0; }
        .mobile-topbar {
          display: flex; align-items: center; gap: 12px;
          height: 52px; padding: 0 16px; background: #fff;
          border-bottom: 1px solid #E2E2DC; position: sticky; top: 0; z-index: 100;
        }
        .hamburger { background: none; border: none; font-size: 20px; cursor: pointer; padding: 4px; }
        .mobile-logo { font-family: 'Playfair Display', Georgia, serif; font-size: 16px; font-weight: 700; color: #1B3F6E; }
      }
    </style>
  `;

  // Inject CSS into head
  document.head.insertAdjacentHTML('beforeend', sidebarCSS);
  // Inject sidebar before first child of body
  document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
  // Wrap existing content in page-content div
  const pageContent = document.querySelector('.page-main');
  if (pageContent) pageContent.classList.add('page-content');
  // Start reminder checker on every app page
  if (Auth.getToken()) Reminders.startChecker();
  // Show email verification banner if needed
  _injectVerificationBanner();
}

function _injectVerificationBanner() {
  const user = Auth.getUser();
  if (!user || user.email_verified !== 0) return;
  if (document.getElementById('cm-verify-banner')) return;
  const css = `
    #cm-verify-banner{background:#FFFBEB;border-bottom:1.5px solid #FDE68A;padding:10px 20px;display:flex;align-items:center;gap:10px;font-family:'Inter',sans-serif;font-size:13px;color:#92400E;z-index:999;flex-wrap:wrap;}
    #cm-verify-banner a{color:#B45309;font-weight:600;cursor:pointer;text-decoration:underline;}
    #cm-verify-banner .cm-vb-close{margin-left:auto;background:none;border:none;cursor:pointer;font-size:16px;color:#92400E;line-height:1;}
    #cm-verify-banner .cm-vb-sent{color:#15803D;font-weight:600;}
  `;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  const banner = document.createElement('div');
  banner.id = 'cm-verify-banner';
  banner.innerHTML = `<span>📧 <strong>Verify your email</strong> to secure your account.</span><a id="cm-resend-link" onclick="resendVerificationEmail(this)">Resend verification email</a><button class="cm-vb-close" onclick="this.closest('#cm-verify-banner').remove()" title="Dismiss">✕</button>`;
  document.body.insertAdjacentElement('afterbegin', banner);
}

async function resendVerificationEmail(link) {
  link.textContent = 'Sending…';
  link.style.pointerEvents = 'none';
  try {
    const res = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: Auth.headers()
    });
    if (res.ok) {
      link.outerHTML = '<span class="cm-vb-sent">✓ Verification email sent! Check your inbox.</span>';
    } else {
      link.textContent = 'Failed — try again';
      link.style.pointerEvents = '';
    }
  } catch {
    link.textContent = 'Network error — try again';
    link.style.pointerEvents = '';
  }
}

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Common CSS variables & base styles for all app pages
const APP_BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #F6F6F3; --card: #FFFFFF; --card2: #F2F2EF; --border: #E2E2DC;
    --accent: #1B3F6E; --accent-light: #EBF0F7; --accent-hover: #15335A;
    --text: #141414; --muted: #747474; --high: #B91C1C; --med: #B45309; --low: #15803D;
    --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04);
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
  h1,h2,h3 { font-family: 'Playfair Display', Georgia, serif; }
  .page-main { padding: 32px; max-width: 1000px; }
  @media (max-width: 768px) { .page-main { padding: 16px; } }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 22px; box-shadow: var(--shadow-sm); }
  .btn { padding: 10px 22px; border-radius: 8px; border: none; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.18s; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-outline { background: transparent; color: var(--text); border: 1.5px solid var(--border); }
  .btn-outline:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
  .btn-danger { background: transparent; color: var(--high); border: 1.5px solid #FCA5A5; }
  .btn-danger:hover { background: #FEE2E2; }
  .btn-sm { padding: 6px 14px; font-size: 12px; }
  input, select, textarea {
    width: 100%; background: var(--card); border: 1.5px solid var(--border); border-radius: 8px;
    color: var(--text); padding: 10px 12px; font-family: 'Inter', sans-serif; font-size: 14px; outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  input:focus, select:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(27,63,110,0.08); }
  input::placeholder, textarea::placeholder { color: #ADADAD; }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .form-group { margin-bottom: 16px; }
  .page-title { font-size: 26px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .page-subtitle { font-size: 14px; color: var(--muted); margin-bottom: 28px; }
  #toast {
    position: fixed; bottom: 28px; right: 24px; background: #1A1A1A; color: #fff;
    padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 500;
    display: none; z-index: 999; max-width: 340px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2); border-left: 4px solid var(--accent);
  }
`;

function injectBaseStyles() {
  const style = document.createElement('style');
  style.textContent = APP_BASE_CSS;
  document.head.insertAdjacentHTML('afterbegin', `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`);
  document.head.appendChild(style);
}

function showToast(msg, type = 'error') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.style.borderLeftColor = type === 'success' ? 'var(--low)' : 'var(--high)';
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.display = 'none', 3500);
}

// ── Reminders / Alarms ──────────────────────────────────────────────────────
const Reminders = (() => {
  'use strict';
  let _injected = false;
  let _checkerStarted = false;
  let _current = null;
  const _fired = new Set(JSON.parse(sessionStorage.getItem('rm_fired') || '[]'));

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[523,0],[659,0.22],[784,0.44],[1047,0.66]].forEach(([freq, when]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        gain.gain.setValueAtTime(0.28, ctx.currentTime + when);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + 0.7);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime + when + 0.8);
      });
    } catch {}
  }

  function _fmtShort(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function _injectUI() {
    if (_injected) return;
    _injected = true;
    const css = `<style id="rm-css">
      #rm-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9000;align-items:center;justify-content:center}
      #rm-backdrop.open{display:flex}
      #rm-modal{background:#fff;border-radius:18px;padding:28px 28px 22px;width:min(440px,95vw);box-shadow:0 24px 80px rgba(0,0,0,0.22);font-family:'Inter',sans-serif}
      #rm-modal h3{font-family:'Playfair Display',Georgia,serif;font-size:19px;color:#1B3F6E;margin-bottom:3px}
      .rm-sub{font-size:12px;color:#747474;margin-bottom:18px;line-height:1.5}
      .rm-section-label{font-size:11px;font-weight:700;color:#747474;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;display:block}
      .rm-options{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:14px}
      .rm-opt{padding:9px 12px;border:1.5px solid #E2E2DC;border-radius:9px;background:#fff;font-family:'Inter',sans-serif;font-size:12px;cursor:pointer;transition:all .15s;text-align:left;line-height:1.4}
      .rm-opt:hover{border-color:#1B3F6E;color:#1B3F6E;background:#EBF0F7}
      .rm-opt.selected{border-color:#1B3F6E;background:#1B3F6E;color:#fff}
      .rm-opt .rm-opt-sub{font-size:10px;opacity:0.75;display:block;margin-top:2px}
      #rm-custom-wrap{margin-bottom:14px}
      #rm-custom-dt{width:100%;padding:9px 12px;border:1.5px solid #E2E2DC;border-radius:8px;font-family:'Inter',sans-serif;font-size:13px;color:#141414;background:#fff}
      #rm-custom-dt:focus{outline:none;border-color:#1B3F6E}
      .rm-actions{display:flex;gap:10px;justify-content:flex-end;padding-top:6px}
      .rm-btn{padding:9px 20px;border-radius:8px;border:none;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
      .rm-btn-cancel{background:transparent;border:1.5px solid #E2E2DC;color:#747474}
      .rm-btn-cancel:hover{border-color:#999;color:#333}
      .rm-btn-save{background:#1B3F6E;color:#fff}
      .rm-btn-save:hover{background:#15335A}
    </style>`;
    document.head.insertAdjacentHTML('beforeend', css);
    const el = document.createElement('div');
    el.id = 'rm-backdrop';
    el.innerHTML = `<div id="rm-modal">
      <h3 id="rm-title">Set Alarm</h3>
      <div class="rm-sub" id="rm-subtitle"></div>
      <span class="rm-section-label">Remind me…</span>
      <div class="rm-options" id="rm-options"></div>
      <div id="rm-custom-wrap" style="display:none">
        <span class="rm-section-label">Custom date &amp; time</span>
        <input type="datetime-local" id="rm-custom-dt">
      </div>
      <div class="rm-actions">
        <button class="rm-btn rm-btn-cancel" onclick="Reminders._close()">Cancel</button>
        <button class="rm-btn rm-btn-save" onclick="Reminders._confirm()">🔔 Set Alarm</button>
      </div>
    </div>`;
    el.addEventListener('click', e => { if (e.target === el) Reminders._close(); });
    document.body.appendChild(el);
  }

  function _nextOccurrence(dayName, timeStr) {
    const dayMap = {Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6,Sunday:0};
    const target = dayMap[dayName];
    if (target === undefined) return null;
    const [h, m] = (timeStr || '08:00').split(':').map(Number);
    const now = new Date();
    const d = new Date(now);
    d.setHours(h, m || 0, 0, 0);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0 && d <= now) diff = 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function openModal({ title, body = '', baseTime = null, sourceType = 'custom', sourceId = null }) {
    _injectUI();
    const opts = [];
    if (baseTime) {
      const bt = new Date(baseTime);
      opts.push({ label: 'At time of event', sub: _fmtShort(bt), time: bt });
      [15, 30, 60, 180, 1440].forEach(mins => {
        const t = new Date(bt - mins * 60000);
        if (t > new Date()) opts.push({ label: mins < 60 ? `${mins} min before` : mins < 1440 ? `${mins/60}h before` : '1 day before', sub: _fmtShort(t), time: t });
      });
    }
    opts.push({ label: 'Custom time…', sub: 'Pick any date & time', time: null });
    _current = { title, body, baseTime, sourceType, sourceId, opts, selectedTime: null };

    document.getElementById('rm-title').textContent = title;
    document.getElementById('rm-subtitle').textContent = body;
    document.getElementById('rm-options').innerHTML = opts.map((o, i) => `
      <button class="rm-opt" onclick="Reminders._selectOpt(${i})">
        ${escHtml(o.label)}<span class="rm-opt-sub">${escHtml(o.sub || '')}</span>
      </button>`).join('');

    const futureIdx = opts.findIndex(o => o.time === null || o.time > new Date());
    _selectOpt(futureIdx >= 0 ? futureIdx : 0);
    document.getElementById('rm-backdrop').classList.add('open');
  }

  function _selectOpt(idx) {
    document.querySelectorAll('.rm-opt').forEach((b, i) => b.classList.toggle('selected', i === idx));
    const opt = _current?.opts[idx];
    const cw = document.getElementById('rm-custom-wrap');
    if (!opt) return;
    if (opt.time === null) {
      cw.style.display = '';
      _current.selectedTime = null;
      const def = new Date(Date.now() + 3600000);
      document.getElementById('rm-custom-dt').value = def.toISOString().slice(0, 16);
    } else {
      cw.style.display = 'none';
      _current.selectedTime = opt.time.toISOString();
    }
  }

  function _close() {
    document.getElementById('rm-backdrop')?.classList.remove('open');
    _current = null;
  }

  async function _confirm() {
    if (!Auth.getToken()) { showToast('Sign in to set alarms.', 'error'); return; }
    let remindAt = _current?.selectedTime;
    if (!remindAt) {
      const v = document.getElementById('rm-custom-dt')?.value;
      if (!v) { showToast('Pick a reminder time.', 'error'); return; }
      remindAt = new Date(v).toISOString();
    }
    if (new Date(remindAt) <= new Date()) { showToast('Pick a future time.', 'error'); return; }
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST', headers: Auth.headers(),
        body: JSON.stringify({
          title: _current.title, body: _current.body,
          remind_at: remindAt,
          source_type: _current.sourceType,
          source_id: _current.sourceId
        })
      });
      if (res.ok) { showToast('Alarm set! 🔔', 'success'); _close(); _refreshBadge(); }
      else { const e = await res.json(); showToast(e.error || 'Failed.', 'error'); }
    } catch { showToast('Network error.', 'error'); }
  }

  async function _refreshBadge() {
    if (!Auth.getToken()) return;
    try {
      const res = await fetch('/api/reminders', { headers: Auth.headers() });
      if (!res.ok) return;
      const rows = await res.json();
      const count = rows.filter(r => !r.triggered && r.enabled !== 0 && new Date(r.remind_at) > new Date()).length;
      document.querySelectorAll('.rm-badge').forEach(b => {
        b.textContent = count;
        b.style.display = count > 0 ? 'inline-block' : 'none';
      });
    } catch {}
  }

  async function startChecker() {
    if (_checkerStarted) return;
    _checkerStarted = true;
    _injectUI();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    async function check() {
      if (!Auth.getToken()) return;
      try {
        const res = await fetch('/api/reminders', { headers: Auth.headers() });
        if (!res.ok) return;
        const rows = await res.json();
        const now = new Date();
        let upcoming = 0;
        for (const r of rows) {
          if (r.triggered || r.enabled === 0) continue;
          const due = new Date(r.remind_at);
          if (!_fired.has(r.id) && due <= now) {
            _fired.add(r.id);
            sessionStorage.setItem('rm_fired', JSON.stringify([..._fired]));
            playChime();
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('🔔 ClassMind Alarm', {
                body: r.title + (r.body ? '\n' + r.body : ''),
                tag: 'cm-rm-' + r.id
              });
            }
            showToast('🔔 ' + r.title, 'success');
            fetch('/api/reminders/' + r.id + '/trigger', { method: 'POST', headers: Auth.headers() });
          } else if (due > now) {
            upcoming++;
          }
        }
        document.querySelectorAll('.rm-badge').forEach(b => {
          b.textContent = upcoming;
          b.style.display = upcoming > 0 ? 'inline-block' : 'none';
        });
      } catch {}
    }
    check();
    setInterval(check, 60000);
  }

  async function toggle(id, enabled) {
    if (!Auth.getToken()) return;
    const res = await fetch('/api/reminders/' + id, {
      method: 'PATCH', headers: Auth.headers(),
      body: JSON.stringify({ enabled: enabled ? 1 : 0 })
    });
    _refreshBadge();
    return res.ok;
  }

  return { openModal, startChecker, playChime, toggle, _close, _confirm, _selectOpt, _nextOccurrence, _refreshBadge };
})();
