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
  { href: '/dashboard.html', icon: '⊞', label: 'Dashboard' },
  { href: '/study.html',     icon: '📚', label: 'Study Hub' },
  { href: '/tasks.html',     icon: '✓',  label: 'Task Board' },
  { href: '/cgpa.html',      icon: '📈', label: 'CGPA Calc' },
  { href: '/notes.html',     icon: '🗂',  label: 'Notes' },
  { href: '/settings.html',  icon: '⚙',  label: 'Settings' },
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
              <span class="sidebar-label">${item.label}</span>
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
