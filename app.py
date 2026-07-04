import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, g, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "complaints.db"

app = Flask(__name__)
app.config["SECRET_KEY"] = "change-this-secret-key-in-production"
app.config["JSON_SORT_KEYS"] = False

DEPARTMENTS = ["Computer Science", "Civil", "Electronics", "Mechanical"]
STATUSES = ["Pending", "In Progress", "Resolved"]

def get_db():
    """Open (or reuse) a SQLite connection for the current request."""
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create tables (if missing) and seed one HOD login per department."""
    db = sqlite3.connect(DB_PATH)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            roll TEXT NOT NULL,
            semester TEXT NOT NULL,
            department TEXT NOT NULL,
            subject TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            remarks TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS hods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            department TEXT NOT NULL
        )
        """
    )
    db.commit()
    existing = db.execute("SELECT COUNT(*) AS c FROM hods").fetchone()[0]
    if existing == 0:
        default_password = generate_password_hash("hod@123")
        for dept in DEPARTMENTS:
            slug = dept.lower().replace(" ", "")
            db.execute(
                "INSERT INTO hods (email, password_hash, department) VALUES (?, ?, ?)",
                (f"hod.{slug}@college.edu", default_password, dept),
            )
        db.commit()
        print("Seeded default HOD accounts (password for all: hod@123):")
        for dept in DEPARTMENTS:
            slug = dept.lower().replace(" ", "")
            print(f"   - hod.{slug}@college.edu  ({dept})")
    db.close()


def now_iso():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def row_to_complaint(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "roll": row["roll"],
        "semester": row["semester"],
        "department": row["department"],
        "subject": row["subject"],
        "description": row["description"],
        "status": row["status"],
        "remarks": row["remarks"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/complaint")
def complaint_page():
    return render_template("complaint.html")


@app.route("/hod-login")
def hod_login_page():
    return render_template("hod_login.html")


@app.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html")


@app.route("/track")
def track_page():
    return render_template("track.html")
@app.route("/api/complaints", methods=["POST"])
def add_complaint():
    data = request.get_json(silent=True) or {}

    required_fields = ["name", "roll", "semester", "department", "subject", "description"]
    missing = [f for f in required_fields if not str(data.get(f, "")).strip()]
    if missing:
        return jsonify({"error": f"Missing required field(s): {', '.join(missing)}"}), 400

    db = get_db()
    timestamp = now_iso()
    cur = db.execute(
        """
        INSERT INTO complaints (name, roll, semester, department, subject, description, status, remarks, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending', '', ?, ?)
        """,
        (
            data["name"].strip(),
            data["roll"].strip(),
            data["semester"].strip(),
            data["department"].strip(),
            data["subject"].strip(),
            data["description"].strip(),
            timestamp,
            timestamp,
        ),
    )
    db.commit()
    complaint_id = cur.lastrowid
    row = db.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    return jsonify({"message": "Complaint submitted successfully", "complaint": row_to_complaint(row)}), 201


@app.route("/api/complaints", methods=["GET"])
def list_complaints():
    """List complaints. Supports optional filters used by the dashboard and
    the student tracking page: ?department=, ?status=, ?roll="""
    department = request.args.get("department")
    status = request.args.get("status")
    roll = request.args.get("roll")

    query = "SELECT * FROM complaints WHERE 1=1"
    params = []
    if department:
        query += " AND department = ?"
        params.append(department)
    if status:
        query += " AND status = ?"
        params.append(status)
    if roll:
        query += " AND roll = ?"
        params.append(roll)
    query += " ORDER BY created_at DESC"

    rows = get_db().execute(query, params).fetchall()
    return jsonify({"complaints": [row_to_complaint(r) for r in rows]})


@app.route("/api/complaints/<int:complaint_id>", methods=["GET"])
def get_complaint(complaint_id):
    row = get_db().execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    if not row:
        return jsonify({"error": "Complaint not found"}), 404
    return jsonify({"complaint": row_to_complaint(row)})


@app.route("/api/complaints/<int:complaint_id>", methods=["PATCH"])
def update_complaint(complaint_id):
    """HOD-only: update the status/remarks of a complaint in their own department."""
    if "hod_email" not in session:
        return jsonify({"error": "Unauthorized. Please log in as HOD."}), 401

    data = request.get_json(silent=True) or {}
    status = data.get("status")
    remarks = data.get("remarks", "")

    if status and status not in STATUSES:
        return jsonify({"error": f"Status must be one of {STATUSES}"}), 400

    db = get_db()
    row = db.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    if not row:
        return jsonify({"error": "Complaint not found"}), 404

    if row["department"] != session.get("hod_department"):
        return jsonify({"error": "You can only manage complaints from your own department"}), 403

    db.execute(
        "UPDATE complaints SET status = COALESCE(?, status), remarks = ?, updated_at = ? WHERE id = ?",
        (status, remarks, now_iso(), complaint_id),
    )
    db.commit()
    updated = db.execute("SELECT * FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
    return jsonify({"message": "Complaint updated", "complaint": row_to_complaint(updated)})


@app.route("/api/complaints/stats", methods=["GET"])
def complaint_stats():
    """Small aggregate endpoint that powers the dashboard's summary cards."""
    department = request.args.get("department")
    db = get_db()
    query = "SELECT status, COUNT(*) as c FROM complaints"
    params = []
    if department:
        query += " WHERE department = ?"
        params.append(department)
    query += " GROUP BY status"
    rows = db.execute(query, params).fetchall()

    stats = {s: 0 for s in STATUSES}
    total = 0
    for r in rows:
        stats[r["status"]] = r["c"]
        total += r["c"]
    stats["Total"] = total
    return jsonify(stats)

@app.route("/api/hod/login", methods=["POST"])
def hod_login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    department = str(data.get("department", "")).strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    db = get_db()
    row = db.execute("SELECT * FROM hods WHERE email = ?", (email,)).fetchone()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    if department and department != row["department"]:
        return jsonify({"error": "Department does not match our records for this account"}), 401

    session["hod_email"] = row["email"]
    session["hod_department"] = row["department"]

    return jsonify({"message": "Login successful", "department": row["department"], "email": row["email"]})


@app.route("/api/hod/logout", methods=["POST"])
def hod_logout():
    session.clear()
    return jsonify({"message": "Logged out"})


@app.route("/api/hod/me", methods=["GET"])
def hod_me():
    if "hod_email" not in session:
        return jsonify({"authenticated": False}), 200
    return jsonify(
        {
            "authenticated": True,
            "email": session["hod_email"],
            "department": session["hod_department"],
        }
    )


@app.route("/api/meta", methods=["GET"])
def meta():
    """Exposes dropdown options so the frontend never hardcodes lists twice."""
    return jsonify({"departments": DEPARTMENTS, "statuses": STATUSES})


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return render_template("index.html"), 404


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
