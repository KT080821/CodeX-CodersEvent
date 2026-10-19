// Programmes Management Page
const ProgrammesPage = {
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = loading();
    try {
      const programmes = await API.programmes.list();
      container.innerHTML = `
        <div class="page-header">
          <div>
            <h2>Programmes</h2>
            <p>Manage academic programmes available for student registration</p>
          </div>
          <button class="btn btn-primary" onclick="ProgrammesPage.showAdd()">+ Add Programme</button>
        </div>

        <div class="card">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Programme Name</th>
                  <th>Duration (Semesters)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${programmes.length === 0
                  ? `<tr><td colspan="4" style="text-align:center;padding:32px;color:#6B4A6B;">No programmes added yet</td></tr>`
                  : programmes.map((p, i) => `
                  <tr>
                    <td style="color:#3A1E3A;">${i + 1}</td>
                    <td><strong style="color:#1F1147;">${p.name}</strong></td>
                    <td style="color:#3A1E3A;">${p.duration_semesters} semesters</td>
                    <td>
                      <button class="btn btn-xs btn-secondary" onclick="ProgrammesPage.showEdit(${p.id}, '${p.name.replace(/'/g,"\\'")}', ${p.duration_semesters})">Edit</button>
                      <button class="btn btn-xs btn-danger" onclick="ProgrammesPage.remove(${p.id}, '${p.name.replace(/'/g,"\\'")}')">Delete</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="alert alert-info mt-4">
          💡 These programmes appear in the student self-registration dropdown. Add all programmes offered by your department here.
        </div>
      `;
    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  },

  showAdd() {
    const body = `<form id="prog-form">
      <div class="form-group">
        <label>Programme Name *</label>
        <input name="name" required placeholder="e.g. M.Sc. Forensic Science">
      </div>
      <div class="form-group">
        <label>Duration (number of semesters) *</label>
        <input name="duration_semesters" type="number" min="1" max="12" value="4" required>
      </div>
      <div id="prog-err" class="error-msg hidden"></div>
    </form>`;
    modal('Add Programme', body,
      `<button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
       <button class="btn btn-primary" onclick="ProgrammesPage.submitAdd()">Add Programme</button>`
    );
  },

  async submitAdd() {
    const form = document.getElementById('prog-form');
    const data = formData(form);
    const errEl = document.getElementById('prog-err');
    try {
      await API.programmes.create(data);
      document.querySelector('.modal-overlay').remove();
      toast('Programme added successfully');
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  },

  showEdit(id, name, duration) {
    const body = `<form id="prog-edit-form">
      <div class="form-group">
        <label>Programme Name *</label>
        <input name="name" required value="${name}">
      </div>
      <div class="form-group">
        <label>Duration (number of semesters) *</label>
        <input name="duration_semesters" type="number" min="1" max="12" value="${duration}" required>
      </div>
      <div id="prog-edit-err" class="error-msg hidden"></div>
    </form>`;
    modal('Edit Programme', body,
      `<button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
       <button class="btn btn-primary" onclick="ProgrammesPage.submitEdit(${id})">Save Changes</button>`
    );
  },

  async submitEdit(id) {
    const form = document.getElementById('prog-edit-form');
    const data = formData(form);
    const errEl = document.getElementById('prog-edit-err');
    try {
      await API.programmes.update(id, data);
      document.querySelector('.modal-overlay').remove();
      toast('Programme updated');
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  },

  async remove(id, name) {
    if (!window.confirm(`Delete programme "${name}"?\n\nThis will NOT delete existing students. It will only remove it from the registration dropdown.`)) return;
    try {
      await API.programmes.remove(id);
      toast('Programme deleted');
      this.render();
    } catch(e) {
      toast(e.message, 'danger');
    }
  }
};
