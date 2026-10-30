"""
Data validation tests.

Covers the reusable validation framework in core/validation.py, the shared
EduFlowUtils helpers, and the 400 responses returned by write endpoints.
"""
import pytest

from validation import (
    CustomRule,
    DateRule,
    EmailRule,
    EnumRule,
    IntegerRule,
    NumberRule,
    PhoneRule,
    RequiredRule,
    StringRule,
    Validator,
    create_student_validator,
)
from utils import EduFlowUtils, ValidationError


class TestFieldRules:
    def test_required_rule(self):
        rule = RequiredRule("full_name")
        assert rule.validate("أحمد") is True
        for empty in (None, "", []):
            assert rule.validate(empty) is False
        assert "required" in rule.get_error_message()

    def test_string_rule_length_bounds(self):
        rule = StringRule("full_name", min_length=2, max_length=5)
        assert rule.validate("abc") is True
        assert rule.validate("a") is False
        assert "at least 2" in rule.get_error_message()
        assert rule.validate("abcdef") is False
        assert "at most 5" in rule.get_error_message()
        assert rule.validate(123) is False

    def test_email_rule(self):
        rule = EmailRule("email")
        assert rule.validate("user@example.com") is True
        assert rule.validate("user.name+tag@school.edu.iq") is True
        for invalid in ("invalid", "no@domain", "@missing.com", "", None):
            assert rule.validate(invalid) is False

    def test_phone_rule_accepts_common_formats(self):
        rule = PhoneRule("phone")
        assert rule.validate("+9647701234567") is True
        assert rule.validate("+964 770 123 4567") is True
        assert rule.validate("+964-770-123-4567") is True
        assert rule.validate("abc") is False
        assert rule.validate(7701234567) is False

    def test_number_and_integer_rules(self):
        number = NumberRule("score", min_value=0, max_value=100)
        assert number.validate("87.5") is True
        assert number.validate(101) is False
        assert number.validate("abc") is False

        integer = IntegerRule("month", min_value=0, max_value=10)
        assert integer.validate(10) is True
        assert integer.validate(3.5) is False
        assert "whole number" in integer.get_error_message()

    def test_date_rule(self):
        rule = DateRule("enrollment_date")
        assert rule.validate("2025-09-01") is True
        assert rule.validate("01/09/2025") is False
        assert rule.validate(None) is False

    def test_enum_rule(self):
        rule = EnumRule("blood_type", EduFlowUtils.VALID_BLOOD_TYPES)
        assert rule.validate("A+") is True
        assert rule.validate("C+") is False

    def test_custom_rule_delegates_to_callable(self):
        rule = CustomRule("grade", EduFlowUtils.validate_grade_format, "Invalid grade format")
        assert rule.validate("ابتدائي - الخامس الابتدائي") is True
        assert rule.validate("الخامس") is False


class TestEduFlowUtils:
    @pytest.mark.parametrize("blood_type", ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"])
    def test_valid_blood_types(self, blood_type):
        assert EduFlowUtils.validate_blood_type(blood_type) is True

    @pytest.mark.parametrize("blood_type", ["", "C+", "AB", None])
    def test_invalid_blood_types(self, blood_type):
        assert EduFlowUtils.validate_blood_type(blood_type) is False

    def test_grade_format(self):
        assert EduFlowUtils.validate_grade_format("ابتدائي - الخامس الابتدائي") is True
        assert EduFlowUtils.validate_grade_format("ثانوية - الثالث الثانوي") is True
        assert EduFlowUtils.validate_grade_format("الخامس الابتدائي") is False
        assert EduFlowUtils.validate_grade_format("جامعة - الأول") is False
        assert EduFlowUtils.validate_grade_format("") is False

    def test_educational_level(self):
        assert EduFlowUtils.validate_educational_level("ابتدائي") is True
        assert EduFlowUtils.validate_educational_level("جامعة") is False

    def test_required_fields_raise_validation_error(self):
        with pytest.raises(ValidationError) as missing:
            EduFlowUtils.validate_required_fields({"full_name": "أحمد"}, ["full_name", "room"])
        assert "room" in str(missing.value)

        with pytest.raises(ValidationError) as empty:
            EduFlowUtils.validate_required_fields({"full_name": "   "}, ["full_name"])
        assert "full_name" in str(empty.value)


class TestStudentValidator:
    def _valid_student(self):
        return {
            "full_name": "أحمد محمد علي",
            "grade": "ابتدائي - الخامس الابتدائي",
            "room": "101",
            "blood_type": "A+",
            "parent_contact": "+9647701234567",
        }

    def test_valid_student_passes(self):
        result = create_student_validator().validate(self._valid_student())
        assert result.is_valid is True
        assert result.errors == {}

    @pytest.mark.parametrize("field,value", [
        ("full_name", ""),
        ("full_name", "أ"),
        ("grade", "الخامس"),
        ("room", None),
        ("blood_type", "Z+"),
    ])
    def test_invalid_student_fields_are_reported(self, field, value):
        data = self._valid_student()
        data[field] = value
        result = create_student_validator().validate(data)
        assert result.is_valid is False
        assert field in result.errors

    def test_validate_and_format_failure_shape(self):
        data = self._valid_student()
        data["full_name"] = ""
        formatted = create_student_validator().validate_and_format(data)
        assert formatted["success"] is False
        assert formatted["message"] == "Validation failed"
        assert "full_name" in formatted["errors"]

    def test_validate_and_format_success_shape(self):
        formatted = create_student_validator().validate_and_format(self._valid_student())
        assert formatted == {"success": True, "data": self._valid_student()}

    def test_global_rules_are_evaluated(self):
        validator = (
            Validator()
            .add_rule("full_name", RequiredRule("full_name"))
            .add_global_rule(CustomRule("_global", lambda data: data.get("room") is not None,
                                        "room is required"))
        )
        result = validator.validate({"full_name": "أحمد"})
        assert result.is_valid is False
        assert "_global" in result.errors


class TestApiValidation:
    def _payload(self, **overrides):
        payload = {
            "full_name": "طالب تحقق",
            "grade": "ابتدائي - الخامس الابتدائي",
            "room": "110",
        }
        payload.update(overrides)
        return payload

    def test_missing_required_fields(self, client, auth, seed):
        response = client.post(
            f"/api/school/{seed['school_a']}/student",
            headers=auth("school_a"),
            json={"full_name": "بدون صف"},
        )
        assert response.status_code == 400
        assert "required" in response.get_json()["error"].lower()

    def test_invalid_grade_format(self, client, auth, seed):
        response = client.post(
            f"/api/school/{seed['school_a']}/student",
            headers=auth("school_a"),
            json=self._payload(grade="الخامس الابتدائي"),
        )
        assert response.status_code == 400
        assert response.get_json()["error"] == "Invalid grade format"

    def test_invalid_educational_level(self, client, auth, seed):
        response = client.post(
            f"/api/school/{seed['school_a']}/student",
            headers=auth("school_a"),
            json=self._payload(grade="جامعة - الأول"),
        )
        assert response.status_code == 400
        assert response.get_json()["error"] == "Invalid educational level"

    def test_invalid_blood_type(self, client, auth, seed):
        response = client.post(
            f"/api/school/{seed['school_a']}/student",
            headers=auth("school_a"),
            json=self._payload(blood_type="C+"),
        )
        assert response.status_code == 400
        assert response.get_json()["error"] == "Invalid blood type"

    def test_duplicate_student_is_rejected(self, client, auth, seed):
        payload = self._payload(full_name="طالب مكرر", room="111")
        first = client.post(
            f"/api/school/{seed['school_a']}/student", headers=auth("school_a"), json=payload
        )
        assert first.status_code == 201
        duplicate = client.post(
            f"/api/school/{seed['school_a']}/student", headers=auth("school_a"), json=payload
        )
        assert duplicate.status_code == 400
