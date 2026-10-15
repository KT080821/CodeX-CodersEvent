const express = require('express');
const router = express.Router();
const db = require('../db/schema');

function requireCoordinator(req, res, next) {
  if (!['coordinator', 'ADMIN'].includes(req.session.user.role)) return res.status(403).json({ error: 'Access denied' });
  next();
}

// Student: request renewal
router.post('/request', (req, res) => {
  const { issue_id } = req.body;
  if (!issue_id) return res.status(400).json({ error: 'issue_id required' });

  const issue = db.prepare('SELECT * FROM issue_records WHERE id = ?').get(issue_id);
  if (!issue) return res.status(404).json({ error: 'Issue record not found' });
  if (issue.status === 'returned') return res.status(400).json({ error: 'Item already returned' });

  const user = req.session.user;
  if (user.role === 'student') {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(user.id);
    if (!student || issue.student_id !== student.id) return res.status(403).json({ error: 'Access denied' });
  }

  // Check if pending renewal exists
  const pending = db.prepare('SELECT id FROM renewal_requests WHERE issue_id = ? AND status = \'pending\'').get(issue_id);
  if (pending) return res.status(400).json({ error: 'A pending renewal request already exists for this issue' });

  // Check renewal limit
  const item = db.prepare('SELECT max_renewals FROM inventory_items WHERE id = ?').get(issue.item_id);
  const approvedCount = db.prepare('SELECT COUNT(*) as c FROM renewal_requests WHERE issue_id = ? AND status = \'approved\'').get(issue_id).c;
  if (approvedCount >= item.max_renewals) return res.status(400).json({ error: `Maximum renewals (${item.max_renewals}) already reached for this item` });

  const today = new Date().toISOString().split('T')[0];
  const result = db.prepare('INSERT INTO renewal_requests (issue_id, request_date, status) VALUES (?,?,\'pending\')').run(issue_id, today);

  db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
    user.id, 'RENEWAL_REQUEST', 'issue_record', issue_id, `Renewal requested for issue #${issue_id}`
  );
  res.json({ success: true, id: result.lastInsertRowid, message: 'Renewal request submitted. Awaiting coordinator approval.' });
});

// Coordinator: list all pending renewals
router.get('/pending', requireCoordinator, (req, res) => {
  const rows = db.prepare(`
    SELECT rn.*, ir.due_date as current_due_date, ir.issue_date, ir.status as issue_status,
           s.name as student_name, s.enrolment_number,
           i.name as item_name, i.item_code,
           a.asset_id as asset_code
    FROM renewal_requests rn
    JOIN issue_records ir ON rn.issue_id = ir.id
    JOIN students s ON ir.student_id = s.id
    JOIN inventory_items i ON ir.item_id = i.id
    LEFT JOIN individual_assets a ON ir.asset_id = a.id
    WHERE rn.status = 'pending'
    ORDER BY rn.request_date
  `).all();
  res.json(rows);
});

// Coordinator: approve or reject renewal
router.post('/decide/:id', requireCoordinator, (req, res) => {
  const { status, remarks } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });

  const renewal = db.prepare('SELECT * FROM renewal_requests WHERE id = ?').get(req.params.id);
  if (!renewal) return res.status(404).json({ error: 'Renewal request not found' });
  if (renewal.status !== 'pending') return res.status(400).json({ error: 'Renewal already processed' });

  const today = new Date().toISOString().split('T')[0];
  let revisedDueDate = null;

  if (status === 'approved') {
    const issue = db.prepare('SELECT * FROM issue_records WHERE id = ?').get(renewal.issue_id);
    // Extend due date by 15 days from EXISTING due date
    const currentDue = new Date(issue.due_date);
    currentDue.setDate(currentDue.getDate() + 15);
    revisedDueDate = currentDue.toISOString().split('T')[0];

    db.prepare('UPDATE issue_records SET due_date = ?, status = CASE WHEN status = \'overdue\' THEN \'issued\' ELSE status END WHERE id = ?').run(revisedDueDate, renewal.issue_id);
    db.prepare('UPDATE renewal_requests SET status=?, revised_due_date=?, remarks=?, approved_by=?, approved_at=? WHERE id=?').run(
      'approved', revisedDueDate, remarks || null, req.session.user.id, today, renewal.id
    );

    db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
      req.session.user.id, 'RENEWAL_APPROVED', 'issue_record', renewal.issue_id, `Renewal approved. New due date: ${revisedDueDate}`
    );
    return res.json({ success: true, message: `Renewal approved. New due date: ${revisedDueDate}`, due_date: revisedDueDate });
  } else {
    db.prepare('UPDATE renewal_requests SET status=?, remarks=?, approved_by=?, approved_at=? WHERE id=?').run(
      'rejected', remarks || null, req.session.user.id, today, renewal.id
    );
    db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
      req.session.user.id, 'RENEWAL_REJECTED', 'issue_record', renewal.issue_id, `Renewal rejected. Remarks: ${remarks}`
    );
    return res.json({ success: true, message: 'Renewal request rejected.' });
  }
});

module.exports = router;
