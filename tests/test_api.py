"""
Multi-tenant isolation tests.

Every request is authenticated with a real JWT for one of two seeded tenants
(school A / school B). The assertions focus on cross-tenant access being
denied and on same-tenant access still working.
"""
import uuid


def _disposable_student(db, school_id, grade="ابتدائي - الخامس الابتدائي"):
    code = "TMP-" + uuid.uuid4().hex[:10].upper()
    student_id = db["execute"](
        "INSERT INTO students (school_id, full_name, student_code, grade, room) "
        "VALUES (%s, %s, %s, %s, %s)",
        (school_id, f"طالب مؤقت {code}", code, grade, "109"),
    )
    return student_id


class TestSchoolTenantIsolation:
    def test_school_cannot_read_other_school_students(self, client, auth, seed):
        assert client.get(
            f"/api/school/{seed['school_b']}/students", headers=auth("school_a")
        ).status_code == 403

    def test_school_reads_only_its_own_students(self, client, auth, seed):
        response = client.get(
            f"/api/school/{seed['school_a']}/students", headers=auth("school_a")
        )
        assert response.status_code == 200
        students = response.get_json()["students"]
        assert students
        assert {student["school_id"] for student in students} == {seed["school_a"]}

    def test_school_cannot_create_student_in_another_school(self, client, auth, seed):
        response = client.post(
            f"/api/school/{seed['school_b']}/student",
            headers=auth("school_a"),
            json={"full_name": "دخيل", "grade": "ابتدائي - الخامس الابتدائي", "room": "101"},
        )
        assert response.status_code == 403

    def test_school_can_create_update_and_delete_own_student(self, client, auth, seed, db):
        created = client.post(
            f"/api/school/{seed['school_a']}/student",
            headers=auth("school_a"),
            json={
                "full_name": "طالب عبر الواجهة",
                "grade": "ابتدائي - الخامس الابتدائي",
                "room": "105",
                "blood_type": "A+",
            },
        )
        assert created.status_code == 201
        student_id = created.get_json()["student"]["id"]

        updated = client.put(
            f"/api/student/{student_id}",
            headers=auth("school_a"),
            json={
                "full_name": "طالب عبر الواجهة - معدل",
                "grade": "ابتدائي - الخامس الابتدائي",
                "room": "106",
                "blood_type": "O-",
            },
        )
        assert updated.status_code == 200
        assert updated.get_json()["student"]["room"] == "106"

        deleted = client.delete(f"/api/student/{student_id}", headers=auth("school_a"))
        assert deleted.status_code == 200
        assert db["query_one"]("SELECT id FROM students WHERE id = %s", (student_id,)) is None

    def test_school_cannot_touch_other_school_student(self, client, auth, seed, db):
        response = client.put(
            f"/api/student/{seed['student_b']}",
            headers=auth("school_a"),
            json={
                "full_name": "تعديل غير مسموح",
                "grade": "ابتدائي - الخامس الابتدائي",
                "room": "999",
            },
        )
        assert response.status_code == 403
        assert client.delete(
            f"/api/student/{seed['student_b']}", headers=auth("school_a")
        ).status_code == 403

        row = db["query_one"](
            "SELECT full_name, room FROM students WHERE id = %s", (seed["student_b"],)
        )
        assert row["full_name"] == "طالب باء"
        assert row["room"] == "201"

    def test_subject_isolation(self, client, auth, seed):
        assert client.get(
            f"/api/school/{seed['school_b']}/subjects", headers=auth("school_a")
        ).status_code == 403
        assert client.put(
            f"/api/subject/{seed['subject_b']}",
            headers=auth("school_a"),
            json={"name": "اختراق", "grade_level": "الخامس الابتدائي"},
        ).status_code == 403
        assert client.delete(
            f"/api/subject/{seed['subject_b']}", headers=auth("school_a")
        ).status_code == 403

        own = client.get(
            f"/api/school/{seed['school_a']}/subjects", headers=auth("school_a")
        )
        assert own.status_code == 200
        assert {subject["school_id"] for subject in own.get_json()["subjects"]} == {
            seed["school_a"]
        }

        created = client.post(
            f"/api/school/{seed['school_a']}/subject",
            headers=auth("school_a"),
            json={"name": "اللغة العربية", "grade_level": "الخامس الابتدائي"},
        )
        assert created.status_code == 201
        subject_id = created.get_json()["subject"]["id"]
        assert client.delete(
            f"/api/subject/{subject_id}", headers=auth("school_a")
        ).status_code == 200

    def test_teacher_isolation(self, client, auth, seed):
        assert client.get(
            f"/api/school/{seed['school_b']}/teachers", headers=auth("school_a")
        ).status_code == 403
        assert client.put(
            f"/api/teacher/{seed['teacher_b']}",
            headers=auth("school_a"),
            json={"full_name": "اختراق"},
        ).status_code == 403
        assert client.delete(
            f"/api/teacher/{seed['teacher_b']}", headers=auth("school_a")
        ).status_code == 403
        assert client.get(
            f"/api/teacher/{seed['teacher_b']}/subjects", headers=auth("school_a")
        ).status_code == 403

        own = client.get(
            f"/api/school/{seed['school_a']}/teachers", headers=auth("school_a")
        )
        assert own.status_code == 200
        assert "password_hash" not in own.get_data(as_text=True)
        teacher_codes = {teacher["teacher_code"] for teacher in own.get_json()["teachers"]}
        assert "TA001" in teacher_codes
        assert "TB001" not in teacher_codes

    def test_school_role_cannot_edit_another_school(self, client, auth, seed):
        response = client.put(
            f"/api/schools/{seed['school_b']}",
            headers=auth("school_a"),
            json={"name": "مدرسة مسروقة", "study_type": "عام",
                  "level": "ابتدائي", "gender_type": "mixed"},
        )
        assert response.status_code == 403

    def test_class_teachers_are_resolved_within_the_caller_school(self, client, auth, seed):
        response = client.get(
            "/api/class/الخامس الابتدائي/teachers", headers=auth("teacher_a")
        )
        assert response.status_code == 200
        teacher_codes = {item["teacher_code"] for item in response.get_json()["teachers"]}
        assert teacher_codes == {"TA001"}

        admin_view = client.get(
            f"/api/class/الخامس الابتدائي/teachers?school_id={seed['school_b']}",
            headers=auth("admin"),
        )
        assert admin_view.status_code == 200


class TestStudentTenantIsolation:
    def test_student_reads_own_history_only(self, client, auth, seed):
        assert client.get(
            f"/api/student/{seed['student_a']}/history", headers=auth("student_a")
        ).status_code == 200
        assert client.get(
            f"/api/student/{seed['student_b']}/history", headers=auth("student_a")
        ).status_code == 403

    def test_student_reads_own_grades_only(self, client, auth, seed):
        own = client.get(
            f"/api/student/{seed['student_a']}/grades/{seed['year_id']}",
            headers=auth("student_a"),
        )
        assert own.status_code == 200
        assert client.get(
            f"/api/student/{seed['student_b']}/grades/{seed['year_id']}",
            headers=auth("student_a"),
        ).status_code == 403

    def test_student_reads_own_attendance_only(self, client, auth, seed):
        assert client.get(
            f"/api/student/{seed['student_a']}/attendance/{seed['year_id']}",
            headers=auth("student_a"),
        ).status_code == 200
        assert client.get(
            f"/api/student/{seed['student_b']}/attendance/{seed['year_id']}",
            headers=auth("student_a"),
        ).status_code == 403

    def test_student_cannot_write_grades(self, client, auth, seed):
        assert client.put(
            f"/api/student/{seed['student_a']}/grades/{seed['year_id']}",
            headers=auth("student_a"),
            json={"grades": {"الرياضيات": {"month1": 10}}},
        ).status_code == 403

    def test_student_cannot_read_other_student_recommendations(self, client, auth, seed):
        assert client.get(
            f"/api/recommendations/student/{seed['student_b']}",
            headers=auth("student_a"),
        ).status_code == 403


class TestTeacherTenantIsolation:
    def test_teacher_cannot_read_another_teachers_students(self, client, auth, seed):
        assert client.get(
            f"/api/teacher/{seed['teacher_b']}/students", headers=auth("teacher_a")
        ).status_code == 403
        assert client.get(
            f"/api/teacher/{seed['teacher_a']}/students", headers=auth("teacher_a")
        ).status_code == 200

    def test_teacher_recommendations_are_scoped(self, client, auth, seed):
        own = client.get("/api/recommendations/teacher", headers=auth("teacher_a"))
        assert own.status_code == 200
        assert own.get_json()["teacher_id"] == seed["teacher_a"]

        cross = client.get(
            f"/api/recommendations/teacher?teacher_id={seed['teacher_b']}",
            headers=auth("teacher_a"),
        )
        assert cross.status_code == 403

    def test_class_insights_are_scoped(self, client, auth, seed):
        assert client.get(
            f"/api/analytics/class-insights/{seed['teacher_b']}", headers=auth("teacher_a")
        ).status_code == 403
        assert client.get(
            f"/api/analytics/class-insights/{seed['teacher_a']}", headers=auth("teacher_a")
        ).status_code == 200

    def test_teacher_cannot_grade_another_schools_student(self, client, auth, seed):
        response = client.post(
            "/api/teacher/grades",
            headers=auth("teacher_a"),
            json={
                "student_id": seed["student_b"],
                "subject_name": "الرياضيات",
                "academic_year_id": seed["year_id"],
                "grades": {"month1": 5},
            },
        )
        assert response.status_code == 403

    def test_teacher_cannot_grade_an_unauthorized_subject(self, client, auth, seed):
        response = client.post(
            "/api/teacher/grades",
            headers=auth("teacher_a"),
            json={
                "student_id": seed["student_a"],
                "subject_name": "العلوم",
                "academic_year_id": seed["year_id"],
                "grades": {"month1": 5},
            },
        )
        assert response.status_code == 403

    def test_teacher_grades_are_upserted_not_duplicated(self, client, auth, seed, db):
        headers = auth("teacher_a")
        payload = {
            "student_id": seed["student_a"],
            "subject_name": "الرياضيات",
            "academic_year_id": seed["year_id"],
            "grades": {"month1": 4, "month2": 5, "midterm": 6, "final": 7},
        }
        assert client.post("/api/teacher/grades", headers=headers, json=payload).status_code == 200
        payload["grades"]["month1"] = 9
        assert client.post("/api/teacher/grades", headers=headers, json=payload).status_code == 200

        rows = db["query"](
            "SELECT month1 FROM student_grades WHERE student_id = %s "
            "AND academic_year_id = %s AND subject_name = %s",
            (seed["student_a"], seed["year_id"], "الرياضيات"),
        )
        assert len(rows) == 1
        assert rows[0]["month1"] == 9

    def test_teacher_grades_reject_out_of_range_scores(self, client, auth, seed):
        response = client.post(
            "/api/teacher/grades",
            headers=auth("teacher_a"),
            json={
                "student_id": seed["student_a"],
                "subject_name": "الرياضيات",
                "academic_year_id": seed["year_id"],
                "grades": {"month1": 500},
            },
        )
        assert response.status_code == 400

    def test_teacher_cannot_record_attendance_for_another_school(self, client, auth, seed):
        response = client.post(
            "/api/teacher/attendance",
            headers=auth("teacher_a"),
            json={
                "student_id": seed["student_b"],
                "academic_year_id": seed["year_id"],
                "attendance_date": "2026-02-01",
                "status": "present",
            },
        )
        assert response.status_code == 403

    def test_teacher_attendance_is_upserted_not_duplicated(self, client, auth, seed, db):
        headers = auth("teacher_a")
        payload = {
            "student_id": seed["student_a"],
            "academic_year_id": seed["year_id"],
            "attendance_date": "2026-02-02",
            "status": "present",
        }
        assert client.post("/api/teacher/attendance", headers=headers, json=payload).status_code == 200
        payload["status"] = "absent"
        assert client.post("/api/teacher/attendance", headers=headers, json=payload).status_code == 200

        rows = db["query"](
            "SELECT status FROM student_attendance WHERE student_id = %s "
            "AND academic_year_id = %s AND attendance_date = %s",
            (seed["student_a"], seed["year_id"], "2026-02-02"),
        )
        assert len(rows) == 1
        assert rows[0]["status"] == "absent"


class TestBulkOperationsAndAuth:
    def test_academic_year_requires_authentication(self, client):
        assert client.get("/api/academic-year/current").status_code == 401

    def test_schools_listing_is_admin_only(self, client, auth):
        assert client.get("/api/schools").status_code == 401
        assert client.get("/api/schools", headers=auth("school_a")).status_code == 403
        assert client.get("/api/schools", headers=auth("admin")).status_code == 200

    def test_bulk_promotion_skips_students_of_other_schools(self, client, auth, seed, db):
        own_student = _disposable_student(db, seed["school_a"])
        foreign_student = _disposable_student(db, seed["school_b"])
        try:
            response = client.post(
                "/api/students/promote-many",
                headers=auth("school_a"),
                json={
                    "student_ids": [own_student, foreign_student],
                    "new_grade": "ابتدائي - السادس الابتدائي",
                },
            )
            assert response.status_code == 200
            body = response.get_json()
            assert body["promoted_count"] == 1
            assert body["failed_promotions"] == [
                {"id": foreign_student, "reason": "Forbidden"}
            ]

            foreign = db["query_one"](
                "SELECT grade FROM students WHERE id = %s", (foreign_student,)
            )
            assert foreign["grade"] == "ابتدائي - الخامس الابتدائي"
            own = db["query_one"]("SELECT grade FROM students WHERE id = %s", (own_student,))
            assert own["grade"] == "ابتدائي - السادس الابتدائي"
        finally:
            db["execute"]("DELETE FROM students WHERE id IN (%s, %s)", (own_student, foreign_student))

    def test_optimized_endpoints_are_scoped(self, client, auth, seed):
        assert client.get(
            f"/api/optimized/students?school_id={seed['school_b']}", headers=auth("school_a")
        ).status_code == 403
        assert client.get("/api/optimized/students", headers=auth("school_a")).status_code == 400

        own_students = client.get(
            f"/api/optimized/students?school_id={seed['school_a']}", headers=auth("school_a")
        )
        assert own_students.status_code == 200
        students_body = own_students.get_json()
        assert students_body["pagination"]["total_items"] >= 1
        assert any(item["code"] == "STUA001" for item in students_body["data"])

        own_teachers = client.get(
            f"/api/optimized/teachers?school_id={seed['school_a']}", headers=auth("school_a")
        )
        assert own_teachers.status_code == 200
        assert any(item["code"] == "TA001" for item in own_teachers.get_json()["data"])
        assert client.get(
            f"/api/optimized/teachers?school_id={seed['school_b']}", headers=auth("school_a")
        ).status_code == 403

    def test_optimized_schools_is_admin_only(self, client, auth):
        assert client.get("/api/optimized/schools", headers=auth("school_a")).status_code == 403
        assert client.get("/api/optimized/schools", headers=auth("admin")).status_code == 200
