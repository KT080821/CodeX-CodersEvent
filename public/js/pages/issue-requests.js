const IssueRequestsPage = {
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = loading();
    try {
      const requests = await API.issueRequests.list();
      container.innerHTML = `<div class="page-header"><div><h2>Issue Requests</h2><p>Review student requests for available inventory</p></div></div>
        <div class="card"><div class="table-container"><table><thead><tr><th>Student</th><th>Item</th><th>Qty</th><th>Purpose</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${requests.length ? requests.map(r => `<tr><td><strong>${r.student_name}</strong><br><span class="text-muted text-sm">${r.enrolment_number}</span></td><td>${r.item_name}<br><code>${r.item_code}</code></td><td>${r.quantity}</td><td>${r.purpose || '—'}</td><td>${fmtDate(r.requested_at)}</td><td>${statusBadge(r.status)}</td><td>${r.status === 'pending' ? `<button class="btn btn-xs btn-success" onclick="IssueRequestsPage.decide(${r.id},'approved')">Approve</button> <button class="btn btn-xs btn-danger" onclick="IssueRequestsPage.decide(${r.id},'rejected')">Reject</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state" style="padding:32px;"><p>No student issue requests have been submitted yet.</p></div></td></tr>'}
        </tbody></table></div></div>`;
    } catch (e) { container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
  },
  async decide(id, status) {
    try {
      const result = await API.issueRequests.decide(id, status);
      toast(result.message || (status === 'approved' ? 'Item issued successfully' : 'Request rejected'), status === 'approved' ? 'success' : 'warning');
      this.render();
    }
    catch (e) { toast(e.message, 'danger'); }
  }
};
window.IssueRequestsPage = IssueRequestsPage;
