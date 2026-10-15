const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'data', 'inventory.db');
const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
if (!fs.existsSync(source)) throw new Error(`Database not found: ${source}`);
fs.mkdirSync(backupDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destination = path.join(backupDir, `inventory-${timestamp}.db`);
fs.copyFileSync(source, destination);
console.log(`Database backup created: ${destination}`);
