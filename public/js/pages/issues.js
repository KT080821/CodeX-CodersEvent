// Issues Page
const IssuesPage = {
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = loading();
    try {
      const issues = await API.issues.list();
      container.innerHTML = `
        <div class="page-header">
          <div><h2>Item Issues</h2><p>Issue items to students and manage active issues</p></div>
          <button class="btn btn-primary" onclick="IssuesPage.showIssue()">+ Issue Item</button>
        </div>
        <div class="search-bar">
          <input id="issue-search" placeholder="Search by student or item…" oninput="IssuesPage.filter()" />
          <select id="issue-status-filter" onchange="IssuesPage.filter()">
            <option value="">All Status</option>
            <option value="issued">Issued</option>
            <option value="overdue">Overdue</option>
            <option value="returned">Returned</option>
          </select>
        </div>
        <div class="card">
          <div class="table-container">
            <table>
              <thead><tr>
                <th>Student</th><th>Item</th><th>Asset/Qty</th><th>Purpose</th>
                <th>Issued</th><th>Due</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody id="issues-tbody">
                ${issues.map(i => this.row(i)).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  },

  row(i) {
    const isOverdue = i.status === 'overdue';
    return `<tr class="${isOverdue ? 'overdue-row' : ''}" data-student="${(i.student_name||'').toLowerCase()}" data-item="${(i.item_name||'').toLowerCase()}" data-status="${i.status}">
      <td><strong>${i.student_name}</strong><br><span class="text-muted text-sm">${i.enrolment_number}</span></td>
      <td>${i.item_name}<br><span class="text-muted text-sm">${i.item_code}</span></td>
      <td>${i.asset_code || i.quantity + 'x'}</td>
      <td>${i.purpose || '—'}</td>
      <td>${fmtDate(i.issue_date)}</td>
      <td class="${isOverdue ? 'text-danger' : ''}">${fmtDate(i.due_date)}${isOverdue ? `<br><span class="text-sm">${i.overdue_days > 0 ? i.overdue_days+'d overdue' : 'overdue'}</span>` : ''}</td>
      <td>${statusBadge(i.status)}</td>
      <td>
        <button class="btn btn-xs btn-secondary" onclick="IssuesPage.viewDetail(${i.id})">Detail</button>
        ${i.status !== 'returned' ? `<button class="btn btn-xs btn-warning" onclick="ReturnsPage.showReturn(${i.id})">Return</button>` : ''}
      </td>
    </tr>`;
  },

  filter() {
    const q = document.getElementById('issue-search').value.toLowerCase();
    const status = document.getElementById('issue-status-filter').value;
    document.querySelectorAll('#issues-tbody tr').forEach(tr => {
      tr.style.display = (!q || tr.dataset.student.includes(q) || tr.dataset.item.includes(q)) && (!status || tr.dataset.status === status) ? '' : 'none';
    });
  },

  async viewDetail(id) {
    const issue = await API.issues.get(id);
    const returnsHtml = issue.returns.length > 0 ? `
      <hr class="divider"><h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">Return History</h4>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <thead><tr style="background:var(--gray-50)"><th style="padding:6px 10px;">Date</th><th style="padding:6px 10px;">Qty</th><th style="padding:6px 10px;">Condition</th><th style="padding:6px 10px;">Received By</th></tr></thead>
        <tbody>${issue.returns.map(r => `<tr style="border-top:1px solid var(--gray-100)">
          <td style="padding:6px 10px;">${fmtDate(r.return_date)}</td>
          <td style="padding:6px 10px;">${r.quantity_returned}</td>
          <td style="padding:6px 10px;">${conditionBadge(r.condition)}</td>
          <td style="padding:6px 10px;">${r.received_by_name}</td>
        </tr>`).join('')}</tbody>
      </table>` : '';
    const renewalsHtml = issue.renewals.length > 0 ? `
      <hr class="divider"><h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">Renewal History</h4>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <thead><tr style="background:var(--gray-50)"><th style="padding:6px 10px;">Requested</th><th style="padding:6px 10px;">Status</th><th style="padding:6px 10px;">New Due</th><th style="padding:6px 10px;">Remarks</th></tr></thead>
        <tbody>${issue.renewals.map(r => `<tr style="border-top:1px solid var(--gray-100)">
          <td style="padding:6px 10px;">${fmtDate(r.request_date)}</td>
          <td style="padding:6px 10px;">${statusBadge(r.status)}</td>
          <td style="padding:6px 10px;">${r.revised_due_date ? fmtDate(r.revised_due_date) : '—'}</td>
          <td style="padding:6px 10px;">${r.remarks || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>` : '';

    const body = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;">
        <div><strong>Student:</strong> ${issue.student_name}</div>
        <div><strong>Enrolment:</strong> ${issue.enrolment_number}</div>
        <div><strong>Item:</strong> ${issue.item_name}</div>
        <div><strong>Asset/Qty:</strong> ${issue.asset_code || issue.quantity + 'x'}</div>
        <div><strong>Issue Date:</strong> ${fmtDate(issue.issue_date)}</div>
        <div><strong>Due Date:</strong> <span class="${issue.status==='overdue'?'text-danger':''}">${fmtDate(issue.due_date)}</span></div>
        <div><strong>Status:</strong> ${statusBadge(issue.status)}</div>
        <div><strong>Purpose:</strong> ${issue.purpose || '—'}</div>
        <div><strong>Issued By:</strong> ${issue.issued_by_name}</div>
      </div>
      ${returnsHtml}${renewalsHtml}`;
    const footer = issue.status !== 'returned' ? `
      <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      <button class="btn btn-warning" onclick="this.closest('.modal-overlay').remove();ReturnsPage.showReturn(${issue.id})">Record Return</button>` :
      `<button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>`;
    modal(`Issue #${issue.id} Details`, body, footer, 'modal-lg');
  },

  async showIssue() {
    const [students, items] = await Promise.all([API.students.list(), API.inventory.items()]);
    const body = `<form id="issue-form">
      <div class="form-group"><label>Student *</label>
        <select name="student_id" required id="issue-student-sel">
          <option value="">Select student…</option>
          ${students.map(s => `<option value="${s.id}">${s.name} (${s.enrolment_number})</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Item *</label>
        <select name="item_id" required id="issue-item-sel" onchange="IssuesPage.onItemChange(this.value)">
          <option value="">Select item…</option>
          ${items.map(i => `<option value="${i.id}" data-tracking="${i.tracking_type}" data-available="${i.available_quantity}">${i.name} (${i.item_code}) — ${i.available_quantity} available</option>`).join('')}
        </select>
      </div>
      <div id="asset-select-group" class="form-group hidden">
        <label>Select Asset *</label>
        <select name="asset_db_id" id="issue-asset-sel">
          <option value="">Loading…</option>
        </select>
      </div>
      <div id="qty-group" class="form-group hidden">
        <label>Quantity *</label>
        <input name="quantity" type="number" min="1" value="1">
      </div>
      <div class="form-group"><label>Purpose</label><input name="purpose" placeholder="e.g. Forensics lab assignment"></div>
      <div class="form-group"><label>Issue Date *</label><input name="issue_date" type="date" value="${today()}" required></div>
      <div id="issue-preview" class="alert alert-info hidden">Due date will be: <strong id="due-preview"></strong></div>
      <div id="issue-err" class="error-msg hidden"></div>
    </form>`;
    const ov = modal('Issue Item to Student', body, '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-primary" onclick="IssuesPage.submitIssue()">Issue Item</button>');
    document.querySelector('[name="issue_date"]').addEventListener('change', function() {
      const preview = document.getElementById('due-preview');
      if (this.value) { preview.textContent = fmtDate(addDays(this.value, 15)); document.getElementById('issue-preview').classList.remove('hidden'); }
    });
    document.querySelector('[name="issue_date"]').dispatchEvent(new Event('change'));
  },

  async onItemChange(itemId) {
    if (!itemId) return;
    const opt = document.querySelector(`#issue-item-sel option[value="${itemId}"]`);
    const tracking = opt.dataset.tracking;
    const assetGroup = document.getElementById('asset-select-group');
    const qtyGroup = document.getElementById('qty-group');
    if (tracking === 'individual') {
      assetGroup.classList.remove('hidden'); qtyGroup.classList.add('hidden');
      const assets = await API.inventory.assets(itemId);
      const avail = assets.filter(a => a.status === 'available' && a.condition === 'good');
      document.getElementById('issue-asset-sel').innerHTML = avail.length === 0
        ? '<option value="">No available assets</option>'
        : `<option value="">Select asset…</option>${avail.map(a => `<option value="${a.id}">${a.asset_id} (${a.serial_number || 'no serial'})</option>`).join('')}`;
    } else {
      assetGroup.classList.add('hidden'); qtyGroup.classList.remove('hidden');
    }
  },

  async submitIssue() {
    const form = document.getElementById('issue-form');
    const data = formData(form);
    const errEl = document.getElementById('issue-err');
    try {
      const result = await API.issues.create(data);
      document.querySelector('.modal-overlay').remove();
      toast(result.message || 'Item issued successfully', 'success');
      // Show acknowledgement
      const ackBody = `
        <div class="alert alert-success">✅ ${result.message}</div>
        <div class="ack-box">
          <h4>📋 Issue Acknowledgement</h4>
          <div class="ack-row"><span>Issue Reference</span><strong>#${result.id}</strong></div>
          <div class="ack-row"><span>Due Date</span><strong>${fmtDate(result.due_date)}</strong></div>
          <div class="ack-row"><span>Generated</span><strong>${fmtDateTime(new Date().toISOString())}</strong></div>
        </div>
        <p style="margin-top:12px;font-size:12px;color:var(--gray-500);">Items must be returned or renewed by the due date. Each approved renewal extends the due date by 15 days.</p>`;
      modal('Item Issued Successfully', ackBody, '<button class="btn btn-primary" onclick="this.closest(\'.modal-overlay\').remove();window.print()">Print</button><button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Close</button>');
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  }
};

window.IssuesPage = IssuesPage;
