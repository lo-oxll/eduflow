"""
Integration tests for the service layer (core/services.py) running against
the temporary SQLite database from conftest.
"""
import pytest

from core.services import (
    RecommendationService,
    SchoolService,
    StudentService,
    TeacherService,
)


@pytest.fixture
def school_service():
    return SchoolService()


@pytest.fixture
def student_service():
    return StudentService()


@pytest.fixture
def teacher_service():
    return TeacherService()


@pytest.fixture
def recommendation_service():
    return RecommendationService()


class TestSchoolService:
    def test_get_all_schools_maps_level_to_stage(self, school_service, seed):
        schools = school_service.get_all_schools()
        codes = {school["code"] for school in schools}
        assert {"SCHA01", "SCHB01"} <= codes
        seeded = next(school for school in schools if school["code"] == "SCHA01")
        assert seeded["stage"] == "ابتدائي"
        assert seeded["name"] == "مدرسة ألف"

    def test_get_school_by_code(self, school_service, seed):
        school = school_service.get_school_by_code("SCHB01")
        assert school["id"] == seed["school_b"]
        assert school_service.get_school_by_code("NOPE") is None

    def test_create_school_requires_fields(self, school_service):
        with pytest.raises(ValueError):
            school_service.create_school({"name": "ناقص"})


class TestStudentService:
    def test_get_students_by_school_uses_real_columns(self, student_service, seed):
        students = student_service.get_students_by_school(seed["school_a"])
        codes = {student["code"] for student in students}
        assert "STUA001" in codes
        seeded = next(student for student in students if student["code"] == "STUA001")
        assert seeded["name"] == "طالب ألف"
        assert seeded["grade_level"] == "ابتدائي - الخامس الابتدائي"
        assert seeded["classroom"] == "101"

    def test_get_students_by_school_is_tenant_scoped(self, student_service, seed):
        codes = {
            student["code"]
            for student in student_service.get_students_by_school(seed["school_b"])
        }
        assert codes == {"STUB001"}


class TestTeacherService:
    def test_get_teachers_by_school_uses_real_columns(self, teacher_service, seed):
        teachers = teacher_service.get_teachers_by_school(seed["school_a"])
        seeded = next(teacher for teacher in teachers if teacher["code"] == "TA001")
        assert seeded["name"] == "معلم ألف"
        assert seeded["grade_level"] == "الخامس الابتدائي"

        foreign = {
            teacher["code"]
            for teacher in teacher_service.get_teachers_by_school(seed["school_b"])
        }
        assert foreign == {"TB001"}


class TestRecommendationService:
    def test_missing_teacher_returns_error(self, recommendation_service):
        result = recommendation_service.get_teacher_recommendations(999999)
        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_teacher_recommendations_for_seeded_teacher(self, recommendation_service, seed):
        result = recommendation_service.get_teacher_recommendations(seed["teacher_a"])
        assert result["success"] is True
        assert result["teacher_id"] == seed["teacher_a"]
        assert "الرياضيات" in result["subjects_analysis"]
