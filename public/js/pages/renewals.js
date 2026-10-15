// Renewals Page
const RenewalsPage = {
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = loading();
    try {
      const pending = await API.renewals.pending();
      // Also get all issues for history
      const issues = await API.issues.list();
      const withRenewals = issues.filter(i => i.status !== 'returned');

      container.innerHTML = `
        <div class="page-header">
          <div><h2>Renewals</h2><p>Approve or reject student renewal requests</p></div>
        </div>

        <div class="card mb-4">
          <div class="card-header">
            <h3>Pending Renewal Requests</h3>
            <span class="badge badge-yellow">${pending.length}</span>
          </div>
          <div class="card-body" style="padding:0;">
            ${pending.length === 0 ? `<div class="empty-state" style="padding:24px;"><p>No pending requests 🎉</p></div>` : `
            <div class="table-container"><table>
              <thead><tr>
                <th>Student</th><th>Item</th><th>Requested On</th><th>Current Due</th><th>Actions</th>
              </tr></thead>
              <tbody>
                ${pending.map(r => `
                  <tr>
                    <td><strong>${r.student_name}</strong><br><span class="text-muted text-sm">${r.enrolment_number}</span></td>
                    <td>${r.item_name}${r.asset_code ? ` (${r.asset_code})` : ''}</td>
                    <td>${fmtDate(r.request_date)}</td>
                    <td class="${r.issue_status==='overdue'?'text-danger':''}">${fmtDate(r.current_due_date)}</td>
                    <td>
                      <button class="btn btn-sm btn-success" onclick="RenewalsPage.decide(${r.id},'approved')">✓ Approve</button>
                      <button class="btn btn-sm btn-danger" onclick="RenewalsPage.decide(${r.id},'rejected')">✕ Reject</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table></div>`}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Active Issues (All)</h3></div>
          <div class="card-body" style="padding:0;">
            <div class="table-container"><table>
              <thead><tr><th>Student</th><th>Item</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                ${withRenewals.map(i => `<tr class="${i.status==='overdue'?'overdue-row':''}">
                  <td>${i.student_name}</td>
                  <td>${i.item_name}${i.asset_code ? ` (${i.asset_code})` : ''}</td>
                  <td>${fmtDate(i.issue_date)}</td>
                  <td class="${i.status==='overdue'?'text-danger':''}">${fmtDate(i.due_date)}</td>
                  <td>${statusBadge(i.status)}</td>
                </tr>`).join('')}
              </tbody>
            </table></div>
          </div>
        </div>`;
    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  },

  async decide(renewalId, statusChoice) {
    let remarks = '';
    if (statusChoice === 'rejected') {
      remarks = window.prompt('Rejection reason (optional):') || '';
    }
    try {
      const result = await API.renewals.decide(renewalId, statusChoice, remarks);
      toast(result.message, statusChoice === 'approved' ? 'success' : 'warning');
      this.render();
    } catch(e) { toast(e.message, 'danger'); }
  }
};

window.RenewalsPage = RenewalsPage;
