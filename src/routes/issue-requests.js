const express = require('express');
const db = require('../db/schema');

const router = express.Router();

function requireCoordinator(req, res, next) {
  if (!['coordinator', 'ADMIN'].includes(req.session.user.role)) return res.status(403).json({ error: 'Access denied' });
  next();
}

function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

router.get('/', requireCoordinator, (req, res) => {
  res.json(db.prepare(`
    SELECT r.*, s.name AS student_name, s.enrolment_number, i.name AS item_name, i.item_code,
           u.username AS decided_by_name
    FROM issue_requests r
    JOIN students s ON r.student_id = s.id
    JOIN inventory_items i ON r.item_id = i.id
    LEFT JOIN users u ON r.decided_by = u.id
    ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.requested_at DESC
  `).all());
});

router.get('/mine', (req, res) => {
  const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.session.user.id);
  if (!student) return res.json([]);
  res.json(db.prepare(`
    SELECT r.*, i.name AS item_name, i.item_code
    FROM issue_requests r JOIN inventory_items i ON r.item_id = i.id
    WHERE r.student_id = ? ORDER BY r.requested_at DESC
  `).all(student.id));
});

router.post('/', (req, res) => {
  if (req.session.user.role !== 'student') return res.status(403).json({ error: 'Only students can submit issue requests' });
  const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.session.user.id);
  const { item_id, quantity, purpose } = req.body;
  if (!student || !item_id) return res.status(400).json({ error: 'Student and item are required' });
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const qty = parseInt(quantity, 10) || 1;
  if (qty < 1 || qty > item.max_issue_quantity) return res.status(400).json({ error: `Quantity must be between 1 and ${item.max_issue_quantity}` });
  if (item.available_quantity < qty) return res.status(400).json({ error: 'The requested quantity is not currently available' });
  const duplicate = db.prepare("SELECT id FROM issue_requests WHERE student_id = ? AND item_id = ? AND status = 'pending'").get(student.id, item_id);
  if (duplicate) return res.status(400).json({ error: 'You already have a pending request for this item' });
  const result = db.prepare('INSERT INTO issue_requests (student_id, item_id, quantity, purpose) VALUES (?,?,?,?)').run(student.id, item_id, qty, purpose || null);
  res.json({ success: true, id: result.lastInsertRowid, message: 'Issue request sent to the coordinator' });
});

router.post('/:id/decide', requireCoordinator, (req, res) => {
  const request = db.prepare('SELECT * FROM issue_requests WHERE id = ?').get(req.params.id);
  if (!request || request.status !== 'pending') return res.status(404).json({ error: 'Pending request not found' });
  const status = req.body.status;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid decision' });
  if (status === 'rejected') {
    db.prepare("UPDATE issue_requests SET status='rejected', decided_at=datetime('now'), decided_by=?, decision_note=? WHERE id=?")
      .run(req.session.user.id, req.body.note || null, request.id);
    return res.json({ success: true, message: 'Issue request rejected' });
  }

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(request.item_id);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(request.student_id);
  if (!item || !student || item.available_quantity < request.quantity) return res.status(400).json({ error: 'Item is no longer available in the requested quantity' });
  const issueDate = new Date().toISOString().split('T')[0];
  const dueDate = addDays(issueDate, 15);
  const issue = db.prepare(`INSERT INTO issue_records
    (student_id, item_id, quantity, purpose, issue_date, due_date, status, issued_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(student.id, item.id, request.quantity, request.purpose || null, issueDate, dueDate, 'issued', req.session.user.id);
  db.prepare('UPDATE inventory_items SET available_quantity = available_quantity - ? WHERE id = ?').run(request.quantity, item.id);
  db.prepare("UPDATE issue_requests SET status='approved', decided_at=datetime('now'), decided_by=?, decision_note=? WHERE id=?")
    .run(req.session.user.id, req.body.note || null, request.id);
  db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(req.session.user.id, 'ISSUE_REQUEST_APPROVED', 'issue_request', request.id, `Approved request and issued ${item.name} to ${student.name}`);
  res.json({ success: true, issue_id: issue.lastInsertRowid, message: 'Request approved and item issued' });
});

module.exports = router;
