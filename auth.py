"""Admin / user access layer for Deskwise.

This file only ADDS features. Nothing in app.py is modified except one line
that calls init_auth(...) (see README_ADDITIONS.md).

What it adds
- "/"            -> role picker (Employee / Admin)
- "/chat"        -> user page: chatbot only, no knowledge-base controls
- "/admin"       -> your existing full UI (documents + chatbot), admin only
- "/admin/login" -> first-time setup, sign in, forgot password
- admin-only protection on the document APIs (list / paste / upload / delete)
"""
import re
import secrets
import time

from flask import jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

ADMIN_SESSION_SECONDS = 8 * 3600   # admin must sign in again after 8 hours
MAX_FAILS = 5                      # wrong attempts before a temporary lock
LOCK_SECONDS = 300                 # lock length (5 minutes)

_fails = {}


def init_auth(app, connect, lock, token):
    # ---------- storage ----------
    with connect() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS admin (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                question TEXT NOT NULL,
                answer_hash TEXT NOT NULL,
                recovery_hash TEXT NOT NULL
            )
            """
        )

    def get_admin():
        with connect() as db:
            row = db.execute("SELECT * FROM admin WHERE id = 1").fetchone()
            return dict(row) if row else None

    # ---------- helpers ----------
    def is_admin():
        return (
            session.get("is_admin") is True
            and time.time() - session.get("admin_at", 0) < ADMIN_SESSION_SECONDS
        )

    def body():
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def text(data, key, limit=200):
        value = data.get(key, "")
        return value.strip()[:limit] if isinstance(value, str) else ""

    def secret_text(data, key):
        value = data.get(key, "")
        return value[:128] if isinstance(value, str) else ""

    def norm_answer(value):
        return re.sub(r"\s+", " ", value.strip().casefold())

    def norm_code(value):
        return re.sub(r"[^A-Z0-9]", "", value.upper())

    def new_recovery_code():
        return "-".join(secrets.token_hex(2).upper() for _ in range(4))

    def password_problem(password):
        if len(password) < 8:
            return "Password must be at least 8 characters."
        if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
            return "Password must contain at least one letter and one number."
        return ""

    def wait_seconds(action):
        _, until = _fails.get(f"{action}:{request.remote_addr}", (0, 0))
        return max(0, int(until - time.time()))

    def register_fail(action):
        key = f"{action}:{request.remote_addr}"
        count, until = _fails.get(key, (0, 0))
        if until and until <= time.time():
            count = 0
        count += 1
        _fails[key] = (count, time.time() + LOCK_SECONDS if count >= MAX_FAILS else 0)

    def clear_fails(action):
        _fails.pop(f"{action}:{request.remote_addr}", None)

    def locked_response(action):
        wait = wait_seconds(action)
        if wait:
            minutes = max(1, round(wait / 60))
            return (
                jsonify(error=f"Too many attempts. Try again in about {minutes} minute(s)."),
                429,
            )
        return None

    def sign_in():
        session["is_admin"] = True
        session["admin_at"] = time.time()

    # ---------- role gating (runs for every request) ----------
    @app.before_request
    def role_gate():
        path = request.path

        if path == "/" and request.method == "GET":
            return render_template("landing.html", token=token)

        admin_only = (
            path in {"/api/documents", "/api/paste", "/api/upload"}
            or path.startswith("/api/documents/")
        )
        if admin_only and not is_admin():
            return jsonify(error="Admin sign-in required."), 401
        return None

    # ---------- pages ----------
    @app.get("/chat")
    def user_chat():
        return render_template("user.html", token=token)

    @app.get("/admin")
    def admin_home():
        if not is_admin():
            return redirect("/admin/login")
        html = render_template("index.html", token=token)
        extra = (
            '<link rel="stylesheet" href="/static/admin-bar.css">'
            '<script src="/static/admin-bar.js" defer></script>'
        )
        return html.replace("</body>", extra + "</body>", 1)

    @app.get("/admin/login")
    def admin_login_page():
        if is_admin():
            return redirect("/admin")
        mode = "login" if get_admin() else "setup"
        return render_template("admin_login.html", token=token, mode=mode)

    # ---------- public status (no document names, no key info) ----------
    @app.get("/api/status")
    def public_status():
        with connect() as db:
            count = db.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        return jsonify(documents=count)

    # ---------- auth API ----------
    @app.post("/api/auth/setup")
    def auth_setup():
        if get_admin():
            return jsonify(error="An admin account already exists."), 400

        data = body()
        username = text(data, "username", 60)
        password = secret_text(data, "password")
        question = text(data, "question", 160)
        answer = norm_answer(text(data, "answer", 160))

        if len(username) < 3:
            return jsonify(error="Username must be at least 3 characters."), 400
        problem = password_problem(password)
        if problem:
            return jsonify(error=problem), 400
        if len(question) < 5 or len(answer) < 2:
            return jsonify(error="Add a security question and its answer."), 400

        code = new_recovery_code()
        with lock, connect() as db:
            db.execute(
                "INSERT OR IGNORE INTO admin VALUES (1, ?, ?, ?, ?, ?)",
                (
                    username,
                    generate_password_hash(password),
                    question,
                    generate_password_hash(answer),
                    generate_password_hash(norm_code(code)),
                ),
            )
        sign_in()
        return jsonify(message="Admin account created.", recovery_code=code)

    @app.post("/api/auth/login")
    def auth_login():
        blocked = locked_response("login")
        if blocked:
            return blocked

        admin = get_admin()
        if not admin:
            return jsonify(error="No admin account yet. Refresh to set one up."), 400

        data = body()
        username = text(data, "username", 60)
        password = secret_text(data, "password")

        user_ok = secrets.compare_digest(
            username.encode("utf-8"), admin["username"].encode("utf-8")
        )
        pass_ok = check_password_hash(admin["password_hash"], password)

        if not (user_ok and pass_ok):
            register_fail("login")
            return jsonify(error="Incorrect username or password."), 401

        clear_fails("login")
        sign_in()
        return jsonify(message="Signed in.")

    @app.post("/api/auth/logout")
    def auth_logout():
        session.pop("is_admin", None)
        session.pop("admin_at", None)
        return jsonify(message="Signed out.")

    @app.get("/api/auth/question")
    def auth_question():
        admin = get_admin()
        if not admin:
            return jsonify(error="No admin account yet."), 400
        return jsonify(question=admin["question"])

    @app.post("/api/auth/reset")
    def auth_reset():
        blocked = locked_response("reset")
        if blocked:
            return blocked

        admin = get_admin()
        if not admin:
            return jsonify(error="No admin account yet."), 400

        data = body()
        method = text(data, "method", 10)
        supplied = text(data, "secret", 160)
        new_password = secret_text(data, "new_password")

        problem = password_problem(new_password)
        if problem:
            return jsonify(error=problem), 400

        if method == "code":
            ok = check_password_hash(admin["recovery_hash"], norm_code(supplied))
        elif method == "answer":
            ok = check_password_hash(admin["answer_hash"], norm_answer(supplied))
        else:
            return jsonify(error="Choose a recovery method."), 400

        if not ok:
            register_fail("reset")
            return jsonify(error="That recovery detail is not correct."), 401

        clear_fails("reset")
        new_code = new_recovery_code() if method == "code" else None

        with lock, connect() as db:
            if new_code:
                db.execute(
                    "UPDATE admin SET password_hash = ?, recovery_hash = ? WHERE id = 1",
                    (
                        generate_password_hash(new_password),
                        generate_password_hash(norm_code(new_code)),
                    ),
                )
            else:
                db.execute(
                    "UPDATE admin SET password_hash = ? WHERE id = 1",
                    (generate_password_hash(new_password),),
                )

        session.pop("is_admin", None)
        session.pop("admin_at", None)
        return jsonify(message="Password updated. Please sign in.", recovery_code=new_code)

    @app.post("/api/auth/change")
    def auth_change():
        if not is_admin():
            return jsonify(error="Admin sign-in required."), 401

        blocked = locked_response("change")
        if blocked:
            return blocked

        data = body()
        current = secret_text(data, "current")
        new_password = secret_text(data, "new_password")
        admin = get_admin()

        if not check_password_hash(admin["password_hash"], current):
            register_fail("change")
            return jsonify(error="Current password is incorrect."), 401

        problem = password_problem(new_password)
        if problem:
            return jsonify(error=problem), 400

        clear_fails("change")
        with lock, connect() as db:
            db.execute(
                "UPDATE admin SET password_hash = ? WHERE id = 1",
                (generate_password_hash(new_password),),
            )
        return jsonify(message="Password changed.")
