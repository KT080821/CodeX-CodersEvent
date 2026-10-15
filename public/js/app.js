// Main App Controller
const App = {
  user: null,
  currentPage: null,

  COORDINATOR_NAV: [
    { section: 'Main' },
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { section: 'Inventory' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'students', label: 'Students', icon: '👨‍🎓' },
    { id: 'programmes', label: 'Programmes', icon: '🎓' },
    { section: 'Transactions' },
    { id: 'issues', label: 'Issues', icon: '📤' },
    { id: 'returns', label: 'Returns', icon: '📥' },
    { id: 'renewals', label: 'Renewals', icon: '🔄' },
    { id: 'issue-requests', label: 'Issue Requests', icon: '📨' },
    { section: 'Analytics' },
    { id: 'reports', label: 'Reports', icon: '📋' },
  ],
  ADMIN_NAV: [
    { section: 'Administration' },
    { id: 'users', label: 'User Management', icon: '🛡️' },
  ],

  STUDENT_NAV: [
    { section: 'My Account' },
    { id: 'portal', label: 'My Items', icon: '📚' },
  ],

  init() {
    this.googleRegistration = new URLSearchParams(window.location.search).get('oauth') === 'complete';
    API.auth.googleConfig().then(config => {
      if (!config.enabled) {
        const googleWrap = document.getElementById('google-login-wrap');
        if (googleWrap) googleWrap.classList.add('hidden');
      }
    }).catch(() => {
      const googleWrap = document.getElementById('google-login-wrap');
      if (googleWrap) googleWrap.classList.add('hidden');
    });
    const mobileMenu = document.getElementById('mobile-menu-btn');
    if (mobileMenu) {
      mobileMenu.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    }
    const dateEl = document.getElementById('topbar-date');
    if (dateEl) {
      dateEl.textContent = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
    }
    // Toggle between login and register panels
    document.getElementById('show-login-btn').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-panel').style.display = 'none';
      document.getElementById('login-panel').style.display = 'block';
      document.getElementById('login-box-title').textContent = 'Inventory Management';
    });

    // Register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errEl = document.getElementById('register-error');
      const successEl = document.getElementById('register-success');
      errEl.classList.add('hidden');
      successEl.classList.add('hidden');
      const data = {};
      new FormData(form).forEach((v, k) => { data[k] = v; });
      try {
        if (!this.googleRegistration) throw new Error('Please continue with Google to create a student account');
        const result = await API.auth.registerGoogle(data);
        successEl.textContent = '✅ ' + (result.message || 'Google registration completed');
        successEl.classList.remove('hidden');
        form.reset();
        if (this.googleRegistration) {
          this.user = result;
          this.showApp();
          return;
        }
        // Auto-switch to login after 2 seconds
        setTimeout(() => {
          document.getElementById('register-panel').style.display = 'none';
          document.getElementById('login-panel').style.display = 'block';
          document.getElementById('login-box-title').textContent = 'Inventory Management';
          document.getElementById('login-username').value = data.username;
        }, 2000);
      } catch(err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      errEl.classList.add('hidden');
      try {
        const user = await API.auth.login(username, password);
        this.user = user;
        this.showApp();
      } catch(err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      try {
        await API.auth.logout();
      } finally {
        this.user = null;
        this.googleRegistration = false;
        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('login-panel').style.display = 'block';
        document.getElementById('register-panel').style.display = 'none';
        document.getElementById('login-box-title').textContent = 'Inventory Management';
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();
        const url = new URL(window.location.href);
        url.searchParams.delete('oauth');
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
      }
    });

    // Check if already logged in
    if (this.googleRegistration) {
      document.getElementById('login-panel').style.display = 'none';
      document.getElementById('register-panel').style.display = 'block';
      document.getElementById('login-box-title').textContent = 'Complete Google Registration';
      document.querySelector('#register-panel .verification-note').textContent = 'Your Google email is verified. Set a password and complete your student details to finish signup.';
    }
    API.auth.me().then(user => {
      this.user = user;
      this.showApp();
    }).catch(() => {
      // Not logged in, show login
    });
  },

  showApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('main-app').classList.add('active');

    // User info
    const userInfoEl = document.getElementById('user-info');
    const safeUser = (value) => API.escapeHtml(value || '');
    userInfoEl.innerHTML = `
      <strong>${safeUser(this.user.username)}</strong>
      <span class="badge ${this.user.role === 'coordinator' ? 'badge-purple' : 'badge-blue'}" style="font-size:10px;">${this.user.role}</span>
      ${this.user.profile ? `<div style="margin-top:4px;">${safeUser(this.user.profile.name)}</div>` : ''}
    `;

    // Build nav
    const nav = document.getElementById('sidebar-nav');
    const navItems = this.user.role === 'student'
      ? this.STUDENT_NAV
      : [...this.COORDINATOR_NAV, ...(this.user.role === 'ADMIN' ? this.ADMIN_NAV : [])];
    nav.innerHTML = navItems.map(item => {
      if (item.section) return `<div class="nav-section">${item.section}</div>`;
      return `<button class="nav-item" data-page="${item.id}" onclick="App.navigate('${item.id}')">
        <span class="icon">${item.icon}</span>${item.label}
      </button>`;
    }).join('');

    // Navigate to default page
    const defaultPage = this.user.role === 'student' ? 'portal' : 'dashboard';
    this.navigate(defaultPage);
  },

  navigate(pageId) {
    this.currentPage = pageId;
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageId);
    });
    // Render page
    const pages = {
      dashboard: DashboardPage,
      inventory: InventoryPage,
      students: StudentsPage,
      programmes: ProgrammesPage,
      issues: IssuesPage,
      returns: ReturnsPage,
      renewals: RenewalsPage,
      reports: ReportsPage,
      portal: StudentPortalPage,
      'issue-requests': IssueRequestsPage,
      users: UsersPage,
    };
    const page = pages[pageId];
    if (page) page.render();
  }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
