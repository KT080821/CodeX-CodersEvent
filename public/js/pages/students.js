// Students Page
const StudentsPage = {
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = loading();
    try {
      const students = await API.students.list();
      container.innerHTML = `
        <div class="page-header">
          <div><h2>Students</h2><p>Manage registered students</p></div>
          <button class="btn btn-primary" onclick="StudentsPage.showAdd()">+ Add Student</button>
        </div>
        <div class="search-bar">
          <input id="student-search" placeholder="Search by name or enrolment…" oninput="StudentsPage.filter()" />
          <select id="prog-filter" onchange="StudentsPage.filter()">
            <option value="">All Programmes</option>
            ${[...new Set(students.map(s => s.programme))].map(p => `<option>${p}</option>`).join('')}
          </select>
        </div>
        <div class="card">
          <div class="table-container">
            <table>
              <thead><tr><th>Name</th><th>Enrolment No.</th><th>Programme</th><th>Semester</th><th>Contact</th><th>Actions</th></tr></thead>
              <tbody id="students-tbody">
                ${students.map(s => `
                  <tr data-name="${s.name.toLowerCase()}" data-enrol="${s.enrolment_number.toLowerCase()}" data-prog="${s.programme}">
                    <td><strong>${s.name}</strong></td>
                    <td><code>${s.enrolment_number}</code></td>
                    <td>${s.programme}</td>
                    <td>Sem ${s.semester}</td>
                    <td>${s.email || '—'}<br><span class="text-muted text-sm">${s.phone || ''}</span></td>
                    <td>
                      <button class="btn btn-xs btn-secondary" onclick="StudentsPage.viewHistory(${s.id}, '${s.name}')">History</button>
                      <button class="btn btn-xs btn-secondary" onclick="StudentsPage.showEdit(${s.id})">Edit</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  },

  filter() {
    const q = document.getElementById('student-search').value.toLowerCase();
    const prog = document.getElementById('prog-filter').value;
    document.querySelectorAll('#students-tbody tr').forEach(tr => {
      const nameMatch = !q || tr.dataset.name.includes(q) || tr.dataset.enrol.includes(q);
      const progMatch = !prog || tr.dataset.prog === prog;
      tr.style.display = nameMatch && progMatch ? '' : 'none';
    });
  },

  async viewHistory(studentId, name) {
    const rows = await API.reports.byStudent(studentId);
    const body = rows.length === 0 ? emptyState('No issue history') : `
      <div class="table-container"><table>
        <thead><tr><th>Item</th><th>Asset</th><th>Qty</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="${r.status==='overdue'?'overdue-row':''}">
          <td>${r.item_name}<br><span class="text-muted text-sm">${r.item_code}</span></td>
          <td>${r.asset_code||'—'}</td>
          <td>${r.quantity}</td>
          <td>${fmtDate(r.issue_date)}</td>
          <td>${fmtDate(r.due_date)}</td>
          <td>${statusBadge(r.status)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    modal(`Issue History: ${name}`, body, '', 'modal-lg');
  },

  showAdd() {
    const body = `<form id="add-student-form" class="form-grid">
      <div class="form-group"><label>Full Name *</label><input name="name" required></div>
      <div class="form-group"><label>Enrolment Number *</label><input name="enrolment_number" required placeholder="e.g. MSDFIS2024004"></div>
      <div class="form-group"><label>Programme *</label><input name="programme" required placeholder="e.g. M.Sc. DFIS"></div>
      <div class="form-group"><label>Semester *</label><input name="semester" type="number" min="1" required></div>
      <div class="form-group"><label>Email</label><input name="email" type="email"></div>
      <div class="form-group"><label>Phone</label><input name="phone"></div>
      <div class="form-group"><label>Username *</label><input name="username" required></div>
      <div class="form-group"><label>Password *</label><input name="password" type="password" required></div>
      <div id="add-student-err" class="error-msg hidden form-group-full"></div>
    </form>`;
    modal('Add Student', body, '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-primary" onclick="StudentsPage.submitAdd()">Add Student</button>');
  },

  async submitAdd() {
    const form = document.getElementById('add-student-form');
    const data = formData(form);
    const errEl = document.getElementById('add-student-err');
    try {
      await API.students.create(data);
      document.querySelector('.modal-overlay').remove();
      toast('Student added');
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  },

  async showEdit(id) {
    const s = await API.students.get(id);
    const body = `<form id="edit-student-form" class="form-grid">
      <div class="form-group"><label>Full Name</label><input name="name" value="${s.name}" required></div>
      <div class="form-group"><label>Programme</label><input name="programme" value="${s.programme}" required></div>
      <div class="form-group"><label>Semester</label><input name="semester" type="number" value="${s.semester}" required></div>
      <div class="form-group"><label>Email</label><input name="email" value="${s.email||''}"></div>
      <div class="form-group"><label>Phone</label><input name="phone" value="${s.phone||''}"></div>
      <div id="edit-student-err" class="error-msg hidden form-group-full"></div>
    </form>`;
    modal('Edit Student', body, `<button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button><button class="btn btn-primary" onclick="StudentsPage.submitEdit(${id})">Save</button>`);
  },

  async submitEdit(id) {
    const form = document.getElementById('edit-student-form');
    const data = formData(form);
    const errEl = document.getElementById('edit-student-err');
    try {
      await API.students.update(id, data);
      document.querySelector('.modal-overlay').remove();
      toast('Student updated');
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  }
};
