const UsersPage = {
  async render() {
    const container = document.getElementById('page-container');
    const users = await API.users.list();
    container.innerHTML = `<div class="page-header"><div><h2>User Management</h2><p>ADMIN control of coordinators, students, and administrators</p></div><button class="btn btn-primary" onclick="UsersPage.showAdd()">+ Add User</button></div>
      <div class="card"><div class="table-container"><table><thead><tr><th>Username</th><th>Role</th><th>Email</th><th>Created</th><th>Action</th></tr></thead><tbody>
      ${users.map(u => `<tr><td><strong>${u.username}</strong></td><td>${u.role}</td><td>${u.email || '—'}</td><td>${fmtDate(u.created_at)}</td><td><button class="btn btn-xs btn-danger" onclick="UsersPage.remove(${u.id},'${u.username}')">Delete</button></td></tr>`).join('')}
      </tbody></table></div></div>`;
  },
  showAdd() {
    modal('Add User', `<form id="add-user-form" class="form-grid"><div class="form-group"><label>Username *</label><input name="username" required></div><div class="form-group"><label>Password *</label><input name="password" type="password" required></div><div class="form-group"><label>Role *</label><select name="role"><option>coordinator</option><option>student</option><option>ADMIN</option></select></div><div class="form-group"><label>Email</label><input name="email" type="email"></div><div class="form-group"><label>Name (student)</label><input name="name"></div><div class="form-group"><label>Enrolment (student)</label><input name="enrolment_number"></div><div class="form-group"><label>Programme (student)</label><input name="programme"></div><div class="form-group"><label>Semester (student)</label><input name="semester" type="number"></div></form>`, `<button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button><button class="btn btn-primary" onclick="UsersPage.submitAdd()">Create</button>`);
  },
  async submitAdd() {
    try { await API.users.create(formData(document.getElementById('add-user-form'))); document.querySelector('.modal-overlay').remove(); toast('User created','success'); this.render(); }
    catch (e) { toast(e.message, 'danger'); }
  },
  async remove(id, username) {
    if (!confirm(`Delete ${username}?`)) return;
    try { await API.users.remove(id); toast('User deleted','success'); this.render(); } catch (e) { toast(e.message, 'danger'); }
  }
};
window.UsersPage = UsersPage;
