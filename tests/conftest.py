"""
Test configuration for EduFlow.

The application is imported exactly once, after the environment has been
pointed at a throwaway SQLite database. All tests share that database; any
test that mutates state is responsible for creating its own disposable rows.
"""
import os
import sys
import shutil
import tempfile
from pathlib import Path

import bcrypt
import jwt
import pytest

PROJECT_ROOT = Path(__file__).parent.parent
CORE_DIR = PROJECT_ROOT / "core"
for path in (str(PROJECT_ROOT), str(CORE_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

TEST_JWT_SECRET = "test-secret-key-for-eduflow-tests-not-for-production"
TEST_ADMIN_USERNAME = "admin"
TEST_ADMIN_PASSWORD = "AdminTestPass123!"

_TMP_DIR = tempfile.mkdtemp(prefix="eduflow-tests-")
_TEST_DB_PATH = os.path.join(_TMP_DIR, "test_school.db")

# Must be configured before importing server/database: both read the
# environment at import time.
os.environ.update({
    "NODE_ENV": "development",
    "JWT_SECRET": TEST_JWT_SECRET,
    "SQLITE_PATH": _TEST_DB_PATH,
    "DATABASE_URL": "",
    "POSTGRES_HOST": "127.0.0.1",
    "POSTGRES_PORT": "1",
    "DB_POOL_TIMEOUT": "1",
    "REDIS_URL": "",
    "ALLOW_BOOTSTRAP_ADMIN": "1",
    "BOOTSTRAP_ADMIN_USERNAME": TEST_ADMIN_USERNAME,
    "BOOTSTRAP_ADMIN_PASSWORD": TEST_ADMIN_PASSWORD,
    "REQUIRE_PORTAL_PASSWORDS": "false",
    "TRUST_PROXY": "",
    "ACCOUNT_LOCKOUT_THRESHOLD": "5",
})
for key in ("RENDER", "RAILWAY_ENVIRONMENT", "VERCEL", "CORS_ORIGINS"):
    os.environ.pop(key, None)

import server  # noqa: E402  (import after env setup on purpose)


def pytest_sessionfinish(session, exitstatus):
    shutil.rmtree(_TMP_DIR, ignore_errors=True)


def _hash(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def db_execute(sql, params=()):
    """Run a statement and return the new row id (if any)."""
    pool = server.get_mysql_pool()
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def db_query(sql, params=()):
    pool = server.get_mysql_pool()
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params)
        return cur.fetchall()
    finally:
        conn.close()


def db_query_one(sql, params=()):
    rows = db_query(sql, params)
    return rows[0] if rows else None


@pytest.fixture(scope="session")
def db():
    return {"execute": db_execute, "query": db_query, "query_one": db_query_one}


# ---------------------------------------------------------------------------
# Seed data: two isolated tenants
# ---------------------------------------------------------------------------
SEED_PASSWORDS = {
    "school_a": "SchoolAPass123!",
    "teacher_a": "TeacherAPass123!",
    "student_a": "StudentAPass123!",
}


@pytest.fixture(scope="session")
def seed(db):
    school_a = db["execute"](
        "INSERT INTO schools (name, code, password_hash, study_type, level, gender_type, is_suspended) "
        "VALUES (%s, %s, %s, %s, %s, %s, 0)",
        ("مدرسة ألف", "SCHA01", _hash(SEED_PASSWORDS["school_a"]), "عام", "ابتدائي", "mixed"),
    )
    school_b = db["execute"](
        "INSERT INTO schools (name, code, study_type, level, gender_type, is_suspended) "
        "VALUES (%s, %s, %s, %s, %s, 0)",
        ("مدرسة باء", "SCHB01", "عام", "ابتدائي", "mixed"),
    )

    year_id = db["execute"](
        "INSERT INTO system_academic_years (name, start_year, end_year, start_date, end_date, is_current) "
        "VALUES (%s, %s, %s, %s, %s, 1)",
        ("2025/2026", 2025, 2026, "2025-09-01", "2026-06-30"),
    )

    subject_a = db["execute"](
        "INSERT INTO subjects (school_id, name, grade_level) VALUES (%s, %s, %s)",
        (school_a, "الرياضيات", "الخامس الابتدائي"),
    )
    subject_b = db["execute"](
        "INSERT INTO subjects (school_id, name, grade_level) VALUES (%s, %s, %s)",
        (school_b, "العلوم", "الخامس الابتدائي"),
    )

    teacher_a = db["execute"](
        "INSERT INTO teachers (school_id, full_name, teacher_code, email, phone, password_hash, grade_level) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (school_a, "معلم ألف", "TA001", "teacher.a@example.com", "0770000001",
         _hash(SEED_PASSWORDS["teacher_a"]), "الخامس الابتدائي"),
    )
    teacher_b = db["execute"](
        "INSERT INTO teachers (school_id, full_name, teacher_code, email, phone, grade_level) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (school_b, "معلم باء", "TB001", "teacher.b@example.com", "0770000002",
         "الخامس الابتدائي"),
    )

    db["execute"](
        "INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (%s, %s)",
        (teacher_a, subject_a),
    )
    db["execute"](
        "INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES (%s, %s)",
        (teacher_b, subject_b),
    )
    db["execute"](
        "INSERT INTO teacher_class_assignments (teacher_id, class_name, subject_id, academic_year_id) "
        "VALUES (%s, %s, %s, %s)",
        (teacher_a, "الخامس الابتدائي", subject_a, year_id),
    )

    student_a = db["execute"](
        "INSERT INTO students (school_id, full_name, student_code, password_hash, grade, room) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (school_a, "طالب ألف", "STUA001", _hash(SEED_PASSWORDS["student_a"]),
         "ابتدائي - الخامس الابتدائي", "101"),
    )
    student_b = db["execute"](
        "INSERT INTO students (school_id, full_name, student_code, grade, room) "
        "VALUES (%s, %s, %s, %s, %s)",
        (school_b, "طالب باء", "STUB001", "ابتدائي - الخامس الابتدائي", "201"),
    )

    admin = db["query_one"]("SELECT id FROM users WHERE username = %s", (TEST_ADMIN_USERNAME,))

    return {
        "school_a": school_a,
        "school_b": school_b,
        "subject_a": subject_a,
        "subject_b": subject_b,
        "teacher_a": teacher_a,
        "teacher_b": teacher_b,
        "student_a": student_a,
        "student_b": student_b,
        "year_id": year_id,
        "admin_id": admin["id"],
        "passwords": SEED_PASSWORDS,
    }


# ---------------------------------------------------------------------------
# Application / HTTP client
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def app():
    server.app.config.update(TESTING=True)
    return server.app


@pytest.fixture(autouse=True)
def reset_security_state():
    """Keep rate limiting and lockouts from leaking between tests."""
    middleware = server.security_middleware
    middleware.rate_limiter.requests.clear()
    middleware.rate_limiter.limits["auth"]["limit"] = 1000
    middleware.rate_limiter.limits["api"]["limit"] = 10000
    middleware.rate_limiter.limits["default"]["limit"] = 10000
    middleware.account_lockout.failed_attempts.clear()
    middleware.account_lockout.lockouts.clear()
    yield


@pytest.fixture
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def make_token(payload):
    return jwt.encode(payload, server.JWT_SECRET, algorithm="HS256")


def auth_header(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture
def tokens(seed):
    return {
        "admin": make_token({
            "id": seed["admin_id"], "username": TEST_ADMIN_USERNAME, "role": "admin",
        }),
        "school_a": make_token({
            "id": seed["school_a"], "code": "SCHA01", "name": "مدرسة ألف", "role": "school",
        }),
        "school_b": make_token({
            "id": seed["school_b"], "code": "SCHB01", "name": "مدرسة باء", "role": "school",
        }),
        "teacher_a": make_token({
            "id": seed["teacher_a"], "teacher_code": "TA001", "name": "معلم ألف",
            "role": "teacher", "school_id": seed["school_a"],
        }),
        "teacher_b": make_token({
            "id": seed["teacher_b"], "teacher_code": "TB001", "name": "معلم باء",
            "role": "teacher", "school_id": seed["school_b"],
        }),
        "student_a": make_token({
            "id": seed["student_a"], "code": "STUA001", "name": "طالب ألف", "role": "student",
        }),
        "student_b": make_token({
            "id": seed["student_b"], "code": "STUB001", "name": "طالب باء", "role": "student",
        }),
    }


@pytest.fixture
def auth(tokens):
    """Return a function mapping a token name to request headers."""
    return lambda name: auth_header(tokens[name])


@pytest.fixture
def sign_token():
    """Sign an arbitrary payload with the application's JWT secret."""
    return make_token


@pytest.fixture
def admin_credentials():
    return {"username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}


@pytest.fixture
def login(client):
    """Log in through the real endpoint and return the JSON payload."""
    def _login(url, payload):
        response = client.post(url, json=payload)
        return response
    return _login


# ---------------------------------------------------------------------------
# Misc sample data kept for utility tests
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_school():
    return {
        "name": "مدرسة النجاح الابتدائية",
        "code": "SCH-001",
        "study_type": "عام",
        "level": "ابتدائي",
        "gender_type": "mixed",
    }


@pytest.fixture
def sample_student():
    return {
        "full_name": "أحمد محمد علي",
        "grade": "ابتدائي - الخامس الابتدائي",
        "room": "101",
        "blood_type": "A+",
        "parent_contact": "+9647701234567",
    }


@pytest.fixture
def sample_teacher():
    return {
        "full_name": "محمد إبراهيم",
        "email": "teacher@example.com",
        "phone": "+9647709876543",
        "grade_level": "الخامس الابتدائي",
    }


@pytest.fixture
def test_passwords():
    return {
        "weak": "123",
        "medium": "password123",
        "strong": "SecureP@ssw0rd123!",
    }
