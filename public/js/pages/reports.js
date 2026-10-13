// Reports Page
const ReportsPage = {
  currentTab: 'overdue',

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Reports</h2><p>View and export inventory and transaction records</p></div>
        <button class="btn btn-secondary" onclick="window.print()">🖨 Print</button>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--gray-200);padding-bottom:0;">
        <button class="tab-btn ${this.currentTab==='overdue'?'active':''}" data-tab="overdue">⚠️ Overdue</button>
        <button class="tab-btn ${this.currentTab==='programme'?'active':''}" data-tab="programme">📚 By Programme</button>
        <button class="tab-btn ${this.currentTab==='audit'?'active':''}" data-tab="audit">📋 Audit Log</button>
      </div>
      <div id="report-tab-content"></div>`;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.style.cssText = 'padding:8px 16px;border:none;background:none;cursor:pointer;font-size:13.5px;font-weight:500;color:var(--gray-500);border-bottom:2px solid transparent;margin-bottom:-1px;';
      if (btn.classList.contains('active')) { btn.style.borderBottomColor = 'var(--primary)'; btn.style.color = 'var(--primary)'; }
      btn.addEventListener('click', () => { this.currentTab = btn.dataset.tab; this.render(); });
    });
    await this.renderTab();
  },

  async renderTab() {
    const c = document.getElementById('report-tab-content');
    c.innerHTML = loading();
    if (this.currentTab === 'overdue') await this.renderOverdue(c);
    else if (this.currentTab === 'programme') await this.renderProgramme(c);
    else if (this.currentTab === 'audit') await this.renderAudit(c);
  },

  async renderOverdue(c) {
    const rows = await API.reports.overdue();
    if (rows.length === 0) { c.innerHTML = `<div class="alert alert-success">✅ No overdue items!</div>`; return; }
    c.innerHTML = `<div class="card"><div class="table-container"><table>
      <thead><tr><th>Student</th><th>Enrolment</th><th>Programme</th><th>Item</th><th>Asset</th><th>Qty</th><th>Due Date</th><th>Overdue By</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr class="overdue-row">
          <td>${r.student_name}</td>
          <td>${r.enrolment_number}</td>
          <td>${r.programme}, Sem ${r.semester}</td>
          <td>${r.item_name} (${r.item_code})</td>
          <td>${r.asset_code || '—'}</td>
          <td>${r.quantity}</td>
          <td class="text-danger">${fmtDate(r.due_date)}</td>
          <td class="text-danger">${r.overdue_days > 0 ? r.overdue_days + ' days' : '< 1 day'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div></div>`;
    // Generate formatted text description
    const desc = rows.map(r => {
      const assetPart = r.asset_code ? `${r.item_name} ${r.asset_code}` : `${r.quantity}x ${r.item_name}`;
      const daysPart = r.overdue_days > 0 ? `${r.overdue_days} day${r.overdue_days===1?'':'s'}` : 'less than a day';
      return `${assetPart} issued to ${r.enrolment_number} was due on ${fmtDate(r.due_date)} and is overdue by ${daysPart}.`;
    });
    c.innerHTML += `<div class="card mt-4"><div class="card-header"><h3>Formatted Overdue Report</h3></div><div class="card-body">
      ${desc.map(d => `<p style="margin-bottom:8px;font-size:13px;color:var(--gray-700);">⚠️ ${d}</p>`).join('')}
    </div></div>`;
  },

  async renderProgramme(c) {
    const rows = await API.reports.byProgramme();
    c.innerHTML = `<div class="card"><div class="table-container"><table>
      <thead><tr><th>Programme</th><th>Semester</th><th>Total Issues</th><th>Active</th><th>Overdue</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${r.programme}</td>
        <td>Sem ${r.semester}</td>
        <td>${r.total_issues}</td>
        <td>${r.active}</td>
        <td class="${r.overdue>0?'text-danger':''}">${r.overdue}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  },

  async renderAudit(c) {
    const rows = await API.reports.audit();
    c.innerHTML = rows.length === 0 ? emptyState('No audit records') : `
      <div class="card"><div class="table-container"><table>
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td style="font-size:12px;">${fmtDateTime(r.timestamp)}</td>
          <td>${r.username || '—'}</td>
          <td><code style="font-size:11px;">${r.action}</code></td>
          <td style="font-size:12px;">${r.entity_type}</td>
          <td style="font-size:12px;max-width:300px;">${r.details || '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div></div>`;
  }
};
