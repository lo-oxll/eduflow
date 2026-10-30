"""
Unit tests for the shared helpers in core/utils.py.
"""
import json

import pytest

from utils import EduFlowUtils, ValidationError


class TestScoreValidation:
    def test_elementary_grades_1_to_4_use_ten_point_scale(self):
        assert EduFlowUtils.validate_score_range(10, "ابتدائي - الأول الابتدائي") is True
        assert EduFlowUtils.validate_score_range(11, "ابتدائي - الثاني الابتدائي") is False

    def test_higher_grades_use_hundred_point_scale(self):
        assert EduFlowUtils.validate_score_range(100, "ابتدائي - الخامس الابتدائي") is True
        assert EduFlowUtils.validate_score_range(101, "ثانوية - الثالث الثانوي") is False

    @pytest.mark.parametrize("score", ["abc", None, -1])
    def test_invalid_scores_are_rejected(self, score):
        assert EduFlowUtils.validate_score_range(score, "ابتدائي - الخامس الابتدائي") is False

    def test_is_elementary_grades_1_to_4(self):
        assert EduFlowUtils.is_elementary_grades_1_to_4("ابتدائي - الرابع الابتدائي") is True
        assert EduFlowUtils.is_elementary_grades_1_to_4("ابتدائي - السادس الابتدائي") is False
        assert EduFlowUtils.is_elementary_grades_1_to_4("ثانوية - الأول الثانوي") is False


class TestDataCleaning:
    def test_clean_detailed_scores_drops_invalid_subject_names(self):
        cleaned = EduFlowUtils.clean_detailed_scores({
            "الرياضيات": {"month1": 10},
            "[object Object]": {"month1": 5},
            "  ": {"month1": 3},
            "العلوم": "not-a-dict",
            42: {"month1": 1},
        })
        assert cleaned == {"الرياضيات": {"month1": 10}}

    def test_clean_detailed_scores_handles_non_dict_input(self):
        assert EduFlowUtils.clean_detailed_scores(None) == {}
        assert EduFlowUtils.clean_detailed_scores("[]") == {}


class TestCodeGeneration:
    def test_student_code_format(self):
        code = EduFlowUtils.generate_student_code()
        assert code.startswith("STD-")
        assert len(code.split("-")) == 3

    def test_school_code_format(self):
        code = EduFlowUtils.generate_school_code()
        assert code.startswith("SCH-")
        parts = code.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 6 and len(parts[2]) == 3

    def test_generated_codes_are_unique(self):
        assert len({EduFlowUtils.generate_student_code() for _ in range(50)}) == 50


class TestSanitizeInput:
    def test_removes_scripts_and_tags(self):
        assert EduFlowUtils.sanitize_input("<script>alert(1)</script>مرحبا") == "مرحبا"
        assert EduFlowUtils.sanitize_input("<b>نص</b>") == "نص"
        assert EduFlowUtils.sanitize_input("javascript:alert(1)") == "alert(1)"

    def test_limits_length(self):
        assert len(EduFlowUtils.sanitize_input("ا" * 5000)) == 1000

    def test_non_string_input(self):
        assert EduFlowUtils.sanitize_input(None) == ""
        assert EduFlowUtils.sanitize_input(42) == "42"


class TestResponses:
    def test_format_response_includes_arabic_translation(self):
        response = EduFlowUtils.format_response(True, "Student added successfully", {"id": 1})
        assert response == {
            "success": True,
            "message": "Student added successfully",
            "message_ar": "تم إضافة الطالب بنجاح",
            "data": {"id": 1},
        }

    def test_format_response_error_code(self):
        response = EduFlowUtils.format_response(False, error_code="INVALID_JSON")
        assert response == {"success": False, "error_code": "INVALID_JSON"}

    def test_validate_json_data(self):
        assert EduFlowUtils.validate_json_data('{"a": 1}') == {"a": 1}
        assert EduFlowUtils.validate_json_data("") == {}
        with pytest.raises(ValidationError):
            EduFlowUtils.validate_json_data("{not json}")

    def test_log_error_never_raises(self):
        EduFlowUtils.log_error(RuntimeError("boom"), context="tests", user_id="1")
