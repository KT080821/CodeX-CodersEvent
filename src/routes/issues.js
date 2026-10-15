const express = require('express');
const router = express.Router();
const db = require('../db/schema');

function requireCoordinator(req, res, next) {
  if (!['coordinator', 'ADMIN'].includes(req.session.user.role)) return res.status(403).json({ error: 'Access denied' });
  next();
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// List issues (coordinator: all; student: own)
router.get('/', (req, res) => {
  const user = req.session.user;
  let rows;
  const baseQ = `
    SELECT ir.*, s.name as student_name, s.enrolment_number, s.programme, s.semester,
           i.name as item_name, i.item_code, i.tracking_type,
           a.asset_id as asset_code,
           u.username as issued_by_name,
           CASE WHEN ir.due_date < date('now') AND ir.status = 'issued' THEN 1 ELSE 0 END as is_overdue,
           CAST((julianday('now') - julianday(ir.due_date)) AS INTEGER) as overdue_days
    FROM issue_records ir
    JOIN students s ON ir.student_id = s.id
    JOIN inventory_items i ON ir.item_id = i.id
    LEFT JOIN individual_assets a ON ir.asset_id = a.id
    JOIN users u ON ir.issued_by = u.id
  `;
  if (['coordinator', 'ADMIN'].includes(user.role)) {
    rows = db.prepare(baseQ + ' ORDER BY ir.due_date ASC').all();
  } else {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(user.id);
    if (!student) return res.json([]);
    rows = db.prepare(baseQ + ' WHERE ir.student_id = ? ORDER BY ir.issue_date DESC').all(student.id);
  }
  // Update overdue status in DB
  const overdueIds = rows.filter(r => r.is_overdue && r.status === 'issued').map(r => r.id);
  if (overdueIds.length > 0) {
    overdueIds.forEach(id => db.prepare(`UPDATE issue_records SET status='overdue' WHERE id=?`).run(id));
    rows.forEach(r => { if (overdueIds.includes(r.id)) r.status = 'overdue'; });
  }
  res.json(rows);
});

// Get single issue
router.get('/:id', (req, res) => {
  const user = req.session.user;
  const row = db.prepare(`
    SELECT ir.*, s.name as student_name, s.enrolment_number, s.programme,
           i.name as item_name, i.item_code, i.tracking_type, i.max_renewals,
           a.asset_id as asset_code, a.condition as asset_condition,
           u.username as issued_by_name
    FROM issue_records ir
    JOIN students s ON ir.student_id = s.id
    JOIN inventory_items i ON ir.item_id = i.id
    LEFT JOIN individual_assets a ON ir.asset_id = a.id
    JOIN users u ON ir.issued_by = u.id
    WHERE ir.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Issue record not found' });
  if (user.role === 'student') {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(user.id);
    if (!student || row.student_id !== student.id) return res.status(403).json({ error: 'Access denied' });
  }
  // Fetch returns
  row.returns = db.prepare('SELECT rr.*, u.username as received_by_name FROM return_records rr JOIN users u ON rr.received_by = u.id WHERE rr.issue_id = ?').all(row.id);
  // Fetch renewals
  row.renewals = db.prepare('SELECT rn.*, u.username as approved_by_name FROM renewal_requests rn LEFT JOIN users u ON rn.approved_by = u.id WHERE rn.issue_id = ?').all(row.id);
  res.json(row);
});

// Issue item
router.post('/', requireCoordinator, (req, res) => {
  const { student_id, item_id, asset_db_id, quantity, purpose, issue_date } = req.body;
  if (!student_id || !item_id || !issue_date) return res.status(400).json({ error: 'student_id, item_id, issue_date required' });

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
  if (!student) return res.status(400).json({ error: 'Student not found' });

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item_id);
  if (!item) return res.status(400).json({ error: 'Item not found' });

  const due_date = addDays(issue_date, 15);

  if (item.tracking_type === 'individual') {
    // Individual asset issue
    const assetId = asset_db_id;
    if (!assetId) return res.status(400).json({ error: 'Asset ID required for individually tracked item' });

    const asset = db.prepare('SELECT * FROM individual_assets WHERE id = ?').get(assetId);
    if (!asset) return res.status(400).json({ error: 'Asset not found' });
    if (asset.status === 'issued') return res.status(400).json({ error: `Asset ${asset.asset_id} is already issued to another student` });
    if (asset.condition !== 'good') return res.status(400).json({ error: `Asset ${asset.asset_id} is not in usable condition (${asset.condition})` });
    if (item.available_quantity < 1) return res.status(400).json({ error: `No available stock for ${item.name}` });

    const existing = db.prepare('SELECT id FROM issue_records WHERE asset_id = ? AND status IN (\'issued\',\'overdue\')').get(assetId);
    if (existing) return res.status(400).json({ error: `Asset ${asset.asset_id} is currently issued and not yet returned` });

    const result = db.prepare('INSERT INTO issue_records (student_id, item_id, asset_id, quantity, purpose, issue_date, due_date, status, issued_by) VALUES (?,?,?,1,?,?,?,?,?)').run(
      student_id, item_id, assetId, purpose || null, issue_date, due_date, 'issued', req.session.user.id
    );
    db.prepare('UPDATE individual_assets SET status=\'issued\' WHERE id=?').run(assetId);
    db.prepare('UPDATE inventory_items SET available_quantity = available_quantity - 1 WHERE id=?').run(item_id);

    db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
      req.session.user.id, 'ISSUE', 'issue_record', result.lastInsertRowid, `Issued ${asset.asset_id} to ${student.name} (${student.enrolment_number}) due ${due_date}`
    );
    return res.json({ success: true, id: result.lastInsertRowid, due_date, message: `${item.name} (${asset.asset_id}) issued to ${student.name}. Due: ${due_date}` });

  } else {
    // Quantity-based issue
    const qty = parseInt(quantity) || 1;
    if (qty <= 0) return res.status(400).json({ error: 'Quantity must be positive' });
    if (qty > item.max_issue_quantity) return res.status(400).json({ error: `Maximum issue quantity for ${item.name} is ${item.max_issue_quantity}` });
    if (item.available_quantity < qty) {
      return res.status(400).json({ error: `${qty} ${item.name}(s) requested, but only ${item.available_quantity} currently available.` });
    }

    const result = db.prepare('INSERT INTO issue_records (student_id, item_id, asset_id, quantity, purpose, issue_date, due_date, status, issued_by) VALUES (?,?,NULL,?,?,?,?,?,?)').run(
      student_id, item_id, qty, purpose || null, issue_date, due_date, 'issued', req.session.user.id
    );
    db.prepare('UPDATE inventory_items SET available_quantity = available_quantity - ? WHERE id=?').run(qty, item_id);

    db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
      req.session.user.id, 'ISSUE', 'issue_record', result.lastInsertRowid, `Issued ${qty}x ${item.name} to ${student.name} due ${due_date}`
    );
    return res.json({ success: true, id: result.lastInsertRowid, due_date, message: `${qty}x ${item.name} issued to ${student.name}. Due: ${due_date}` });
  }
});

module.exports = router;
