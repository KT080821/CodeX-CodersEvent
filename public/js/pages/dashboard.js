// Dashboard Page
const DashboardPage = {
  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = loading();
    try {
      const [summary, overdue, upcoming, pendingRenewals, allStudents] = await Promise.all([
        API.reports.summary(),
        API.reports.overdue(),
        API.reports.upcoming(),
        API.renewals.pending(),
        API.students.list(),
      ]);

      const items = summary.items || [];
      const totalItems = items.length;
      const totalAvailable = items.reduce((s, i) => s + i.available_quantity, 0);

      container.innerHTML = `
        <div class="page-header">
          <div>
            <h2>Dashboard</h2>
            <p>Overview of department inventory status</p>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card info">
            <div class="stat-label">Inventory Items</div>
            <div class="stat-value">${totalItems}</div>
            <div class="stat-sub">${totalAvailable} units available</div>
          </div>
          <div class="stat-card info">
            <div class="stat-label">Active Issues</div>
            <div class="stat-value">${summary.totalIssued}</div>
            <div class="stat-sub">currently issued</div>
          </div>
          <div class="stat-card danger">
            <div class="stat-label">Overdue Items</div>
            <div class="stat-value">${overdue.length}</div>
            <div class="stat-sub">require attention</div>
          </div>
          <div class="stat-card warning">
            <div class="stat-label">Due Soon</div>
            <div class="stat-value">${upcoming.length}</div>
            <div class="stat-sub">within 3 days</div>
          </div>
          <div class="stat-card warning">
            <div class="stat-label">Pending Renewals</div>
            <div class="stat-value">${pendingRenewals.length}</div>
            <div class="stat-sub">awaiting approval</div>
          </div>
          <div class="stat-card info">
            <div class="stat-label">Students</div>
            <div class="stat-value">${summary.totalStudents}</div>
            <div class="stat-sub">registered</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
          <!-- Overdue -->
          <div class="card">
            <div class="card-header">
              <h3>⚠️ Overdue Items</h3>
              <span class="badge badge-red">${overdue.length}</span>
            </div>
            <div class="card-body" style="padding:0;">
              ${overdue.length === 0
                ? `<div class="empty-state" style="padding:24px;"><p>No overdue items 🎉</p></div>`
                : `<div class="table-container"><table>
                  <thead><tr><th>Student</th><th>Item</th><th>Due</th><th>Overdue</th></tr></thead>
                  <tbody>
                    ${overdue.map(r => `
                      <tr class="overdue-row">
                        <td>${r.student_name}<br><span class="text-muted text-sm">${r.enrolment_number}</span></td>
                        <td>${r.item_name}${r.asset_code ? `<br><span class="text-muted text-sm">${r.asset_code}</span>` : ''}</td>
                        <td class="text-danger">${fmtDate(r.due_date)}</td>
                        <td class="text-danger">${r.overdue_days > 0 ? r.overdue_days + 'd' : '—'}</td>
                      </tr>`).join('')}
                  </tbody></table></div>`}
            </div>
          </div>

          <!-- Due Soon -->
          <div class="card">
            <div class="card-header">
              <h3>🔔 Due Soon</h3>
              <span class="badge badge-yellow">${upcoming.length}</span>
            </div>
            <div class="card-body" style="padding:0;">
              ${upcoming.length === 0
                ? `<div class="empty-state" style="padding:24px;"><p>Nothing due in 3 days</p></div>`
                : `<div class="table-container"><table>
                  <thead><tr><th>Student</th><th>Item</th><th>Due</th><th>Days Left</th></tr></thead>
                  <tbody>
                    ${upcoming.map(r => `
                      <tr>
                        <td>${r.student_name}</td>
                        <td>${r.item_name}${r.asset_code ? ` (${r.asset_code})` : ''}</td>
                        <td>${fmtDate(r.due_date)}</td>
                        <td class="text-warning">${r.days_until_due}d</td>
                      </tr>`).join('')}
                  </tbody></table></div>`}
            </div>
          </div>
        </div>

        <!-- Pending Renewals -->
        ${pendingRenewals.length > 0 ? `
        <div class="card mt-4">
          <div class="card-header">
            <h3>🔄 Pending Renewal Requests</h3>
            <button class="btn btn-sm btn-primary" onclick="App.navigate('renewals')">View All</button>
          </div>
          <div class="card-body" style="padding:0;">
            <div class="table-container"><table>
              <thead><tr><th>Student</th><th>Item</th><th>Current Due</th><th>Requested</th><th>Action</th></tr></thead>
              <tbody>
                ${pendingRenewals.map(r => `
                  <tr>
                    <td>${r.student_name}<br><span class="text-muted text-sm">${r.enrolment_number}</span></td>
                    <td>${r.item_name}${r.asset_code ? ` (${r.asset_code})` : ''}</td>
                    <td>${fmtDate(r.current_due_date)}</td>
                    <td>${fmtDate(r.request_date)}</td>
                    <td>
                      <button class="btn btn-xs btn-success" onclick="RenewalsPage.decide(${r.id},'approved')">Approve</button>
                      <button class="btn btn-xs btn-danger" onclick="RenewalsPage.decide(${r.id},'rejected')">Reject</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table></div>
          </div>
        </div>` : ''}

        <!-- Inventory Summary -->
        <div class="card mt-4">
          <div class="card-header">
            <h3>📦 Inventory Summary</h3>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('inventory')">Manage</button>
          </div>
          <div class="card-body" style="padding:0;">
            <div class="table-container"><table>
              <thead><tr><th>Item</th><th>Category</th><th>Total</th><th>Available</th><th>Issued</th><th>Damaged</th><th>Lost</th></tr></thead>
              <tbody>
                ${items.map(i => `
                  <tr>
                    <td><strong>${i.name}</strong><br><span class="text-muted text-sm">${i.item_code}</span></td>
                    <td>${i.category}</td>
                    <td>${i.total_quantity}</td>
                    <td class="${i.available_quantity === 0 ? 'text-danger' : 'text-success'}">${i.available_quantity}</td>
                    <td>${i.total_quantity - i.available_quantity - i.damaged_quantity - i.lost_quantity - i.maintenance_quantity}</td>
                    <td class="${i.damaged_quantity > 0 ? 'text-danger' : ''}">${i.damaged_quantity}</td>
                    <td class="${i.lost_quantity > 0 ? 'text-danger' : ''}">${i.lost_quantity}</td>
                  </tr>`).join('')}
              </tbody>
            </table></div>
          </div>
        </div>

        <!-- Registered Students -->
        <div class="card mt-4">
          <div class="card-header">
            <h3>👨‍🎓 Registered Students</h3>
            <button class="btn btn-sm btn-secondary" onclick="App.navigate('students')">Manage</button>
          </div>
          <div class="card-body" style="padding:0;">
            ${allStudents.length === 0
              ? `<div class="empty-state" style="padding:24px;"><p>No students registered yet</p></div>`
              : `<div class="table-container"><table>
                <thead><tr><th>Name</th><th>Enrolment No.</th><th>Programme</th><th>Semester</th><th>Contact</th></tr></thead>
                <tbody>
                  ${allStudents.map(s => `
                    <tr>
                      <td><strong>${s.name}</strong></td>
                      <td><code>${s.enrolment_number}</code></td>
                      <td><span class="badge badge-purple">${s.programme}</span></td>
                      <td>Sem ${s.semester}</td>
                      <td>${s.email || '—'}</td>
                    </tr>`).join('')}
                </tbody>
              </table></div>`}
          </div>
        </div>

        <!-- Programme-wise Breakdown -->
        <div class="card mt-4">
          <div class="card-header">
            <h3>📚 Students by Programme</h3>
          </div>
          <div class="card-body" style="padding:0;">
            ${(() => {
              const grouped = {};
              allStudents.forEach(s => {
                if (!grouped[s.programme]) grouped[s.programme] = 0;
                grouped[s.programme]++;
              });
              const rows = Object.entries(grouped);
              if (rows.length === 0) return `<div class="empty-state" style="padding:24px;"><p>No students yet</p></div>`;
              return `<div class="table-container"><table>
                <thead><tr><th>Programme</th><th>Total Students</th></tr></thead>
                <tbody>
                  ${rows.map(([prog, count]) => `
                    <tr>
                      <td><strong>${prog}</strong></td>
                      <td><span class="badge badge-blue">${count} student${count !== 1 ? 's' : ''}</span></td>
                    </tr>`).join('')}
                </tbody>
              </table></div>`;
            })()}
          </div>
        </div>
      `;
    } catch(e) {
      container.innerHTML = `<div class="alert alert-danger">${e.message}</div>`;
    }
  }
};
