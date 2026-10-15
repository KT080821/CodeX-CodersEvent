// sql.js based SQLite wrapper - pure JavaScript, no native build needed
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/inventory.db');
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db = null;
let SQL = null;
let transactionDepth = 0;

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Auto-save after mutations
function run(sql, params = []) {
  db.run(sql, params);
  if (!transactionDepth) saveDb();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function exec(sql) {
  db.run(sql);
  if (!transactionDepth) saveDb();
}

function transaction(callback) {
  if (transactionDepth) return callback();
  db.run('BEGIN');
  transactionDepth += 1;
  try {
    const result = callback();
    db.run('COMMIT');
    transactionDepth -= 1;
    saveDb();
    return result;
  } catch (error) {
    db.run('ROLLBACK');
    transactionDepth -= 1;
    throw error;
  }
}

// A "statement" object that mimics better-sqlite3's API
function prepare(sql) {
  return {
    run: (...args) => {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      db.run(sql, params);
      if (!transactionDepth) saveDb();
      // sql.js does not reliably expose last_insert_rowid() after db.run().
      // Resolve the inserted row from the table while the database is single-threaded.
      const insertMatch = sql.match(/insert\s+(?:or\s+\w+\s+)?into\s+["`]?([a-z_]+)["`]?/i);
      const rowid = insertMatch
        ? get(`SELECT id FROM "${insertMatch[1]}" ORDER BY id DESC LIMIT 1`)
        : null;
      return { lastInsertRowid: rowid ? rowid.id : null };
    },
    get: (...args) => {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return get(sql, params);
    },
    all: (...args) => {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return all(sql, params);
    }
  };
}

function initSchema() {
  db.run(`PRAGMA foreign_keys = ON;`);
  db.run(`
    CREATE TABLE IF NOT EXISTS programmes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      duration_semesters INTEGER NOT NULL DEFAULT 4,
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','coordinator','student')),
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  // Backward-compatible auth fields for Google OAuth.
  try { db.run(`ALTER TABLE users ADD COLUMN email TEXT`); } catch (_) {}
  try { db.run(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  try { db.run(`ALTER TABLE users ADD COLUMN google_sub TEXT`); } catch (_) {}
  const userTable = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (userTable && !String(userTable.sql).includes("'ADMIN'")) {
    db.run(`PRAGMA foreign_keys=OFF;
      CREATE TABLE users_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('ADMIN','coordinator','student')),
        created_at TEXT DEFAULT (datetime('now')),
        email TEXT,
        email_verified INTEGER NOT NULL DEFAULT 1,
        google_sub TEXT
      );
      INSERT INTO users_migrated (id, username, password_hash, role, created_at, email, email_verified, google_sub)
        SELECT id, username, password_hash, role, created_at, email, email_verified, google_sub FROM users;
      DROP TABLE users;
      ALTER TABLE users_migrated RENAME TO users;
      PRAGMA foreign_keys=ON;`);
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      name TEXT NOT NULL,
      enrolment_number TEXT UNIQUE NOT NULL,
      programme TEXT NOT NULL,
      semester INTEGER NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS issue_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      asset_id INTEGER REFERENCES individual_assets(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT DEFAULT (datetime('now')),
      decided_at TEXT,
      decided_by INTEGER REFERENCES users(id),
      decision_note TEXT
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS storage_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department TEXT NOT NULL,
      location_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      make_model TEXT,
      tracking_type TEXT NOT NULL,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      available_quantity INTEGER NOT NULL DEFAULT 0,
      damaged_quantity INTEGER NOT NULL DEFAULT 0,
      lost_quantity INTEGER NOT NULL DEFAULT 0,
      maintenance_quantity INTEGER NOT NULL DEFAULT 0,
      max_issue_quantity INTEGER NOT NULL DEFAULT 1,
      max_renewals INTEGER NOT NULL DEFAULT 2,
      storage_location_id INTEGER REFERENCES storage_locations(id),
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS individual_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      asset_id TEXT UNIQUE NOT NULL,
      serial_number TEXT,
      location_id INTEGER REFERENCES storage_locations(id),
      condition TEXT NOT NULL DEFAULT 'good',
      status TEXT NOT NULL DEFAULT 'available',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS issue_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      asset_id INTEGER REFERENCES individual_assets(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      purpose TEXT,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued',
      issued_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS return_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL REFERENCES issue_records(id),
      return_date TEXT NOT NULL,
      quantity_returned INTEGER NOT NULL,
      condition TEXT NOT NULL,
      notes TEXT,
      received_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS renewal_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL REFERENCES issue_records(id),
      request_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      revised_due_date TEXT,
      remarks TEXT,
      approved_by INTEGER REFERENCES users(id),
      approved_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id),
      adjustment_type TEXT NOT NULL,
      quantity_change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      adjusted_by INTEGER NOT NULL REFERENCES users(id),
      adjustment_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );`);
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );`);
  saveDb();
}

function seedData() {
  // Always ensure programmes are seeded (even on existing DBs)
  const progCount = get('SELECT COUNT(*) as c FROM programmes').c;
  if (progCount === 0) {
    const progs = [
      ['M.Sc. DFIS', 4],
      ['M.Sc. Cyber Security', 4],
      ['M.Sc. Data Science', 4],
      ['B.Sc. Computer Science', 6],
      ['B.Tech. Information Technology', 8],
      ['MCA', 6],
      ['MBA (IT)', 4],
    ];
    progs.forEach(([name, dur]) => {
      run('INSERT OR IGNORE INTO programmes (name, duration_semesters) VALUES (?,?)', [name, dur]);
    });
  }

  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && !get("SELECT id FROM users WHERE role = 'ADMIN'")) {
    run('INSERT INTO users (username, password_hash, role, email, email_verified) VALUES (?,?,?,?,1)', [
      process.env.ADMIN_USERNAME, bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10), 'ADMIN', process.env.ADMIN_EMAIL || null
    ]);
  }
  const userCount = get('SELECT COUNT(*) as c FROM users').c;
  if (userCount > 0 || process.env.SEED_DEMO_DATA !== 'true') return;

  // Seed default programmes (also for fresh DB)
  const progs = [
    ['M.Sc. DFIS', 4],
    ['M.Sc. Cyber Security', 4],
    ['M.Sc. Data Science', 4],
    ['B.Sc. Computer Science', 6],
    ['B.Tech. Information Technology', 8],
    ['MCA', 6],
    ['MBA (IT)', 4],
  ];
  progs.forEach(([name, dur]) => {
    run('INSERT OR IGNORE INTO programmes (name, duration_semesters) VALUES (?,?)', [name, dur]);
  });

  const hash = (p) => bcrypt.hashSync(p, 10);
  const demoPassword = name => process.env[name] || crypto.randomBytes(32).toString('hex');

  run('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)', ['coordinator', hash(demoPassword('DEMO_COORDINATOR_PASSWORD')), 'coordinator']);
  run('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)', ['student001', hash(demoPassword('DEMO_STUDENT_PASSWORD')), 'student']);
  run('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)', ['student002', hash(demoPassword('DEMO_STUDENT_PASSWORD')), 'student']);
  run('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)', ['student003', hash(demoPassword('DEMO_STUDENT_PASSWORD')), 'student']);

  run('INSERT INTO students (user_id, name, enrolment_number, programme, semester, email, phone) VALUES (?,?,?,?,?,?,?)', [2, 'Aanya Sharma', 'MSDFIS2024001', 'M.Sc. DFIS', 1, 'aanya@example.com', '9876543210']);
  run('INSERT INTO students (user_id, name, enrolment_number, programme, semester, email, phone) VALUES (?,?,?,?,?,?,?)', [3, 'Rohan Mehta', 'MSDFIS2024002', 'M.Sc. DFIS', 1, 'rohan@example.com', '9876543211']);
  run('INSERT INTO students (user_id, name, enrolment_number, programme, semester, email, phone) VALUES (?,?,?,?,?,?,?)', [4, 'Priya Nair', 'MSDFIS2024003', 'M.Sc. DFIS', 2, 'priya@example.com', '9876543212']);

  run('INSERT INTO storage_locations (department, location_type, name, description) VALUES (?,?,?,?)', ['DFIS', 'laboratory', 'DFIS Lab A', 'Main digital forensics lab']);
  run('INSERT INTO storage_locations (department, location_type, name, description) VALUES (?,?,?,?)', ['DFIS', 'cupboard', 'Cupboard C1', 'Storage cupboard in Lab A']);

  run(`INSERT INTO inventory_items (item_code, name, category, description, make_model, tracking_type, total_quantity, available_quantity, max_issue_quantity, max_renewals, storage_location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['DEV-BOARD-01', 'Development Board', 'Electronics', 'Raspberry Pi development board for forensics experiments', 'Raspberry Pi 4B', 'individual', 10, 10, 1, 2, 1]);
  run(`INSERT INTO inventory_items (item_code, name, category, description, make_model, tracking_type, total_quantity, available_quantity, max_issue_quantity, max_renewals, storage_location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['USB-CABLE-01', 'USB Cable', 'Accessories', 'USB Type-A to Type-C cable', 'Generic', 'quantity', 20, 20, 5, 2, 2]);
  run(`INSERT INTO inventory_items (item_code, name, category, description, make_model, tracking_type, total_quantity, available_quantity, max_issue_quantity, max_renewals, storage_location_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['ADAPT-01', 'USB Adapter', 'Accessories', 'USB to Ethernet adapter', 'TP-Link', 'quantity', 15, 15, 3, 2, 2]);

  for (let i = 1; i <= 10; i++) {
    const assetId = `DB-${String(i).padStart(3, '0')}`;
    run('INSERT INTO individual_assets (item_id, asset_id, serial_number, location_id, condition, status) VALUES (?,?,?,?,?,?)', [1, assetId, `SN-RPi4-${String(i).padStart(4, '0')}`, 1, 'good', 'available']);
  }
}

function repairStudentUserLinks() {
  const orphaned = all('SELECT id FROM students WHERE user_id IS NULL OR user_id = 0 ORDER BY id');
  const availableUsers = all(`
    SELECT u.id FROM users u
    LEFT JOIN students s ON s.user_id = u.id
    WHERE u.role = 'student' AND s.id IS NULL
    ORDER BY u.id
  `);
  orphaned.forEach((student, index) => {
    const user = availableUsers[index];
    if (user) run('UPDATE students SET user_id = ? WHERE id = ?', [user.id, student.id]);
  });
}

async function initDb() {
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  initSchema();
  seedData();
  repairStudentUserLinks();
}

module.exports = { prepare, run, get, all, exec, transaction, saveDb, initDb };
