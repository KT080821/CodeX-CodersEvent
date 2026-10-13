// Student Portal Page
const StudentPortalPage = {
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = loading();
    try {
      const [issues, overdue, upcoming] = await Promise.all([
        API.issues.list(),
        API.reports.overdue(),
        API.reports.upcoming(),
      ]);

      const activeIssues = issues.filter(i => i.status === 'issued' || i.status === 'overdue');
      const returnedIssues = issues.filter(i => i.status === 'returned');

      container.innerHTML = `
        <div class="page-header">
          <div><h2>My Items</h2><p>Your issued items, due dates, and renewal status</p></div>
        </div>

        ${overdue.length > 0 ? `
        <div class="alert alert-danger">
          ⚠️ You have <strong>${overdue.length}</strong> overdue item(s). Please return or contact the coordinator immediately.
        </div>` : ''}

        ${upcoming.length > 0 ? `
        <div class="alert alert-warning">
          🔔 You have <strong>${upcoming.length}</strong> item(s) due within 3 days. Consider requesting a renewal if needed.
        </div>` : ''}

        <!-- Active Issues -->
        <div class="card mb-4">
          <div class="card-header"><h3>Active Issues</h3><span class="badge badge-blue">${activeIssues.length}</span></div>
          <div class="card-body" style="padding:0;">
            ${activeIssues.length === 0
              ? `<div class="empty-state" style="padding:24px;"><p>No active issues</p></div>`
              : `<div class="table-container"><table>
              <thead><tr><th>Item</th><th>Asset</th><th>Qty</th><th>Issued</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${activeIssues.map(i => `
                  <tr class="${i.status==='overdue'?'overdue-row':''}">
                    <td><strong>${i.item_name}</strong><br><span class="text-muted text-sm">${i.item_code}</span></td>
                    <td>${i.asset_code || '—'}</td>
                    <td>${i.quantity}</td>
                    <td>${fmtDate(i.issue_date)}</td>
                    <td class="${i.status==='overdue'?'text-danger':''}">${fmtDate(i.due_date)}${i.status==='overdue'?`<br><span class="text-sm">${i.overdue_days>0?i.overdue_days+'d overdue':'overdue'}</span>`:''}</td>
                    <td>${statusBadge(i.status)}</td>
                    <td>
                      <button class="btn btn-xs btn-primary" onclick="StudentPortalPage.requestRenewal(${i.id}, '${i.item_name}')">Request Renewal</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table></div>`}
          </div>
        </div>

        <!-- Renewal Status -->
        <div class="card mb-4" id="renewal-status-card">
          <div class="card-header"><h3>Renewal Requests</h3></div>
          <div class="card-body" style="padding:0;" id="renewal-status-body">
            <div style="padding:16px;color:var(--gray-400);text-align:center;">Loading…</div>
          </div>
        </div>

        <!-- History -->
        <div class="card">
          <div class="card-header"><h3>Issue History</h3></div>
          <div class="card-body" style="padding:0;">
            ${returnedIssues.length === 0
              ? `<div class="empty-state" style="padding:24px;"><p>No returned items yet</p></div>`
              : `<div class="table-container"><table>
              <thead><tr><th>Item</th><th>Asset</th><th>Qty</th><th>Issued</th><th>Returned</th><th>Status</th></tr></thead>
              <tbody>
                ${returnedIssues.map(i => `<tr>
                  <td>${i.item_name}</td>
                  <td>${i.asset_code || '—'}</td>
                  <td>${i.quantity}</td>
                  <td>${fmtDate(i.issue_date)}</td>
                  <td>${fmtDate(i.due_date)}</td>
                  <td>${statusBadge(i.status)}</td>
                </tr>`).join('')}
              </tbody></table></div>`}
          </div>
        </div>`;

      // Load renewal status
      this.loadRenewalStatus(activeIssues);
    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  },

  async loadRenewalStatus(activeIssues) {
    const body = document.getElementById('renewal-status-body');
    if (!body) return;
    if (activeIssues.length === 0) { body.innerHTML = `<div class="empty-state" style="padding:24px;"><p>No active issues</p></div>`; return; }

    // Get renewal requests for each active issue
    const allRenewals = [];
    for (const issue of activeIssues) {
      const detail = await API.issues.get(issue.id);
      detail.renewals.forEach(r => allRenewals.push({ ...r, item_name: issue.item_name, asset_code: issue.asset_code }));
    }

    if (allRenewals.length === 0) {
      body.innerHTML = `<div class="empty-state" style="padding:24px;"><p>No renewal requests made yet</p></div>`;
      return;
    }

    body.innerHTML = `<div class="table-container"><table>
      <thead><tr><th>Item</th><th>Requested</th><th>Status</th><th>New Due Date</th><th>Remarks</th></tr></thead>
      <tbody>${allRenewals.map(r => `<tr>
        <td>${r.item_name}${r.asset_code ? ` (${r.asset_code})` : ''}</td>
        <td>${fmtDate(r.request_date)}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.revised_due_date ? fmtDate(r.revised_due_date) : '—'}</td>
        <td>${r.remarks || '—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  },

  async requestRenewal(issueId, itemName) {
    if (!window.confirm(`Request renewal for ${itemName}?\n\nNote: Due date will only be extended after coordinator approval.`)) return;
    try {
      const result = await API.renewals.request(issueId);
      toast(result.message, 'success');
      this.render();
    } catch(e) { toast(e.message, 'danger'); }
  }
};
