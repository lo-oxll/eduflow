"""
Authentication, authorization and security-header tests.

These exercise the real Flask app against a temporary SQLite database.
"""
import os
import sqlite3
import tempfile
import time

import bcrypt
import jwt

import database
import server


def _hash(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


class TestHealthAndHeaders:
    def test_health_reports_sqlite_and_configuration(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        body = response.get_json()
        assert body["status"] in ("healthy", "degraded")
        assert body["database"] == "sqlite"
        assert body["configuration"]["requirePortalPasswords"] is False

    def test_security_headers_are_present(self, client):
        response = client.get("/health")
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"
        assert response.headers["Referrer-Policy"] == "no-referrer"
        assert "default-src 'self'" in response.headers["Content-Security-Policy"]

    def test_uploads_require_authentication(self, client, auth):
        import uuid

        filename = f"missing-{uuid.uuid4().hex}.png"
        assert client.get(f"/uploads/{filename}").status_code == 401
        authenticated = client.get(f"/uploads/{filename}", headers=auth("admin"))
        assert authenticated.status_code == 404

    def test_spa_fallback_still_serves_index_for_app_routes(self, client):
        response = client.get("/dashboard/students")
        assert response.status_code == 200
        assert response.content_type.startswith("text/html")


class TestAdminLogin:
    def test_sqlite_legacy_schema_is_backfilled(self):
        original_path = database.SQLITE_PATH
        original_use_sqlite = database._use_sqlite

        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = os.path.join(tmp_dir, "legacy.db")
            connection = sqlite3.connect(db_path)
            connection.execute(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, role TEXT)"
            )
            connection.execute(
                "CREATE TABLE academic_years (id INTEGER PRIMARY KEY, start_date TEXT, end_date TEXT)"
            )
            connection.commit()
            connection.close()

            database.SQLITE_PATH = db_path
            database._use_sqlite = True
            database.init_db()

            migrated = sqlite3.connect(db_path)
            users_columns = [row[1] for row in migrated.execute("PRAGMA table_info(users)").fetchall()]
            academic_columns = [row[1] for row in migrated.execute("PRAGMA table_info(academic_years)").fetchall()]
            migrated.close()

            assert "must_change_password" in users_columns
            assert "year_name" in academic_columns

        database.SQLITE_PATH = original_path
        database._use_sqlite = original_use_sqlite

    def test_login_success_returns_token_without_password_hash(self, client, admin_credentials):
        response = client.post("/api/admin/login", json=admin_credentials)
        assert response.status_code == 200
        body = response.get_json()
        assert body["success"] is True
        assert body["token"]
        assert body["user"]["role"] == "admin"
        assert "password_hash" not in response.get_data(as_text=True)

    def test_wrong_password_and_unknown_user_share_the_same_error(self, client, admin_credentials):
        wrong_password = client.post("/api/admin/login", json={
            "username": admin_credentials["username"], "password": "definitely-wrong",
        })
        unknown_user = client.post("/api/admin/login", json={
            "username": "ghost-user", "password": "definitely-wrong",
        })
        assert wrong_password.status_code == 401
        assert unknown_user.status_code == 401
        assert wrong_password.get_json() == unknown_user.get_json()

    def test_missing_fields_are_rejected(self, client, admin_credentials):
        response = client.post("/api/admin/login", json={"username": admin_credentials["username"]})
        assert response.status_code == 400

    def test_repeated_failures_lock_the_account(self, client, admin_credentials):
        lockout = server.security_middleware.account_lockout
        for _ in range(lockout.lockout_threshold):
            client.post("/api/admin/login", json={
                "username": admin_credentials["username"], "password": "wrong",
            })
        locked, _remaining = lockout.is_locked_out(f"admin:{admin_credentials['username']}")
        assert locked is True

        response = client.post("/api/admin/login", json=admin_credentials)
        assert response.status_code == 429


class TestAdminPasswordManagement:
    def test_change_password_flow(self, client, db, sign_token):
        username = "mutable-admin"
        password = "InitialPass123!"
        admin_id = db["execute"](
            "INSERT INTO users (username, password_hash, role, must_change_password) "
            "VALUES (%s, %s, 'admin', TRUE)",
            (username, _hash(password)),
        )
        headers = {"Authorization": "Bearer " + sign_token(
            {"id": admin_id, "username": username, "role": "admin"}
        )}

        short = client.post("/api/admin/change-password", headers=headers, json={
            "current_password": password, "new_password": "short",
        })
        assert short.status_code == 400

        wrong_current = client.post("/api/admin/change-password", headers=headers, json={
            "current_password": "not-the-password", "new_password": "AnotherPass123!",
        })
        assert wrong_current.status_code == 401

        changed = client.post("/api/admin/change-password", headers=headers, json={
            "current_password": password, "new_password": "AnotherPass123!",
        })
        assert changed.status_code == 200

        old_login = client.post("/api/admin/login", json={
            "username": username, "password": password,
        })
        assert old_login.status_code == 401
        new_login = client.post("/api/admin/login", json={
            "username": username, "password": "AnotherPass123!",
        })
        assert new_login.status_code == 200
        assert new_login.get_json()["user"]["must_change_password"] is False

    def test_change_password_requires_admin_role(self, client, auth):
        response = client.post(
            "/api/admin/change-password",
            headers=auth("school_a"),
            json={"current_password": "x", "new_password": "AnotherPass123!"},
        )
        assert response.status_code == 403

    def test_portal_password_validation(self, client, auth):
        admin = auth("admin")
        school = auth("school_a")

        assert client.post("/api/admin/portal-password", headers=school, json={
            "entity": "teacher", "id": 1, "password": "AnyPassword123!",
        }).status_code == 403

        assert client.post("/api/admin/portal-password", headers=admin, json={
            "entity": "principal", "id": 1, "password": "AnyPassword123!",
        }).status_code == 400

        assert client.post("/api/admin/portal-password", headers=admin, json={
            "entity": "teacher", "id": 1, "password": "short",
        }).status_code == 400

        missing_account = client.post("/api/admin/portal-password", headers=admin, json={
            "entity": "teacher", "id": 999999, "password": "AnyPassword123!",
        })
        assert missing_account.status_code == 404

    def test_admin_can_provision_a_portal_password(self, client, db, auth, seed):
        teacher_id = db["execute"](
            "INSERT INTO teachers (school_id, full_name, teacher_code) VALUES (%s, %s, %s)",
            (seed["school_b"], "معلم مؤقت", "TMP-PASSWORD-001"),
        )
        try:
            response = client.post("/api/admin/portal-password", headers=auth("admin"), json={
                "entity": "teacher", "id": teacher_id, "password": "TempTeacherPass1!",
            })
            assert response.status_code == 200

            without_password = client.post(
                "/api/teacher/login", json={"teacher_code": "TMP-PASSWORD-001"}
            )
            assert without_password.status_code == 401

            with_password = client.post("/api/teacher/login", json={
                "teacher_code": "TMP-PASSWORD-001", "password": "TempTeacherPass1!",
            })
            assert with_password.status_code == 200
        finally:
            db["execute"]("DELETE FROM teachers WHERE id = %s", (teacher_id,))


class TestPortalLogins:
    def test_school_login_without_configured_password_still_works(self, client, seed):
        response = client.post("/api/school/login", json={"code": "schb01"})
        assert response.status_code == 200
        body = response.get_json()
        assert body["school"]["id"] == seed["school_b"]
        assert "password_hash" not in response.get_data(as_text=True)

    def test_school_login_requires_configured_password(self, client, seed):
        assert client.post("/api/school/login", json={"code": "SCHA01"}).status_code == 401
        assert client.post("/api/school/login", json={
            "code": "SCHA01", "password": "wrong-password",
        }).status_code == 401
        accepted = client.post("/api/school/login", json={
            "code": "SCHA01", "password": seed["passwords"]["school_a"],
        })
        assert accepted.status_code == 200

    def test_student_login_password_rules(self, client, seed):
        assert client.post("/api/student/login", json={"code": "STUA001"}).status_code == 401
        assert client.post("/api/student/login", json={
            "code": "STUA001", "password": "wrong",
        }).status_code == 401
        accepted = client.post("/api/student/login", json={
            "code": "STUA001", "password": seed["passwords"]["student_a"],
        })
        assert accepted.status_code == 200
        assert accepted.get_json()["student"]["school_id"] == seed["school_a"]

        legacy = client.post("/api/student/login", json={"code": "STUB001"})
        assert legacy.status_code == 200

    def test_teacher_login_returns_subjects_without_secrets(self, client, seed):
        response = client.post("/api/teacher/login", json={
            "teacher_code": "TA001", "password": seed["passwords"]["teacher_a"],
        })
        assert response.status_code == 200
        body = response.get_json()
        assert body["teacher"]["id"] == seed["teacher_a"]
        assert [subject["name"] for subject in body["teacher"]["subjects"]] == ["الرياضيات"]
        assert "password_hash" not in response.get_data(as_text=True)

    def test_suspended_school_blocks_all_of_its_portals(self, client, db, seed):
        db["execute"]("UPDATE schools SET is_suspended = 1 WHERE id = %s", (seed["school_b"],))
        try:
            school = client.post("/api/school/login", json={"code": "SCHB01"})
            student = client.post("/api/student/login", json={"code": "STUB001"})
            teacher = client.post("/api/teacher/login", json={"teacher_code": "TB001"})
            assert school.status_code == 403
            assert student.status_code == 403
            assert teacher.status_code == 403
        finally:
            db["execute"]("UPDATE schools SET is_suspended = 0 WHERE id = %s", (seed["school_b"],))


class TestPasswordHashing:
    def test_stored_hashes_are_bcrypt_and_verify(self, db, seed):
        row = db["query_one"](
            "SELECT password_hash FROM teachers WHERE id = %s", (seed["teacher_a"],)
        )
        assert row["password_hash"].startswith("$2b$")
        assert bcrypt.checkpw(
            seed["passwords"]["teacher_a"].encode(), row["password_hash"].encode()
        )

    def test_login_tokens_expire_after_configured_lifetime(self, client, admin_credentials):
        response = client.post("/api/admin/login", json=admin_credentials)
        payload = jwt.decode(
            response.get_json()["token"], server.JWT_SECRET, algorithms=["HS256"]
        )
        lifetime = server.JWT_EXPIRES_HOURS * 3600
        assert lifetime - 3600 < payload["exp"] - time.time() <= lifetime
