"""
Unit tests for the caching layer (core/cache.py).

Redis is unavailable in tests, so these cover the in-memory fallback path.
"""
import pytest

from cache import CacheManager, RedisCache


@pytest.fixture
def cache():
    return RedisCache(redis_url=None)


class TestInMemoryFallback:
    def test_redis_is_not_configured(self, cache):
        assert cache.redis_client is None

    def test_set_get_delete(self, cache):
        assert cache.set("greeting", {"text": "مرحبا"}, ttl=60) is True
        assert cache.get("greeting") == {"text": "مرحبا"}
        cache.delete("greeting")
        assert cache.get("greeting") is None

    def test_expired_entries_are_evicted(self, cache):
        cache.set("expired", "value", ttl=-1)
        assert cache.get("expired") is None
        assert "expired" not in cache.memory_cache

    def test_missing_key_returns_none(self, cache):
        assert cache.get("does-not-exist") is None

    def test_clear_pattern_removes_matching_keys(self, cache):
        cache.set("school:1:students", [1, 2])
        cache.set("school:2:students", [3])
        cache.set("student:1", {"id": 1})

        removed = cache.clear_pattern("*school:*")
        assert removed == 2
        assert cache.get("school:1:students") is None
        assert cache.get("student:1") == {"id": 1}


class TestCacheDecorator:
    def test_result_is_cached(self, cache):
        calls = []

        @cache.cache(ttl=60, key_prefix="tests")
        def expensive(value):
            calls.append(value)
            return value * 2

        assert expensive(3) == 6
        assert expensive(3) == 6
        assert calls == [3]

    def test_different_arguments_have_distinct_keys(self, cache):
        calls = []

        @cache.cache(ttl=60)
        def identity(value):
            calls.append(value)
            return value

        identity(1)
        identity(2)
        identity(1)
        assert calls == [1, 2]

    def test_clearing_prefix_invalidates_cached_function(self, cache):
        counter = {"value": 0}

        @cache.cache(ttl=60, key_prefix="school")
        def load_school():
            counter["value"] += 1
            return counter["value"]

        assert load_school() == 1
        assert load_school() == 1

        cache.clear_pattern("school:*")
        assert load_school() == 2

    def test_invalidate_pattern_decorator_clears_after_call(self, cache):
        cache.set("school:1", {"code": "SCHA01"})

        @cache.invalidate_pattern("school:*")
        def update_school():
            return "updated"

        assert update_school() == "updated"
        assert cache.get("school:1") is None


class TestCacheManager:
    def test_strategy_decorators_use_expected_prefixes(self):
        cache = RedisCache(redis_url=None)
        manager = CacheManager(cache)

        @manager.cache_school_data(ttl=60)
        def school_payload():
            return {"code": "SCHA01"}

        assert school_payload() == {"code": "SCHA01"}
        assert any(key.startswith("school") for key in cache.memory_cache)

        manager.invalidate_school_data()
        assert cache.memory_cache == {}

    def test_invalidate_student_data(self):
        cache = RedisCache(redis_url=None)
        manager = CacheManager(cache)
        cache.set("student:1:grades", {"month1": 10})
        manager.invalidate_student_data()
        assert cache.get("student:1:grades") is None
