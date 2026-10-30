"""
Unit tests for core/security.py: sanitisation, rate limiting, lockout.
"""
import time

import pytest

from security import AccountLockoutManager, InputSanitizer, RateLimiter


class TestInputSanitizer:
    def test_control_characters_are_stripped(self):
        assert InputSanitizer.sanitize_string("abc\x00\x01def\nnew") == "abcdef\nnew"

    def test_plain_text_is_preserved(self):
        # Stored plain text must not be HTML-escaped: names and Arabic text
        # were corrupted when escaping happened at write time.
        assert InputSanitizer.sanitize_string("O'Brien & Sons <3 مرحبا") == "O'Brien & Sons <3 مرحبا"

    def test_allow_html_strips_dangerous_markup(self):
        cleaned = InputSanitizer.sanitize_string(
            "<p>مرحبا</p><script>alert(1)</script><strong>ok</strong>", allow_html=True
        )
        assert "<p>" in cleaned
        assert "<strong>" in cleaned
        assert "<script>" not in cleaned
        assert "alert(1)" in cleaned  # bleach strip=True removes tags, keeps text

    def test_non_string_values(self):
        assert InputSanitizer.sanitize_string(None) == ""
        assert InputSanitizer.sanitize_string(123) == "123"

    def test_sanitize_dict_preserves_sensitive_fields(self):
        password = "<pass&word>123"
        payload = InputSanitizer.sanitize_dict({
            "username": "ali\x00ce",
            "password": password,
            "current_password": password,
            "notes": "<script>x</script>نص",
        }, allow_html_fields=["notes"])

        assert payload["username"] == "alice"
        assert payload["password"] == password
        assert payload["current_password"] == password
        assert "<script>" not in payload["notes"]
        assert "نص" in payload["notes"]

    def test_sanitize_dict_recurses(self):
        payload = InputSanitizer.sanitize_dict({"nested": {"name": "a\x07b"}})
        assert payload == {"nested": {"name": "ab"}}


class TestRateLimiterMemoryStore:
    def test_requests_are_limited_within_a_window(self):
        limiter = RateLimiter(redis_url=None)
        limiter.limits = {"default": {"limit": 3, "window": 60}}

        assert [limiter.is_allowed("client", "default") for _ in range(3)] == [True, True, True]
        assert limiter.is_allowed("client", "default") is False
        assert limiter.is_allowed("other-client", "default") is True

    def test_window_expiry_frees_capacity(self):
        limiter = RateLimiter(redis_url=None)
        limiter.limits = {"default": {"limit": 1, "window": 1}}
        assert limiter.is_allowed("client", "default") is True
        assert limiter.is_allowed("client", "default") is False

        limiter.requests["client"][0] = time.time() - 5
        assert limiter.is_allowed("client", "default") is True

    def test_limits_are_exposed_for_headers(self):
        limiter = RateLimiter(redis_url=None)
        limiter.limits["api"] = {"limit": 2, "window": 60}
        limiter.is_allowed("client", "api")
        status = limiter.get_limits_for_client("client")["api"]
        assert status["limit"] == 2
        assert status["remaining"] == 1


class TestAccountLockout:
    @pytest.fixture
    def lockout(self):
        return AccountLockoutManager()

    def test_account_locks_after_threshold(self, lockout):
        lockout.lockout_threshold = 3
        for _ in range(2):
            lockout.record_failed_attempt("admin", "127.0.0.1")
        assert lockout.is_locked_out("admin")[0] is False

        lockout.record_failed_attempt("admin", "127.0.0.1")
        locked, remaining = lockout.is_locked_out("admin")
        assert locked is True
        assert remaining > 0

    def test_lockout_is_shared_across_ips(self, lockout):
        lockout.lockout_threshold = 1
        lockout.record_failed_attempt("admin", "10.0.0.1")
        locked, _ = lockout.is_locked_out("admin", "10.0.0.2")
        assert locked is True

    def test_reset_clears_failures_and_lockout(self, lockout):
        lockout.lockout_threshold = 1
        lockout.record_failed_attempt("admin", "127.0.0.1")
        assert lockout.is_locked_out("admin")[0] is True

        lockout.reset_failed_attempts("admin")
        assert lockout.is_locked_out("admin")[0] is False
        assert not lockout.failed_attempts

    def test_expired_lockout_is_released(self, lockout):
        lockout.lockout_threshold = 1
        lockout.record_failed_attempt("admin", "127.0.0.1")
        lockout.lockouts["admin"]["locked_until"] = time.time() - 1
        assert lockout.is_locked_out("admin")[0] is False
        assert "admin" not in lockout.lockouts

    def test_lockout_status_payload(self, lockout):
        lockout.lockout_threshold = 1
        lockout.record_failed_attempt("admin", "127.0.0.1")
        status = lockout.get_lockout_status("admin")
        assert status["is_locked"] is True
        assert status["failed_attempts"] >= 1
