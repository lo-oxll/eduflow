"""
Unit tests for the database layer (core/database.py).

The suite runs against the temporary SQLite database configured in conftest,
which exercises the PostgreSQL-compatible adapter used by the app.
"""
import sqlite3

import pytest

import database


class TestDialectDetection:
    def test_active_dialect_is_sqlite(self):
        assert database.get_database_dialect() == "sqlite"

    def test_info_flags_sqlite_as_not_production_ready(self):
        info = database.get_database_info()
        assert info["dialect"] == "sqlite"
        assert info["production_ready"] is False
        assert info["target"].endswith("test_school.db")

    def test_group_concat_is_dialect_aware(self):
        assert database.group_concat_sql("s.name") == "GROUP_CONCAT(s.name, ',')"
        assert database.group_concat_sql("s.name", ";") == "GROUP_CONCAT(s.name, ';')"


class TestDdlTranslation:
    @pytest.mark.parametrize("source,expected_fragment", [
        ("id SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY AUTOINCREMENT"),
        ("payload JSONB", "payload TEXT"),
        ("student_id INT NOT NULL", "student_id INTEGER NOT NULL"),
    ])
    def test_postgres_types_are_translated(self, source, expected_fragment):
        assert expected_fragment in database._translate_ddl(f"CREATE TABLE x ({source})")

    def test_on_update_current_timestamp_is_dropped(self):
        translated = database._translate_ddl(
            "CREATE TABLE x (updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP "
            "ON UPDATE CURRENT_TIMESTAMP)"
        )
        assert "ON UPDATE" not in translated
        assert "DEFAULT CURRENT_TIMESTAMP" in translated


class TestSupabaseUrlNormalization:
    def test_empty_url_is_unchanged(self):
        assert database._normalize_database_url("") == ""

    def test_legacy_postgres_scheme_is_upgraded(self):
        url = database._normalize_database_url("postgres://user:pass@example.com:5432/db")
        assert url == "postgresql://user:pass@example.com:5432/db"

    def test_supabase_pooler_gets_ssl_required(self):
        url = database._normalize_database_url(
            "postgresql://postgres.ref:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
        )
        assert url.endswith("?sslmode=require")

    def test_existing_sslmode_is_preserved(self):
        original = "postgresql://postgres.ref:pass@db.ref.supabase.co:5432/postgres?sslmode=verify-full"
        assert database._normalize_database_url(original) == original

    def test_non_supabase_host_is_unchanged(self):
        original = "postgresql://user:pass@localhost:5432/school"
        assert database._normalize_database_url(original) == original


class TestSqliteAdapter:
    def test_percent_placeholders_are_converted(self, db):
        row = db["query_one"]("SELECT code FROM schools WHERE code = %s", ("SCHA01",))
        assert row["code"] == "SCHA01"

    def test_foreign_keys_are_enforced(self, db):
        with pytest.raises(Exception) as error:
            db["execute"](
                "INSERT INTO student_grades (student_id, academic_year_id, subject_name) "
                "VALUES (%s, %s, %s)",
                (987654, 987654, "الرياضيات"),
            )
        assert isinstance(error.value, sqlite3.IntegrityError)

    def test_upsert_unique_indexes_exist(self, db):
        indexes = {
            row["name"]
            for row in db["query"]("SELECT name FROM sqlite_master WHERE type = 'index'")
        }
        assert "idx_sg_unique" in indexes
        assert "idx_sa_unique" in indexes

    def test_arabic_text_round_trips(self, db, seed):
        school = db["query_one"]("SELECT name FROM schools WHERE id = %s", (seed["school_a"],))
        assert school["name"] == "مدرسة ألف"


class TestQueries:
    def test_teacher_subjects(self, seed):
        subjects = database.get_teacher_subjects(seed["teacher_a"])
        assert [subject["name"] for subject in subjects] == ["الرياضيات"]

    def test_class_teachers_are_scoped_by_school(self, seed):
        own = database.get_class_teachers(
            "الخامس الابتدائي", school_id=seed["school_a"]
        )
        assert [teacher["teacher_code"] for teacher in own] == ["TA001"]

        foreign = database.get_class_teachers(
            "الخامس الابتدائي", school_id=seed["school_b"]
        )
        assert foreign == []

    def test_school_teacher_assignments(self, seed):
        assignments = database.get_school_teacher_class_assignments(
            seed["school_a"], seed["year_id"]
        )
        assert assignments
        assert assignments[0]["teacher_code"] == "TA001"
