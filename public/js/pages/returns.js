// Returns Page
const ReturnsPage = {
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = loading();
    try {
      const issues = await API.issues.list();
      const active = issues.filter(i => i.status === 'issued' || i.status === 'overdue');
      container.innerHTML = `
        <div class="page-header">
          <div><h2>Returns</h2><p>Record item returns and inspect conditions</p></div>
        </div>
        ${active.length === 0 ? emptyState('No active issues to return') : `
        <div class="card">
          <div class="table-container">
            <table>
              <thead><tr>
                <th>Student</th><th>Item</th><th>Asset/Qty</th><th>Due Date</th><th>Status</th><th>Action</th>
              </tr></thead>
              <tbody>
                ${active.map(i => `
                  <tr class="${i.status==='overdue'?'overdue-row':''}">
                    <td><strong>${i.student_name}</strong><br><span class="text-muted text-sm">${i.enrolment_number}</span></td>
                    <td>${i.item_name}</td>
                    <td>${i.asset_code || i.quantity + 'x'}</td>
                    <td class="${i.status==='overdue'?'text-danger':''}">${fmtDate(i.due_date)}</td>
                    <td>${statusBadge(i.status)}</td>
                    <td><button class="btn btn-sm btn-warning" onclick="ReturnsPage.showReturn(${i.id})">Record Return</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`}`;
    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  },

  async showReturn(issueId) {
    const issue = await API.issues.get(issueId);
    const alreadyReturned = issue.returns.reduce((s, r) => s + r.quantity_returned, 0);
    const outstanding = issue.quantity - alreadyReturned;

    const body = `<form id="return-form">
      <div class="alert alert-info">
        <strong>${issue.item_name}</strong>${issue.asset_code ? ` (${issue.asset_code})` : ''}<br>
        Student: ${issue.student_name} — Due: ${fmtDate(issue.due_date)}<br>
        Outstanding: <strong>${outstanding}</strong> item(s)
      </div>
      <div class="form-group"><label>Return Date *</label><input name="return_date" type="date" value="${today()}" required></div>
      <div class="form-group">
        <label>Quantity Returning *</label>
        <input name="quantity_returned" type="number" min="1" max="${outstanding}" value="${outstanding}" required>
        <span class="text-sm text-muted">Max: ${outstanding}</span>
      </div>
      <div class="form-group"><label>Condition on Return *</label>
        <select name="condition" required>
          <option value="good">Good (usable)</option>
          <option value="damaged">Damaged</option>
          <option value="lost">Lost / Missing</option>
        </select>
      </div>
      <div class="form-group"><label>Notes</label><textarea name="notes" rows="2" placeholder="Optional remarks…"></textarea></div>
      <input type="hidden" name="issue_id" value="${issueId}">
      <div id="return-err" class="error-msg hidden"></div>
    </form>`;
    modal('Record Return', body, '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-success" onclick="ReturnsPage.submitReturn()">Record Return</button>');
  },

  async submitReturn() {
    const form = document.getElementById('return-form');
    const data = formData(form);
    const errEl = document.getElementById('return-err');
    try {
      const result = await API.returns.record(data);
      document.querySelector('.modal-overlay').remove();
      toast(result.message, result.remaining > 0 ? 'warning' : 'success');
      // Refresh current page
      const cur = window.App ? App.currentPage : null;
      if (cur === 'returns') ReturnsPage.render();
      else if (cur === 'issues') IssuesPage.render();
      else if (cur === 'dashboard') DashboardPage.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  }
};

window.ReturnsPage = ReturnsPage;
