// Central API helper
const API = {
  csrfToken: null,
  escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  },
  transform(value, transform) {
    if (Array.isArray(value)) return value.map(item => API.transform(item, transform));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, API.transform(item, transform)]));
    }
    return typeof value === 'string' ? transform(value) : value;
  },
  async getCsrfToken() {
    if (!this.csrfToken) {
      const res = await fetch('/api/auth/csrf', { credentials: 'include' });
      const data = await this.parseResponse(res);
      if (!res.ok || !data.token) throw new Error('Unable to establish a secure session');
      this.csrfToken = data.token;
    }
    return this.csrfToken;
  },
  async parseResponse(res) {
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    if (!text) return {};
    if (!contentType.includes('application/json')) {
      throw new Error(res.ok
        ? 'The server returned an unexpected response. Please refresh and try again.'
        : `Server error (${res.status}). Please try again later.`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('The server returned invalid data. Please refresh and try again.');
    }
  },
  async request(method, url, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      opts.headers['X-CSRF-Token'] = await this.getCsrfToken();
    }
    if (body) opts.body = JSON.stringify(API.transform(body, value => value
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")));
    const res = await fetch(url, opts);
    const data = await this.parseResponse(res);
    const safeData = API.transform(data, value => API.escapeHtml(value));
    if (!res.ok) throw new Error(safeData.error || 'Request failed');
    return safeData;
  },
  get: (url) => API.request('GET', url),
  post: (url, body) => API.request('POST', url, body),
  put: (url, body) => API.request('PUT', url, body),
  delete: (url) => API.request('DELETE', url),

  auth: {
    login: async (u, p) => {
      const result = await API.post('/api/auth/login', { username: u, password: p });
      API.csrfToken = null;
      return result;
    },
    logout: () => API.post('/api/auth/logout'),
    me: () => API.get('/api/auth/me'),
    googleConfig: () => API.get('/api/auth/google/config'),
    registerGoogle: (data) => API.post('/api/auth/register/google', data),
  },
  users: {
    list: () => API.get('/api/users'),
    create: (data) => API.post('/api/users', data),
    remove: (id) => API.delete(`/api/users/${id}`),
  },
  issueRequests: {
    mine: () => API.get('/api/issue-requests/mine'),
    list: () => API.get('/api/issue-requests'),
    create: (data) => API.post('/api/issue-requests', data),
    decide: (id, status, note) => API.post(`/api/issue-requests/${id}/decide`, { status, note }),
  },
  programmes: {
    list: () => API.get('/api/programmes'),
    create: (data) => API.post('/api/programmes', data),
    update: (id, data) => API.put(`/api/programmes/${id}`, data),
    remove: (id) => API.delete(`/api/programmes/${id}`),
  },
  students: {
    list: () => API.get('/api/students'),
    get: (id) => API.get(`/api/students/${id}`),
    create: (data) => API.post('/api/students', data),
    update: (id, data) => API.put(`/api/students/${id}`, data),
    remove: (id) => API.delete(`/api/students/${id}`),
  },
  inventory: {
    items: () => API.get('/api/inventory/items'),
    item: (id) => API.get(`/api/inventory/items/${id}`),
    createItem: (data) => API.post('/api/inventory/items', data),
    updateItem: (id, data) => API.put(`/api/inventory/items/${id}`, data),
    assets: (itemId) => API.get(`/api/inventory/assets${itemId ? '?item_id='+itemId : ''}`),
    addAsset: (data) => API.post('/api/inventory/assets', data),
    updateAsset: (id, data) => API.put(`/api/inventory/assets/${id}`, data),
    adjust: (id, data) => API.post(`/api/inventory/items/${id}/adjust`, data),
    locations: () => API.get('/api/inventory/locations'),
    addLocation: (data) => API.post('/api/inventory/locations', data),
    updateLocation: (id, data) => API.put(`/api/inventory/locations/${id}`, data),
  },
  issues: {
    list: () => API.get('/api/issues'),
    get: (id) => API.get(`/api/issues/${id}`),
    create: (data) => API.post('/api/issues', data),
  },
  returns: {
    record: (data) => API.post('/api/returns', data),
  },
  renewals: {
    request: (issueId) => API.post('/api/renewals/request', { issue_id: issueId }),
    pending: () => API.get('/api/renewals/pending'),
    decide: (id, status, remarks) => API.post(`/api/renewals/decide/${id}`, { status, remarks }),
  },
  reports: {
    summary: () => API.get('/api/reports/summary'),
    overdue: () => API.get('/api/reports/overdue'),
    upcoming: () => API.get('/api/reports/upcoming'),
    byStudent: (id) => API.get(`/api/reports/by-student/${id}`),
    byItem: (id) => API.get(`/api/reports/by-item/${id}`),
    byProgramme: () => API.get('/api/reports/by-programme'),
    audit: () => API.get('/api/reports/audit'),
    adjustments: () => API.get('/api/reports/adjustments'),
  }
};
