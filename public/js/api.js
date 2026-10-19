// Central API helper
const API = {
  async request(method, url, body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  get: (url) => API.request('GET', url),
  post: (url, body) => API.request('POST', url, body),
  put: (url, body) => API.request('PUT', url, body),
  delete: (url) => API.request('DELETE', url),

  auth: {
    login: (u, p) => API.post('/api/auth/login', { username: u, password: p }),
    logout: () => API.post('/api/auth/logout'),
    me: () => API.get('/api/auth/me'),
    register: (data) => API.post('/api/auth/register', data),
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
