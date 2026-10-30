"""
Redis Caching Layer for EduFlow
Provides caching for database queries, API responses, and session data
"""
import redis
import json
import hashlib
import time
from typing import Any, Optional, Dict, List, Union
from functools import wraps
import os
from datetime import datetime, timedelta

class RedisCache:
    """Redis caching implementation with fallback to in-memory cache"""
    
    def __init__(self, redis_url: str = None, fallback_to_memory: bool = True):
        """
        Initialize Redis cache
        
        Args:
            redis_url: Redis connection URL (redis://localhost:6379)
            fallback_to_memory: Whether to use in-memory cache as fallback
        """
        self.redis_client = None
        self.memory_cache = {}
        self.fallback_to_memory = fallback_to_memory
        
        # Try to connect to Redis
        if redis_url or os.getenv('REDIS_URL'):
            try:
                redis_url = redis_url or os.getenv('REDIS_URL')
                self.redis_client = redis.from_url(
                    redis_url, 
                    decode_responses=True,
                    socket_connect_timeout=5,
                    socket_timeout=5
                )
                # Test connection
                self.redis_client.ping()
                print("[OK] Redis cache connected successfully")
            except Exception as e:
                print(f"[WARN] Redis connection failed: {e}")
                if fallback_to_memory:
                    print("[OK] Falling back to in-memory cache")
                self.redis_client = None
        elif fallback_to_memory:
            print("[WARN] Redis not configured, using in-memory cache")
    
    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key from function arguments"""
        # Create hash of arguments for consistent key generation
        key_data = {
            'prefix': prefix,
            'args': args,
            'kwargs': {k: v for k, v in kwargs.items() if k != 'self'}
        }
        key_string = json.dumps(key_data, sort_keys=True, default=str)
        return f"{prefix}:{hashlib.md5(key_string.encode(), usedforsecurity=False).hexdigest()}"
    
    def _get_from_redis(self, key: str) -> Optional[Any]:
        """Get value from Redis"""
        if not self.redis_client:
            return None
        try:
            value = self.redis_client.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            print(f"Redis get error: {e}")
        return None
    
    def _set_in_redis(self, key: str, value: Any, ttl: int = 3600) -> bool:
        """Set value in Redis with TTL"""
        if not self.redis_client:
            return False
        try:
            serialized_value = json.dumps(value, default=str)
            return self.redis_client.setex(key, ttl, serialized_value)
        except Exception as e:
            print(f"Redis set error: {e}")
            return False
    
    def _get_from_memory(self, key: str) -> Optional[Any]:
        """Get value from memory cache"""
        if key in self.memory_cache:
            item = self.memory_cache[key]
            if item['expires_at'] > time.time():
                return item['value']
            else:
                # Remove expired item
                del self.memory_cache[key]
        return None
    
    def _set_in_memory(self, key: str, value: Any, ttl: int = 3600) -> None:
        """Set value in memory cache"""
        self.memory_cache[key] = {
            'value': value,
            'expires_at': time.time() + ttl
        }
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        # Try Redis first
        if self.redis_client:
            value = self._get_from_redis(key)
            if value is not None:
                return value
        
        # Try memory cache
        if self.fallback_to_memory:
            return self._get_from_memory(key)
        
        return None
    
    def set(self, key: str, value: Any, ttl: int = 3600) -> bool:
        """Set value in cache"""
        success = True
        
        # Set in Redis
        if self.redis_client:
            success = self._set_in_redis(key, value, ttl)
        
        # Set in memory cache
        if self.fallback_to_memory:
            self._set_in_memory(key, value, ttl)
        
        return success
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        success = True
        
        # Delete from Redis
        if self.redis_client:
            try:
                success = self.redis_client.delete(key) > 0
            except Exception as e:
                print(f"Redis delete error: {e}")
                success = False
        
        # Delete from memory
        if self.fallback_to_memory and key in self.memory_cache:
            del self.memory_cache[key]
        
        return success
    
    def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern"""
        deleted_count = 0
        
        # Clear from Redis
        if self.redis_client:
            try:
                keys = self.redis_client.keys(pattern)
                if keys:
                    deleted_count = self.redis_client.delete(*keys)
            except Exception as e:
                print(f"Redis pattern delete error: {e}")
        
        # Clear from memory
        if self.fallback_to_memory:
            keys_to_delete = [k for k in self.memory_cache.keys() if pattern.replace('*', '') in k]
            for key in keys_to_delete:
                del self.memory_cache[key]
                deleted_count += 1
        
        return deleted_count
    
    def cache(self, ttl: int = 3600, key_prefix: str = None):
        """
        Decorator for caching function results
        
        Args:
            ttl: Time to live in seconds
            key_prefix: Custom prefix for cache keys
        """
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # Generate cache key
                prefix = key_prefix or f"{func.__module__}.{func.__name__}"
                cache_key = self._generate_key(prefix, *args, **kwargs)
                
                # Try to get from cache
                cached_result = self.get(cache_key)
                if cached_result is not None:
                    return cached_result
                
                # Execute function and cache result
                try:
                    result = func(*args, **kwargs)
                    self.set(cache_key, result, ttl)
                    return result
                except Exception as e:
                    print(f"Function execution error: {e}")
                    raise
            
            return wrapper
        return decorator
    
    def invalidate_pattern(self, pattern: str):
        """Decorator to invalidate cache patterns after function execution"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                result = func(*args, **kwargs)
                self.clear_pattern(pattern)
                return result
            return wrapper
        return decorator
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        stats = {
            'redis_connected': self.redis_client is not None,
            'memory_cache_size': len(self.memory_cache) if self.fallback_to_memory else 0,
            'memory_cache_memory': sum(len(str(item['value'])) for item in self.memory_cache.values()) if self.fallback_to_memory else 0
        }
        
        if self.redis_client:
            try:
                info = self.redis_client.info()
                stats.update({
                    'redis_version': info.get('redis_version'),
                    'redis_memory_used': info.get('used_memory_human'),
                    'redis_keys': info.get('db0', {}).get('keys', 0) if 'db0' in info else 0
                })
            except Exception as e:
                stats['redis_error'] = str(e)
        
        return stats

class CacheManager:
    """High-level cache manager with predefined cache strategies"""
    
    def __init__(self, redis_cache: RedisCache):
        self.cache = redis_cache
    
    def cache_school_data(self, ttl: int = 1800):
        """Cache decorator for school-related data (30 minutes)"""
        return self.cache.cache(ttl=ttl, key_prefix='school')
    
    def cache_student_data(self, ttl: int = 900):
        """Cache decorator for student data (15 minutes)"""
        return self.cache.cache(ttl=ttl, key_prefix='student')
    
    def cache_teacher_data(self, ttl: int = 900):
        """Cache decorator for teacher data (15 minutes)"""
        return self.cache.cache(ttl=ttl, key_prefix='teacher')
    
    def cache_academic_year_data(self, ttl: int = 3600):
        """Cache decorator for academic year data (1 hour)"""
        return self.cache.cache(ttl=ttl, key_prefix='academic_year')
    
    def cache_grades_data(self, ttl: int = 600):
        """Cache decorator for grades data (10 minutes)"""
        return self.cache.cache(ttl=ttl, key_prefix='grades')
    
    def cache_attendance_data(self, ttl: int = 600):
        """Cache decorator for attendance data (10 minutes)"""
        return self.cache.cache(ttl=ttl, key_prefix='attendance')
    
    def invalidate_school_data(self):
        """Invalidate all school-related cache"""
        return self.cache.clear_pattern('school:*')
    
    def invalidate_student_data(self):
        """Invalidate all student-related cache"""
        return self.cache.clear_pattern('student:*')
    
    def invalidate_teacher_data(self):
        """Invalidate all teacher-related cache"""
        return self.cache.clear_pattern('teacher:*')

# Global cache instances
_redis_cache = None
_cache_manager = None

def get_redis_cache() -> RedisCache:
    """Get global Redis cache instance"""
    global _redis_cache
    if _redis_cache is None:
        _redis_cache = RedisCache()
    return _redis_cache

def get_cache_manager() -> CacheManager:
    """Get global cache manager instance"""
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager(get_redis_cache())
    return _cache_manager

def setup_cache(redis_url: str = None) -> CacheManager:
    """Setup cache system"""
    global _redis_cache, _cache_manager
    _redis_cache = RedisCache(redis_url)
    _cache_manager = CacheManager(_redis_cache)
    return _cache_manager

# Export main classes and functions
__all__ = [
    'RedisCache', 'CacheManager', 'get_redis_cache', 'get_cache_manager',
    'setup_cache'
]