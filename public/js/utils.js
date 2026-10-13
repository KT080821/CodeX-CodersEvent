// Utility functions
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  const map = {
    issued: 'badge-blue',
    returned: 'badge-green',
    overdue: 'badge-red',
    lost: 'badge-gray',
    pending: 'badge-yellow',
    approved: 'badge-green',
    rejected: 'badge-red',
    available: 'badge-green',
    good: 'badge-green',
    damaged: 'badge-red',
    maintenance: 'badge-yellow',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}

function conditionBadge(c) {
  return statusBadge(c);
}

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `alert alert-${type}`;
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;min-width:280px;max-width:400px;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:fadeIn 0.2s ease;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function confirm(msg) {
  return window.confirm(msg);
}

function modal(title, bodyHtml, footerHtml, cls = '') {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `
    <div class="modal ${cls}">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>`;
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  return ov;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'onclick') e.onclick = v;
    else e.setAttribute(k, v);
  });
  children.forEach(c => {
    if (typeof c === 'string') e.insertAdjacentHTML('beforeend', c);
    else if (c) e.appendChild(c);
  });
  return e;
}

function loading() {
  return '<div style="text-align:center;padding:40px;color:var(--gray-400)">Loading…</div>';
}

function emptyState(msg) {
  return `<div class="empty-state"><div class="icon">📭</div><p>${msg}</p></div>`;
}

function overdueText(days) {
  if (days <= 0) return '';
  return days === 1 ? 'overdue by 1 day' : `overdue by ${days} days`;
}

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n%100;
  return n + (s[(v-20)%10]||s[v]||s[0]);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// Form serializer
function formData(form) {
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = v; });
  return data;
}

function setLoading(btn, state) {
  btn.disabled = state;
  btn.dataset.orig = btn.dataset.orig || btn.textContent;
  btn.textContent = state ? 'Please wait…' : btn.dataset.orig;
}
