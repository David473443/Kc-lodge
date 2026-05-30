'use strict';

// ── Design System CSS ──────────────────────────────────────────────────────
const APP_BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0F172A;
    --bg2: #1E293B;
    --card: #1E293B;
    --card2: #263347;
    --border: #334155;
    --accent: #3B82F6;
    --accent-hover: #2563EB;
    --accent-light: rgba(59,130,246,0.12);
    --text: #F1F5F9;
    --text2: #CBD5E1;
    --muted: #94A3B8;
    --success: #22C55E;
    --warn: #F59E0B;
    --danger: #EF4444;
    --sidebar-w: 220px;
    --radius: 10px;
    --shadow: 0 4px 24px rgba(0,0,0,0.4);
  }

  html, body { height: 100%; }

  body {
    font-family: 'Inter', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  h1, h2, h3 { font-family: 'Playfair Display', serif; }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  button, .btn { cursor: pointer; font-family: inherit; font-size: 14px; border: none; border-radius: var(--radius); transition: background .15s, opacity .15s, transform .1s; }
  button:active, .btn:active { transform: scale(0.98); }
  button:disabled, .btn:disabled { opacity: .5; cursor: not-allowed; }

  input, textarea, select {
    font-family: inherit;
    font-size: 14px;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 14px;
    width: 100%;
    outline: none;
    transition: border-color .15s;
  }
  input:focus, textarea:focus, select:focus { border-color: var(--accent); }
  select option { background: var(--bg2); }

  label { display: block; font-size: 13px; font-weight: 600; color: var(--text2); margin-bottom: 6px; }

  .form-group { margin-bottom: 18px; }
  .form-row { display: flex; gap: 14px; }
  .form-row .form-group { flex: 1; }

  /* Buttons */
  .btn-primary { background: var(--accent); color: #fff; padding: 11px 22px; font-weight: 600; }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-secondary { background: var(--card2); color: var(--text); padding: 11px 22px; font-weight: 600; border: 1px solid var(--border); }
  .btn-secondary:hover:not(:disabled) { background: var(--border); }
  .btn-danger { background: var(--danger); color: #fff; padding: 11px 22px; font-weight: 600; }
  .btn-danger:hover:not(:disabled) { background: #DC2626; }
  .btn-sm { padding: 6px 14px; font-size: 12px; }

  /* Cards */
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
  .card-title { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: var(--text); }

  /* Badge */
  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; }
  .badge-blue { background: var(--accent-light); color: var(--accent); }
  .badge-green { background: rgba(34,197,94,.12); color: var(--success); }
  .badge-amber { background: rgba(245,158,11,.12); color: var(--warn); }
  .badge-red { background: rgba(239,68,68,.12); color: var(--danger); }

  /* Toast */
  #toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
  .toast { display: flex; align-items: center; gap: 10px; background: var(--card2); border: 1px solid var(--border); border-left: 4px solid var(--accent); padding: 12px 18px; border-radius: var(--radius); color: var(--text); font-size: 14px; box-shadow: var(--shadow); max-width: 340px; animation: slideInToast .22s ease; }
  .toast.success { border-left-color: var(--success); }
  .toast.error { border-left-color: var(--danger); }
  .toast.warn { border-left-color: var(--warn); }
  @keyframes slideInToast { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  /* Spinner */
  .spinner { width: 28px; height: 28px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
  .spinner-sm { width: 18px; height: 18px; border-width: 2px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Alert */
  .alert { border-radius: var(--radius); padding: 12px 16px; font-size: 14px; margin-bottom: 16px; }
  .alert-error { background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.25); color: #FCA5A5; }
  .alert-success { background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.25); color: #86EFAC; }
  .alert-info { background: var(--accent-light); border: 1px solid rgba(59,130,246,.25); color: #93C5FD; }

  /* Email verification banner */
  #verifyBanner { background: #78350F; border-bottom: 1px solid #92400E; padding: 9px 20px; font-size: 13px; text-align: center; color: #FDE68A; }
  #verifyBanner button { background: #F59E0B; color: #000; border: none; border-radius: 6px; padding: 4px 14px; font-size: 12px; font-weight: 700; cursor: pointer; margin-left: 10px; }

  /* ── Layout ── */
  .app-layout { display: flex; min-height: 100vh; }

  /* Sidebar */
  .sidebar {
    width: var(--sidebar-w);
    background: var(--bg2);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 100;
    overflow-y: auto;
  }
  .sidebar-logo { padding: 22px 20px 12px; }
  .sidebar-logo span { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 700; color: #fff; letter-spacing: .3px; }
  .sidebar-logo small { display: block; font-size: 10px; color: var(--muted); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 1px; }
  .sidebar-nav { padding: 8px 12px; flex: 1; }
  .nav-item { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 8px; color: var(--text2); font-size: 13.5px; font-weight: 500; text-decoration: none; transition: background .12s, color .12s; margin-bottom: 2px; }
  .nav-item:hover { background: var(--card2); color: var(--text); text-decoration: none; }
  .nav-item.active { background: var(--accent-light); color: var(--accent); font-weight: 700; }
  .nav-item .nav-icon { font-size: 15px; flex-shrink: 0; }
  .sidebar-footer { padding: 16px 12px; border-top: 1px solid var(--border); }
  .sidebar-user { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .sidebar-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent-light); color: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
  .sidebar-name { font-size: 13px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sidebar-email { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-logout { width: 100%; background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s; }
  .btn-logout:hover { background: var(--danger); border-color: var(--danger); color: #fff; }

  /* Main content area */
  .main { margin-left: var(--sidebar-w); flex: 1; min-height: 100vh; }
  .page-header { padding: 28px 32px 0; }
  .page-header h1 { font-size: 26px; font-weight: 700; margin-bottom: 4px; }
  .page-header p { color: var(--muted); font-size: 14px; }
  .page-content { padding: 24px 32px 40px; }

  /* Mobile topbar */
  .mobile-topbar {
    display: none;
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    background: var(--bg2); border-bottom: 1px solid var(--border);
    height: 56px; align-items: center; padding: 0 16px;
    justify-content: space-between;
  }
  .mobile-topbar .topbar-logo { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 700; color: #fff; }
  .mobile-menu-btn { background: none; border: none; color: var(--text); font-size: 22px; cursor: pointer; padding: 4px; }
  .mobile-nav-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 150; }
  .mobile-nav-overlay.open { display: block; }
  .sidebar.mobile-open { transform: translateX(0) !important; }

  @media (max-width: 768px) {
    .sidebar { transform: translateX(-100%); transition: transform .25s ease; }
    .main { margin-left: 0; padding-top: 56px; }
    .mobile-topbar { display: flex; }
    .page-header { padding: 20px 16px 0; }
    .page-content { padding: 16px 16px 40px; }
    .form-row { flex-direction: column; gap: 0; }
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  /* Modal */
  .modal-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:500; align-items:center; justify-content:center; }
  .modal-backdrop.open { display:flex; }
  .modal { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:28px; max-width:460px; width:90%; box-shadow:var(--shadow); }
  .modal-title { font-size:18px; font-weight:700; margin-bottom:16px; }
  .modal-footer { display:flex; gap:10px; justify-content:flex-end; margin-top:20px; }
`;

// ── Nav items ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { href: '/dashboard.html', icon: '⊞', label: 'Dashboard' },
  { href: '/study.html',     icon: '📖', label: 'Study Hub' },
  { href: '/kb.html',        icon: '🧠', label: 'Course Chat' },
  { href: '/tasks.html',     icon: '✓',  label: 'Tasks' },
  { href: '/cgpa.html',      icon: '📊', label: 'CGPA' },
  { href: '/notes.html',     icon: '📝', label: 'Notes' },
  { href: '/projects.html',  icon: '🏗',  label: 'Projects' },
  { href: '/reminders.html', icon: '🔔', label: 'Reminders' },
  { href: '/feedback.html',  icon: '💬', label: 'Feedback' },
  { href: '/settings.html',  icon: '⚙',  label: 'Settings' },
];

// ── Auth ───────────────────────────────────────────────────────────────────
const Auth = {
  getToken() { return localStorage.getItem('cm_token'); },
  getUser()  { try { return JSON.parse(localStorage.getItem('cm_user') || 'null'); } catch { return null; } },
  setAuth(token, user) {
    localStorage.setItem('cm_token', token);
    localStorage.setItem('cm_user', JSON.stringify(user));
  },
  clearAuth() {
    localStorage.removeItem('cm_token');
    localStorage.removeItem('cm_user');
  },
  requireAuth() {
    if (!this.getToken()) {
      window.location.replace('/login.html');
      return false;
    }
    return true;
  },
  headers() {
    const t = this.getToken();
    return t ? { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  },
  async fetchMe() {
    const res = await fetch('/api/auth/me', { headers: this.headers() });
    if (res.status === 401) { this.clearAuth(); window.location.replace('/login.html'); return null; }
    if (!res.ok) return null;
    const u = await res.json();
    localStorage.setItem('cm_user', JSON.stringify(u));
    return u;
  },
  async fetchWithAuth(url, opts = {}) {
    const h = { 'Authorization': 'Bearer ' + (this.getToken() || ''), 'Content-Type': 'application/json' };
    if (opts.body instanceof FormData) { delete h['Content-Type']; }
    const res = await fetch(url, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
    if (res.status === 401) { this.clearAuth(); window.location.replace('/login.html'); return null; }
    return res;
  }
};

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── escHtml (client side) ──────────────────────────────────────────────────
function escHtmlClient(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── renderNav ──────────────────────────────────────────────────────────────
function renderNav(activeLabel) {
  const style = document.createElement('style');
  style.textContent = APP_BASE_CSS;
  document.head.prepend(style);

  const user = Auth.getUser() || {};
  const initial = (user.name || 'U')[0].toUpperCase();

  const navLinks = NAV_ITEMS.map(item => {
    const active = item.label === activeLabel ? ' active' : '';
    return `<a href="${item.href}" class="nav-item${active}">
      <span class="nav-icon">${item.icon}</span>${item.label}
    </a>`;
  }).join('');

  // Insert sidebar + mobile bar
  document.body.insertAdjacentHTML('afterbegin', `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <span>ClassMind AI</span>
        <small>Study Smarter</small>
      </div>
      <nav class="sidebar-nav">${navLinks}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-avatar" id="sidebarAvatar">${initial}</div>
          <div style="min-width:0">
            <div class="sidebar-name" id="sidebarName">${escHtmlClient(user.name || 'Student')}</div>
            <div class="sidebar-email" id="sidebarEmail">${escHtmlClient(user.email || '')}</div>
          </div>
        </div>
        <button class="btn-logout" onclick="handleLogout()">Sign out</button>
      </div>
    </aside>
    <div class="mobile-topbar">
      <span class="topbar-logo">ClassMind AI</span>
      <button class="mobile-menu-btn" onclick="toggleMobileNav()" aria-label="Menu">&#9776;</button>
    </div>
    <div class="mobile-nav-overlay" id="mobileOverlay" onclick="toggleMobileNav()"></div>
  `);

  // Wrap page content in .main
  const existingMain = document.querySelector('.main');
  if (!existingMain) {
    const main = document.createElement('div');
    main.className = 'main';
    const toMove = [];
    for (const child of [...document.body.children]) {
      if (child.id === 'sidebar' || child.id === 'mobileOverlay' ||
          child.classList.contains('mobile-topbar') ||
          child.id === 'toast-container' || child.id === 'verifyBanner') continue;
      toMove.push(child);
    }
    toMove.forEach(c => main.appendChild(c));
    document.body.appendChild(main);
  }

  // Refresh user data from server
  Auth.fetchMe().then(u => {
    if (!u) return;
    const n = document.getElementById('sidebarName');
    const e = document.getElementById('sidebarEmail');
    const a = document.getElementById('sidebarAvatar');
    if (n) n.textContent = u.name || 'Student';
    if (e) e.textContent = u.email || '';
    if (a) a.textContent = (u.name || 'U')[0].toUpperCase();
    if (!u.email_verified) injectVerifyBanner();
  });
}

function toggleMobileNav() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobileOverlay');
  if (!sidebar || !overlay) return;
  const isOpen = sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('open', isOpen);
}

function handleLogout() {
  Auth.clearAuth();
  window.location.replace('/login.html');
}

function injectVerifyBanner() {
  const user = Auth.getUser();
  if (!user || user.email_verified || document.getElementById('verifyBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'verifyBanner';
  banner.innerHTML = `\u{1F4E7} Please verify your email to unlock all features.
    <button onclick="resendVerification(this)">Resend email</button>`;
  const main = document.querySelector('.main');
  if (main) main.insertAdjacentElement('afterbegin', banner);
  else document.body.insertAdjacentElement('afterbegin', banner);
}

async function resendVerification(btn) {
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const res = await Auth.fetchWithAuth('/api/auth/resend-verification', { method: 'POST' });
    if (res && res.ok) {
      btn.textContent = 'Sent!';
      showToast('Verification email sent. Check your inbox.', 'success');
    } else {
      btn.textContent = 'Retry';
      btn.disabled = false;
    }
  } catch {
    btn.textContent = 'Retry';
    btn.disabled = false;
  }
}

// ── Reminders polling ──────────────────────────────────────────────────────
(function initReminders() {
  if (!('Notification' in window)) return;
  let notifGranted = Notification.permission === 'granted';

  async function checkReminders() {
    if (!Auth.getToken()) return;
    try {
      const res = await Auth.fetchWithAuth('/api/reminders');
      if (!res || !res.ok) return;
      const reminders = await res.json();
      const now = Date.now();
      for (const r of reminders) {
        if (r.triggered || !r.enabled) continue;
        const due = new Date(r.remind_at).getTime();
        if (due <= now) {
          await Auth.fetchWithAuth('/api/reminders/' + r.id + '/trigger', { method: 'POST' });
          if (notifGranted) {
            new Notification('ClassMind AI Reminder', {
              body: r.title + (r.body ? '\n' + r.body : ''),
              icon: '/images/campus-grad.svg'
            });
          }
          showToast('🔔 ' + r.title, 'info', 6000);
        }
      }
    } catch {}
  }

  document.addEventListener('click', function askOnce() {
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { notifGranted = p === 'granted'; });
    }
  }, { once: true });

  setInterval(checkReminders, 60000);
  setTimeout(checkReminders, 3000);
})();
