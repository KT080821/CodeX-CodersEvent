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
    { section: 'Analytics' },
    { id: 'reports', label: 'Reports', icon: '📋' },
  ],

  STUDENT_NAV: [
    { section: 'My Account' },
    { id: 'portal', label: 'My Items', icon: '📚' },
  ],

  init() {
    // Toggle between login and register panels
    document.getElementById('show-register-btn').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-panel').style.display = 'none';
      document.getElementById('register-panel').style.display = 'block';
      document.getElementById('login-box-title').textContent = 'Create Account';
    });
    document.getElementById('show-login-btn').addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-panel').style.display = 'none';
      document.getElementById('login-panel').style.display = 'block';
      document.getElementById('login-box-title').textContent = 'Inventory Management';
    });

    // Load programmes into register dropdown
    API.programmes.list().then(progs => {
      const sel = document.getElementById('reg-programme-sel');
      if (sel) {
        progs.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.name;
          opt.textContent = p.name;
          sel.appendChild(opt);
        });
      }
    }).catch(() => {});

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
        const result = await API.post('/api/auth/register', data);
        successEl.textContent = '✅ ' + result.message;
        successEl.classList.remove('hidden');
        form.reset();
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
      await API.auth.logout();
      this.user = null;
      document.getElementById('main-app').classList.add('hidden');
      document.getElementById('login-screen').classList.add('active');
      document.getElementById('login-form').reset();
    });

    // Check if already logged in
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
    userInfoEl.innerHTML = `
      <strong>${this.user.username}</strong>
      <span class="badge ${this.user.role === 'coordinator' ? 'badge-purple' : 'badge-blue'}" style="font-size:10px;">${this.user.role}</span>
      ${this.user.profile ? `<div style="margin-top:4px;">${this.user.profile.name}</div>` : ''}
    `;

    // Build nav
    const nav = document.getElementById('sidebar-nav');
    const navItems = this.user.role === 'coordinator' ? this.COORDINATOR_NAV : this.STUDENT_NAV;
    nav.innerHTML = navItems.map(item => {
      if (item.section) return `<div class="nav-section">${item.section}</div>`;
      return `<button class="nav-item" data-page="${item.id}" onclick="App.navigate('${item.id}')">
        <span class="icon">${item.icon}</span>${item.label}
      </button>`;
    }).join('');

    // Navigate to default page
    const defaultPage = this.user.role === 'coordinator' ? 'dashboard' : 'portal';
    this.navigate(defaultPage);
  },

  navigate(pageId) {
    this.currentPage = pageId;
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
    };
    const page = pages[pageId];
    if (page) page.render();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
