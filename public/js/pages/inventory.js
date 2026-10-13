// Inventory Page
const InventoryPage = {
  currentTab: 'items',

  async render() {
    const container = document.getElementById('page-container');
    container.innerHTML = `
      <div class="page-header">
        <div><h2>Inventory Management</h2><p>Manage items, assets, and storage locations</p></div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="add-item-btn">+ Add Item</button>
          <button class="btn btn-secondary" id="add-location-btn">+ Location</button>
        </div>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--gray-200);padding-bottom:0;">
        <button class="tab-btn ${this.currentTab==='items'?'active':''}" data-tab="items">📦 Items</button>
        <button class="tab-btn ${this.currentTab==='assets'?'active':''}" data-tab="assets">🔖 Assets</button>
        <button class="tab-btn ${this.currentTab==='locations'?'active':''}" data-tab="locations">📍 Locations</button>
        <button class="tab-btn ${this.currentTab==='adjustments'?'active':''}" data-tab="adjustments">📊 Stock Adjustments</button>
      </div>
      <div id="inv-tab-content"></div>
    `;
    // Tab style
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.style.cssText = 'padding:8px 16px;border:none;background:none;cursor:pointer;font-size:13.5px;font-weight:500;color:var(--gray-500);border-bottom:2px solid transparent;margin-bottom:-1px;';
      if (btn.classList.contains('active')) { btn.style.borderBottomColor = 'var(--primary)'; btn.style.color = 'var(--primary)'; }
      btn.addEventListener('click', () => { this.currentTab = btn.dataset.tab; this.render(); });
    });
    document.getElementById('add-item-btn').onclick = () => this.showAddItem();
    document.getElementById('add-location-btn').onclick = () => this.showAddLocation();

    await this.renderTab();
  },

  async renderTab() {
    const c = document.getElementById('inv-tab-content');
    c.innerHTML = loading();
    if (this.currentTab === 'items') await this.renderItems(c);
    else if (this.currentTab === 'assets') await this.renderAssets(c);
    else if (this.currentTab === 'locations') await this.renderLocations(c);
    else if (this.currentTab === 'adjustments') await this.renderAdjustments(c);
  },

  async renderItems(c) {
    const items = await API.inventory.items();
    c.innerHTML = `
      <div class="search-bar">
        <input id="item-search" placeholder="Search items…" oninput="InventoryPage.filterItems()" />
        <select id="item-cat-filter" onchange="InventoryPage.filterItems()">
          <option value="">All Categories</option>
          ${[...new Set(items.map(i => i.category))].map(cat => `<option>${cat}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <div class="table-container">
          <table id="items-table">
            <thead><tr>
              <th>Code</th><th>Name</th><th>Category</th><th>Tracking</th>
              <th>Total</th><th>Available</th><th>Issued</th><th>Damaged</th><th>Lost</th><th>Actions</th>
            </tr></thead>
            <tbody id="items-tbody">
              ${items.map(i => this.itemRow(i)).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    this._items = items;
  },

  itemRow(i) {
    const issued = i.total_quantity - i.available_quantity - i.damaged_quantity - i.lost_quantity - i.maintenance_quantity;
    return `<tr data-name="${i.name.toLowerCase()}" data-cat="${i.category}">
      <td><code>${i.item_code}</code></td>
      <td><strong>${i.name}</strong>${i.make_model ? `<br><span class="text-muted text-sm">${i.make_model}</span>` : ''}</td>
      <td>${i.category}</td>
      <td>${statusBadge(i.tracking_type === 'individual' ? 'issued' : 'returned').replace('issued','individual').replace('returned','quantity')}<span class="badge ${i.tracking_type==='individual'?'badge-purple':'badge-blue'}">${i.tracking_type}</span></td>
      <td>${i.total_quantity}</td>
      <td class="${i.available_quantity===0?'text-danger':'text-success'}">${i.available_quantity}</td>
      <td>${issued}</td>
      <td class="${i.damaged_quantity>0?'text-danger':''}">${i.damaged_quantity}</td>
      <td class="${i.lost_quantity>0?'text-danger':''}">${i.lost_quantity}</td>
      <td>
        <button class="btn btn-xs btn-secondary" onclick="InventoryPage.viewItem(${i.id})">View</button>
        <button class="btn btn-xs btn-secondary" onclick="InventoryPage.showAdjust(${i.id},'${i.name}','${i.tracking_type}')">Adjust</button>
        ${i.tracking_type==='individual'?`<button class="btn btn-xs btn-secondary" onclick="InventoryPage.showAddAsset(${i.id},'${i.name}')">+ Asset</button>`:''}
      </td>
    </tr>`;
  },

  filterItems() {
    const q = document.getElementById('item-search').value.toLowerCase();
    const cat = document.getElementById('item-cat-filter').value;
    document.querySelectorAll('#items-tbody tr').forEach(tr => {
      const nameMatch = !q || tr.dataset.name.includes(q);
      const catMatch = !cat || tr.dataset.cat === cat;
      tr.style.display = nameMatch && catMatch ? '' : 'none';
    });
  },

  async viewItem(id) {
    const item = await API.inventory.item(id);
    let assetsHtml = '';
    if (item.tracking_type === 'individual' && item.assets) {
      assetsHtml = `<hr class="divider"><h4 style="font-size:14px;font-weight:600;margin-bottom:12px;">Individual Assets</h4>
        <div class="table-container"><table>
          <thead><tr><th>Asset ID</th><th>Serial No.</th><th>Condition</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>${item.assets.map(a => `
            <tr>
              <td><strong>${a.asset_id}</strong></td>
              <td>${a.serial_number || '—'}</td>
              <td>${conditionBadge(a.condition)}</td>
              <td>${statusBadge(a.status)}</td>
              <td>
                <select class="btn btn-xs btn-secondary" style="padding:3px 6px;" onchange="InventoryPage.updateAsset(${a.id},this.value)">
                  <option value="">Change condition…</option>
                  <option value="good">Good</option>
                  <option value="damaged">Damaged</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="lost">Lost</option>
                </select>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    }
    const body = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:13px;">
        <div><strong>Code:</strong> ${item.item_code}</div>
        <div><strong>Category:</strong> ${item.category}</div>
        <div><strong>Make/Model:</strong> ${item.make_model || '—'}</div>
        <div><strong>Tracking:</strong> ${item.tracking_type}</div>
        <div><strong>Total Qty:</strong> ${item.total_quantity}</div>
        <div><strong>Available:</strong> <span class="${item.available_quantity===0?'text-danger':'text-success'}">${item.available_quantity}</span></div>
        <div><strong>Damaged:</strong> ${item.damaged_quantity}</div>
        <div><strong>Lost:</strong> ${item.lost_quantity}</div>
        <div><strong>Maintenance:</strong> ${item.maintenance_quantity}</div>
        <div><strong>Max Issue Qty:</strong> ${item.max_issue_quantity}</div>
        <div><strong>Max Renewals:</strong> ${item.max_renewals}</div>
        <div><strong>Location:</strong> ${item.location_name || '—'}</div>
      </div>
      ${item.description ? `<p style="margin-top:12px;color:var(--gray-600);font-size:13px;">${item.description}</p>` : ''}
      ${assetsHtml}`;
    modal(item.name, body, '', 'modal-lg');
  },

  async updateAsset(id, condition) {
    if (!condition) return;
    try {
      await API.inventory.updateAsset(id, { condition });
      toast('Asset condition updated');
      this.render();
    } catch(e) { toast(e.message, 'danger'); }
  },

  async renderAssets(c) {
    const assets = await API.inventory.assets();
    c.innerHTML = `
      <div class="search-bar">
        <input id="asset-search" placeholder="Search by asset ID…" oninput="InventoryPage.filterAssets()" />
        <select id="asset-cond-filter" onchange="InventoryPage.filterAssets()">
          <option value="">All Conditions</option>
          <option>good</option><option>damaged</option><option>maintenance</option><option>lost</option>
        </select>
      </div>
      <div class="card">
        <div class="table-container">
          <table>
            <thead><tr><th>Asset ID</th><th>Item</th><th>Serial No.</th><th>Location</th><th>Condition</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="assets-tbody">
              ${assets.map(a => `
                <tr data-id="${a.asset_id.toLowerCase()}" data-cond="${a.condition}">
                  <td><strong>${a.asset_id}</strong></td>
                  <td>${a.item_name}</td>
                  <td>${a.serial_number || '—'}</td>
                  <td>${a.location_name || '—'}</td>
                  <td>${conditionBadge(a.condition)}</td>
                  <td>${statusBadge(a.status)}</td>
                  <td>
                    <select class="btn btn-xs btn-secondary" style="padding:3px 6px;" onchange="InventoryPage.updateAsset(${a.id},this.value)">
                      <option value="">Change…</option>
                      <option value="good">Good</option><option value="damaged">Damaged</option>
                      <option value="maintenance">Maintenance</option><option value="lost">Lost</option>
                    </select>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  filterAssets() {
    const q = document.getElementById('asset-search').value.toLowerCase();
    const cond = document.getElementById('asset-cond-filter').value;
    document.querySelectorAll('#assets-tbody tr').forEach(tr => {
      tr.style.display = (!q || tr.dataset.id.includes(q)) && (!cond || tr.dataset.cond === cond) ? '' : 'none';
    });
  },

  async renderLocations(c) {
    const locs = await API.inventory.locations();
    c.innerHTML = `<div class="card"><div class="table-container"><table>
      <thead><tr><th>Department</th><th>Type</th><th>Name</th><th>Description</th></tr></thead>
      <tbody>${locs.map(l => `<tr><td>${l.department}</td><td>${l.location_type}</td><td><strong>${l.name}</strong></td><td>${l.description||'—'}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
  },

  async renderAdjustments(c) {
    const rows = await API.reports.adjustments();
    c.innerHTML = rows.length === 0 ? emptyState('No stock adjustments yet') : `
      <div class="card"><div class="table-container"><table>
        <thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Qty</th><th>Reason</th><th>By</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${fmtDate(r.adjustment_date)}</td>
          <td>${r.item_name}</td>
          <td>${statusBadge(r.adjustment_type)}</td>
          <td>${r.quantity_change > 0 ? '+'+r.quantity_change : r.quantity_change}</td>
          <td>${r.reason}</td>
          <td>${r.adjusted_by_name}</td>
        </tr>`).join('')}
        </tbody></table></div></div>`;
  },

  showAddItem() {
    const body = `<form id="add-item-form" class="form-grid">
      <div class="form-group"><label>Item Code *</label><input name="item_code" required placeholder="e.g. USB-HUB-01"></div>
      <div class="form-group"><label>Name *</label><input name="name" required placeholder="e.g. USB Hub"></div>
      <div class="form-group"><label>Category *</label><input name="category" required placeholder="e.g. Electronics"></div>
      <div class="form-group"><label>Make/Model</label><input name="make_model" placeholder="e.g. TP-Link UH720"></div>
      <div class="form-group"><label>Tracking Type *</label>
        <select name="tracking_type" required>
          <option value="quantity">Quantity-based (cables, adapters…)</option>
          <option value="individual">Individual (laptops, boards…)</option>
        </select>
      </div>
      <div class="form-group"><label>Total Quantity *</label><input name="total_quantity" type="number" min="0" required></div>
      <div class="form-group"><label>Max Issue Qty</label><input name="max_issue_quantity" type="number" min="1" value="1"></div>
      <div class="form-group"><label>Max Renewals</label><input name="max_renewals" type="number" min="0" value="2"></div>
      <div class="form-group form-group-full"><label>Description</label><textarea name="description" rows="2"></textarea></div>
      <div id="add-item-err" class="error-msg hidden form-group-full"></div>
    </form>`;
    const ov = modal('Add Inventory Item', body, '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-primary" onclick="InventoryPage.submitAddItem()">Add Item</button>');
    document.getElementById('add-item-form').onsubmit = (e) => { e.preventDefault(); InventoryPage.submitAddItem(); };
  },

  async submitAddItem() {
    const form = document.getElementById('add-item-form');
    const data = formData(form);
    const errEl = document.getElementById('add-item-err');
    try {
      await API.inventory.createItem(data);
      document.querySelector('.modal-overlay').remove();
      toast('Item added successfully');
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  },

  showAddAsset(itemId, itemName) {
    const body = `<form id="add-asset-form">
      <div class="form-group"><label>Asset ID *</label><input name="asset_id" required placeholder="e.g. DB-011"></div>
      <div class="form-group"><label>Serial Number</label><input name="serial_number" placeholder="Optional"></div>
      <div class="form-group"><label>Initial Condition</label>
        <select name="condition"><option value="good">Good</option><option value="damaged">Damaged</option></select>
      </div>
      <input type="hidden" name="item_id" value="${itemId}">
      <div id="add-asset-err" class="error-msg hidden"></div>
    </form>`;
    modal(`Add Asset to ${itemName}`, body, '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-primary" onclick="InventoryPage.submitAddAsset()">Add Asset</button>');
  },

  async submitAddAsset() {
    const form = document.getElementById('add-asset-form');
    const data = formData(form);
    const errEl = document.getElementById('add-asset-err');
    try {
      await API.inventory.addAsset(data);
      document.querySelector('.modal-overlay').remove();
      toast('Asset added');
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  },

  showAdjust(itemId, itemName, trackingType) {
    const body = `<form id="adjust-form">
      <div class="form-group"><label>Adjustment Type *</label>
        <select name="adjustment_type" required>
          <option value="addition">Add New Stock</option>
          ${trackingType === 'quantity' ? `
          <option value="condition_change">Condition Change (Available → Damaged/Lost/Maintenance)</option>
          <option value="retirement">Retire Stock</option>
          <option value="correction">Stock Correction (set available qty)</option>` : ''}
        </select>
      </div>
      <div class="form-group"><label>Quantity *</label><input name="quantity_change" type="number" min="1" required></div>
      <div class="form-group" id="from-status-group"><label>From Status</label>
        <select name="from_status"><option value="available">Available</option></select>
      </div>
      <div class="form-group" id="to-status-group"><label>To Status</label>
        <select name="to_status"><option value="damaged">Damaged</option><option value="lost">Lost</option><option value="maintenance">Maintenance</option></select>
      </div>
      <div class="form-group"><label>Reason *</label><textarea name="reason" required rows="2"></textarea></div>
      <div id="adjust-err" class="error-msg hidden"></div>
    </form>`;
    modal(`Stock Adjustment: ${itemName}`, body,
      '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-primary" onclick="InventoryPage.submitAdjust('+itemId+')">Apply</button>');
  },

  async submitAdjust(itemId) {
    const form = document.getElementById('adjust-form');
    const data = formData(form);
    const errEl = document.getElementById('adjust-err');
    try {
      await API.inventory.adjust(itemId, data);
      document.querySelector('.modal-overlay').remove();
      toast('Stock adjusted');
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  },

  showAddLocation() {
    const body = `<form id="loc-form" class="form-grid">
      <div class="form-group"><label>Department *</label><input name="department" required placeholder="e.g. DFIS"></div>
      <div class="form-group"><label>Type *</label>
        <select name="location_type" required>
          <option>laboratory</option><option>room</option><option>cupboard</option><option>other</option>
        </select>
      </div>
      <div class="form-group form-group-full"><label>Name *</label><input name="name" required placeholder="e.g. DFIS Lab B"></div>
      <div class="form-group form-group-full"><label>Description</label><textarea name="description" rows="2"></textarea></div>
      <div id="loc-err" class="error-msg hidden form-group-full"></div>
    </form>`;
    modal('Add Storage Location', body, '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button><button class="btn btn-primary" onclick="InventoryPage.submitAddLocation()">Add Location</button>');
  },

  async submitAddLocation() {
    const form = document.getElementById('loc-form');
    const data = formData(form);
    const errEl = document.getElementById('loc-err');
    try {
      await API.inventory.addLocation(data);
      document.querySelector('.modal-overlay').remove();
      toast('Location added');
      this.currentTab = 'locations';
      this.render();
    } catch(e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  }
};
