const express = require('express');
const router = express.Router();
const db = require('../db/schema');

function requireCoordinator(req, res, next) {
  if (!['coordinator', 'ADMIN'].includes(req.session.user.role)) return res.status(403).json({ error: 'Access denied' });
  next();
}

// List all items
router.get('/items', (req, res) => {
  const items = db.prepare(`
    SELECT i.*, sl.name as location_name, sl.location_type, sl.department
    FROM inventory_items i
    LEFT JOIN storage_locations sl ON i.storage_location_id = sl.id
    ORDER BY i.name
  `).all();
  res.json(items);
});

// Get single item with assets
router.get('/items/:id', (req, res) => {
  const item = db.prepare(`
    SELECT i.*, sl.name as location_name FROM inventory_items i
    LEFT JOIN storage_locations sl ON i.storage_location_id = sl.id
    WHERE i.id = ?
  `).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  if (item.tracking_type === 'individual') {
    item.assets = db.prepare('SELECT * FROM individual_assets WHERE item_id = ? ORDER BY asset_id').all(item.id);
  }
  res.json(item);
});

// Add item
router.post('/items', requireCoordinator, (req, res) => {
  const { item_code, name, category, description, make_model, tracking_type, total_quantity, max_issue_quantity, max_renewals, storage_location_id } = req.body;
  if (!item_code || !name || !category || !tracking_type || total_quantity === undefined) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  const existing = db.prepare('SELECT id FROM inventory_items WHERE item_code = ?').get(item_code);
  if (existing) return res.status(400).json({ error: 'Item code already exists' });

  const qty = parseInt(total_quantity);
  const result = db.prepare(`INSERT INTO inventory_items (item_code, name, category, description, make_model, tracking_type, total_quantity, available_quantity, max_issue_quantity, max_renewals, storage_location_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(item_code, name, category, description || null, make_model || null, tracking_type, qty, qty, max_issue_quantity || 1, max_renewals || 2, storage_location_id || null);

  db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
    req.session.user.id, 'CREATE', 'inventory_item', result.lastInsertRowid, `Added item ${name} qty:${qty}`
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

// Update item
router.put('/items/:id', requireCoordinator, (req, res) => {
  const { name, category, description, make_model, max_issue_quantity, max_renewals, storage_location_id } = req.body;
  db.prepare('UPDATE inventory_items SET name=?, category=?, description=?, make_model=?, max_issue_quantity=?, max_renewals=?, storage_location_id=? WHERE id=?')
    .run(name, category, description, make_model, max_issue_quantity, max_renewals, storage_location_id, req.params.id);
  res.json({ success: true });
});

// List assets
router.get('/assets', requireCoordinator, (req, res) => {
  const { item_id } = req.query;
  let q = `SELECT a.*, i.name as item_name, sl.name as location_name FROM individual_assets a
    JOIN inventory_items i ON a.item_id = i.id
    LEFT JOIN storage_locations sl ON a.location_id = sl.id`;
  if (item_id) {
    res.json(db.prepare(q + ' WHERE a.item_id = ? ORDER BY a.asset_id').all(item_id));
  } else {
    res.json(db.prepare(q + ' ORDER BY i.name, a.asset_id').all());
  }
});

// Add individual asset
router.post('/assets', requireCoordinator, (req, res) => {
  const { item_id, asset_id, serial_number, location_id, condition } = req.body;
  if (!item_id || !asset_id) return res.status(400).json({ error: 'item_id and asset_id required' });

  const existing = db.prepare('SELECT id FROM individual_assets WHERE asset_id = ?').get(asset_id);
  if (existing) return res.status(400).json({ error: 'Asset ID already exists' });

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.tracking_type !== 'individual') return res.status(400).json({ error: 'Item is not individually tracked' });

  const cond = condition || 'good';
  db.prepare('INSERT INTO individual_assets (item_id, asset_id, serial_number, location_id, condition, status) VALUES (?,?,?,?,?,?)').run(
    item_id, asset_id, serial_number || null, location_id || null, cond, cond === 'good' ? 'available' : 'issued'
  );

  // Update totals
  db.prepare('UPDATE inventory_items SET total_quantity = total_quantity + 1, available_quantity = available_quantity + ? WHERE id = ?').run(cond === 'good' ? 1 : 0, item_id);
  res.json({ success: true });
});

// Update asset condition
router.put('/assets/:id', requireCoordinator, (req, res) => {
  const { condition, notes } = req.body;
  const asset = db.prepare('SELECT * FROM individual_assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  const oldCond = asset.condition;
  db.prepare('UPDATE individual_assets SET condition=?, notes=? WHERE id=?').run(condition, notes || null, req.params.id);

  // Adjust available quantity
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(asset.item_id);
  if (oldCond === 'good' && condition !== 'good' && asset.status === 'available') {
    db.prepare('UPDATE inventory_items SET available_quantity = available_quantity - 1 WHERE id = ?').run(asset.item_id);
  } else if (oldCond !== 'good' && condition === 'good' && asset.status === 'available') {
    db.prepare('UPDATE inventory_items SET available_quantity = available_quantity + 1 WHERE id = ?').run(asset.item_id);
  }

  // Recalculate condition counts
  recalcItemQuantities(asset.item_id);

  db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
    req.session.user.id, 'UPDATE', 'individual_asset', req.params.id, `Condition changed from ${oldCond} to ${condition}`
  );
  res.json({ success: true });
});

// Stock adjustment (quantity-based items)
router.post('/items/:id/adjust', requireCoordinator, (req, res) => {
  const { adjustment_type, quantity_change, reason, from_status, to_status } = req.body;
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const change = parseInt(quantity_change);
  if (isNaN(change)) return res.status(400).json({ error: 'Invalid quantity' });

  if (adjustment_type === 'addition') {
    db.prepare('UPDATE inventory_items SET total_quantity = total_quantity + ?, available_quantity = available_quantity + ? WHERE id = ?').run(change, change, item.id);
  } else if (adjustment_type === 'retirement') {
    if (item.available_quantity < change) return res.status(400).json({ error: 'Insufficient available quantity to retire' });
    db.prepare('UPDATE inventory_items SET total_quantity = total_quantity - ?, available_quantity = available_quantity - ? WHERE id = ?').run(change, change, item.id);
  } else if (adjustment_type === 'condition_change') {
    // Move qty from one status to another for quantity-based items
    if (from_status === 'available') {
      if (item.available_quantity < change) return res.status(400).json({ error: 'Insufficient available quantity' });
      db.prepare('UPDATE inventory_items SET available_quantity = available_quantity - ? WHERE id = ?').run(change, item.id);
    }
    if (to_status === 'damaged') db.prepare('UPDATE inventory_items SET damaged_quantity = damaged_quantity + ? WHERE id = ?').run(change, item.id);
    else if (to_status === 'lost') db.prepare('UPDATE inventory_items SET lost_quantity = lost_quantity + ? WHERE id = ?').run(change, item.id);
    else if (to_status === 'maintenance') db.prepare('UPDATE inventory_items SET maintenance_quantity = maintenance_quantity + ? WHERE id = ?').run(change, item.id);
    else if (to_status === 'available') db.prepare('UPDATE inventory_items SET available_quantity = available_quantity + ? WHERE id = ?').run(change, item.id);
  } else if (adjustment_type === 'correction') {
    db.prepare('UPDATE inventory_items SET available_quantity = ? WHERE id = ?').run(change, item.id);
  }

  db.prepare('INSERT INTO stock_adjustments (item_id, adjustment_type, quantity_change, reason, from_status, to_status, adjusted_by, adjustment_date) VALUES (?,?,?,?,?,?,?,?)').run(
    item.id, adjustment_type, change, reason, from_status || null, to_status || null, req.session.user.id, new Date().toISOString().split('T')[0]
  );
  db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
    req.session.user.id, 'ADJUSTMENT', 'inventory_item', item.id, `${adjustment_type}: ${change} - ${reason}`
  );
  res.json({ success: true });
});

// Storage locations
router.get('/locations', (req, res) => {
  res.json(db.prepare('SELECT * FROM storage_locations ORDER BY department, name').all());
});

router.post('/locations', requireCoordinator, (req, res) => {
  const { department, location_type, name, description } = req.body;
  if (!department || !location_type || !name) return res.status(400).json({ error: 'Required fields missing' });
  const result = db.prepare('INSERT INTO storage_locations (department, location_type, name, description) VALUES (?,?,?,?)').run(department, location_type, name, description || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/locations/:id', requireCoordinator, (req, res) => {
  const { department, location_type, name, description } = req.body;
  db.prepare('UPDATE storage_locations SET department=?, location_type=?, name=?, description=? WHERE id=?').run(department, location_type, name, description, req.params.id);
  res.json({ success: true });
});

function recalcItemQuantities(itemId) {
  const counts = db.prepare(`
    SELECT
      COUNT(CASE WHEN condition='damaged' AND status='available' THEN 1 END) as damaged,
      COUNT(CASE WHEN condition='lost' THEN 1 END) as lost,
      COUNT(CASE WHEN condition='maintenance' AND status='available' THEN 1 END) as maintenance
    FROM individual_assets WHERE item_id = ?
  `).get(itemId);
  db.prepare('UPDATE inventory_items SET damaged_quantity=?, lost_quantity=?, maintenance_quantity=? WHERE id=?').run(
    counts.damaged, counts.lost, counts.maintenance, itemId
  );
}

module.exports = router;
