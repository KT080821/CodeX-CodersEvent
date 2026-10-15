const express = require('express');
const router = express.Router();
const db = require('../db/schema');

function requireCoordinator(req, res, next) {
  if (!['coordinator', 'ADMIN'].includes(req.session.user.role)) return res.status(403).json({ error: 'Access denied' });
  next();
}

// Record return
router.post('/', requireCoordinator, (req, res) => {
  const { issue_id, return_date, quantity_returned, condition, notes } = req.body;
  if (!issue_id || !return_date || !quantity_returned || !condition) {
    return res.status(400).json({ error: 'issue_id, return_date, quantity_returned, condition required' });
  }

  const issue = db.prepare('SELECT * FROM issue_records WHERE id = ?').get(issue_id);
  if (!issue) return res.status(404).json({ error: 'Issue record not found' });
  if (issue.status === 'returned') return res.status(400).json({ error: 'All items already returned' });

  const qtyReturned = parseInt(quantity_returned);
  if (qtyReturned <= 0) return res.status(400).json({ error: 'Quantity must be positive' });

  // Calculate already returned
  const alreadyReturned = db.prepare('SELECT COALESCE(SUM(quantity_returned),0) as total FROM return_records WHERE issue_id = ?').get(issue_id).total;
  const outstanding = issue.quantity - alreadyReturned;
  if (qtyReturned > outstanding) return res.status(400).json({ error: `Only ${outstanding} item(s) outstanding. Cannot return ${qtyReturned}` });

  // Record return
  const returnResult = db.prepare('INSERT INTO return_records (issue_id, return_date, quantity_returned, condition, notes, received_by) VALUES (?,?,?,?,?,?)').run(
    issue_id, return_date, qtyReturned, condition, notes || null, req.session.user.id
  );

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(issue.item_id);

  // Handle individually tracked assets
  if (issue.asset_id) {
    const cond = condition === 'good' ? 'good' : condition;
    const newStatus = condition === 'good' ? 'available' : 'available'; // still available storage
    db.prepare('UPDATE individual_assets SET status=\'available\', condition=? WHERE id=?').run(cond, issue.asset_id);
    if (condition === 'good') {
      db.prepare('UPDATE inventory_items SET available_quantity = available_quantity + 1 WHERE id=?').run(item.id);
    }
    // If damaged/lost, don't add back to available
  } else {
    // Quantity-based: only add back if condition is good
    if (condition === 'good') {
      db.prepare('UPDATE inventory_items SET available_quantity = available_quantity + ? WHERE id=?').run(qtyReturned, item.id);
    } else if (condition === 'damaged') {
      db.prepare('UPDATE inventory_items SET damaged_quantity = damaged_quantity + ? WHERE id=?').run(qtyReturned, item.id);
    } else if (condition === 'lost') {
      db.prepare('UPDATE inventory_items SET lost_quantity = lost_quantity + ? WHERE id=?').run(qtyReturned, item.id);
    }
  }

  // Check if fully returned
  const totalReturned = alreadyReturned + qtyReturned;
  if (totalReturned >= issue.quantity) {
    db.prepare('UPDATE issue_records SET status=\'returned\' WHERE id=?').run(issue_id);
  }

  db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
    req.session.user.id, 'RETURN', 'issue_record', issue_id, `Returned ${qtyReturned} item(s), condition: ${condition}`
  );

  const remaining = issue.quantity - totalReturned;
  return res.json({
    success: true,
    id: returnResult.lastInsertRowid,
    message: remaining > 0
      ? `Partial return recorded. ${remaining} item(s) still outstanding.`
      : `All items returned successfully.`,
    remaining
  });
});

module.exports = router;
