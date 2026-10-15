# 📦 Department Inventory & Student Item Issue Management System

> A full-stack web application for managing department inventory, issuing reusable items to students, and tracking returns and renewals — built for the hackathon.

---

## 🚀 How to Open / Run the System

### Prerequisites
- **Node.js** v16 or later → [Download here](https://nodejs.org)
- No database setup needed (SQLite is embedded)

### Steps

```bash
# 1. Clone the repository (or download the ZIP)
git clone https://github.com/YOUR_USERNAME/inventory-system.git
cd inventory-system

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

**Then open your browser and go to:** `http://localhost:3000`

The system auto-creates the database and seeds demo data on first run.

### Production security configuration

Set a long, random session secret and run behind HTTPS in production:

```bash
SESSION_SECRET="generate-a-long-random-value" NODE_ENV=production npm start
```

The server applies security headers, strict HTTP-only/SameSite cookies, request
body limits, authentication throttling, API rate limiting, CSRF protection for
state-changing requests, session ID rotation after login, role-based access
checks, and centralized error handling. Keep `data/inventory.db` outside public
web hosting and do not expose the `SESSION_SECRET` in source control.

### Google signup configuration

Student accounts are created through Google OAuth. Google verifies the
student's email address, then the student sets a password and completes their programme,
enrolment, semester, and contact details in the portal. Configure:

```bash
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
APP_BASE_URL="https://your-domain.example"
```

Add this Google OAuth redirect URI in Google Cloud Console:
`https://your-domain.example/api/auth/google/callback`

### Roles and issue requests

Students can browse available inventory from their dashboard and submit
quantity-based issue requests. Coordinators review and approve or reject those
requests, and can add or remove students. An `ADMIN` can access every
operational screen and manage coordinator, student, and administrator accounts.

To bootstrap the first administrator on a fresh or existing database, set
these variables before starting the server. They are used only when no
administrator exists:

```bash
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="use-a-long-unique-password"
ADMIN_EMAIL="admin@example.com"
```

---

For local demonstrations only, set `SEED_DEMO_DATA=true` before the first
database initialization and provide `DEMO_COORDINATOR_PASSWORD` and
`DEMO_STUDENT_PASSWORD`. Never enable demo seeding in production.

---

## 📁 Project Structure

```
inventory-system/
├── src/
│   ├── server.js              # Express server entry point
│   ├── db/
│   │   └── schema.js          # SQLite schema + seed data
│   └── routes/
│       ├── auth.js            # Login / logout / session
│       ├── students.js        # Student CRUD
│       ├── inventory.js       # Items, assets, locations, adjustments
│       ├── issues.js          # Issue items to students
│       ├── returns.js         # Record returns (partial/full)
│       ├── renewals.js        # Request, approve, reject renewals
│       └── reports.js         # Overdue, upcoming, audit, analytics
├── public/
│   ├── index.html             # Single-page app shell
│   ├── css/style.css          # All styles
│   └── js/
│       ├── api.js             # Fetch API wrapper
│       ├── utils.js           # Helpers (dates, modals, toasts)
│       ├── app.js             # Router + auth state
│       └── pages/
│           ├── dashboard.js   # Coordinator dashboard
│           ├── inventory.js   # Inventory management
│           ├── students.js    # Student management
│           ├── issues.js      # Issue management
│           ├── returns.js     # Return recording
│           ├── renewals.js    # Renewal approval
│           ├── reports.js     # Reports & audit log
│           └── student-portal.js  # Student self-service
├── data/                      # Auto-created: SQLite DB stored here
├── package.json
├── .gitignore
└── README.md
```

---

## ✅ Features Implemented

### Core Business Rules
- ✅ Items issued only to registered students
- ✅ Only available items in **good** condition can be issued
- ✅ Issued quantity cannot exceed available stock
- ✅ Individually tracked assets cannot be double-issued
- ✅ Due date auto-calculated as **issue date + 15 days**
- ✅ Renewal request alone does NOT extend due date
- ✅ Coordinator approval extends due date by **15 days from existing due date**
- ✅ Partial returns supported — outstanding quantity tracked separately
- ✅ Damaged/lost items remain unavailable until coordinator updates status
- ✅ Every transaction logged with date and user (full audit trail)

### Inventory
- ✅ **Two tracking modes:** Individual (laptops, dev boards) and Quantity-based (cables, adapters)
- ✅ Individual assets with unique Asset ID, serial number, condition, and location
- ✅ Stock adjustments: addition, retirement, condition change, correction
- ✅ Storage locations: department, lab, room, cupboard

### Issues & Returns
- ✅ Issue with acknowledgement slip showing due date
- ✅ Partial returns — remaining quantity stays outstanding
- ✅ Condition recorded on return (good / damaged / lost)
- ✅ Returned items available immediately if in good condition
- ✅ Clear error messages when stock is insufficient

### Renewals
- ✅ Student requests renewal from their portal
- ✅ Coordinator approves or rejects with remarks
- ✅ Max renewal limit enforced per item
- ✅ Overdue items can be reinstated via renewal approval

### Overdue & Reminders
- ✅ Auto-detection of overdue items on every request
- ✅ Overdue list with formatted description:
  > *"Development Board DB-014 issued to XXXXX was due on 16 October 2026 and is overdue by 3 days."*
- ✅ Upcoming due (within 3 days) dashboard widget
- ✅ Overdue items highlighted in red throughout the UI

### Role-Based Access
- ✅ **Coordinator** — full inventory + transaction management
- ✅ **Student** — own items, renewal requests, history only

### Reports
- ✅ Student-wise, item-wise, programme-wise views
- ✅ Audit log of all actions
- ✅ Stock adjustment history
- ✅ Print-ready reports

---

## 🧪 Example Scenario (as per requirement)

1. Login as `coordinator`
2. Go to **Issues → Issue Item**
3. Select student `Aanya Sharma`, item `Development Board`, asset `DB-001`, date `01-10-2026`
4. System sets due date to **16-10-2026** and reduces stock
5. Login as `student001`, go to **My Items**, click **Request Renewal**
6. Login as `coordinator`, go to **Renewals**, approve → due date extends to **31-10-2026**
7. Record partial return from **Returns** page — remaining qty stays outstanding
8. Overdue items appear red with day count after due date passes

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express.js |
| Database | SQLite (via `better-sqlite3`) |
| Auth | Session-based (`express-session`) |
| Frontend | Vanilla HTML + CSS + JavaScript (no build step) |
| Hosting | Any Node.js host (Railway, Render, Heroku, VPS) |

---

## 📤 Deployment

To deploy on a server or cloud platform:

```bash
# Set environment variable for production
PORT=8080 npm start
```

The `data/` directory will be created automatically for the SQLite database.

---

## 📜 License

MIT — free to use, modify, and distribute.
