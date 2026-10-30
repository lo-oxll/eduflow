"""
Performance Monitoring Middleware for EduFlow
Tracks request performance, database queries, and system metrics
"""
import time
import json
from functools import wraps
from flask import request, g, jsonify
from collections import defaultdict, deque
import psutil
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

class PerformanceMonitor:
    """Performance monitoring and metrics collection"""
    
    def __init__(self, app=None):
        self.app = app
        self.request_times = deque(maxlen=1000)  # Store last 1000 request times
        self.db_query_times = deque(maxlen=1000)  # Store last 1000 query times
        self.endpoint_stats = defaultdict(lambda: {
            'count': 0,
            'total_time': 0,
            'avg_time': 0,
            'min_time': float('inf'),
            'max_time': 0
        })
        self.active_requests = 0
        self.lock = threading.Lock()
        
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize with Flask app"""
        app.before_request(self.before_request)
        app.after_request(self.after_request)
        app.teardown_request(self.teardown_request)
    
    def before_request(self):
        """Track request start time"""
        g.start_time = time.time()
        g.request_id = f"{int(time.time() * 1000000)}-{id(threading.current_thread())}"
        
        with self.lock:
            self.active_requests += 1
    
    def after_request(self, response):
        """Calculate and log request metrics"""
        if hasattr(g, 'start_time'):
            duration = time.time() - g.start_time
            endpoint = request.endpoint or 'unknown'
            
            # Store request time
            self.request_times.append({
                'endpoint': endpoint,
                'method': request.method,
                'duration': duration,
                'timestamp': datetime.now(timezone.utc),
                'status_code': response.status_code
            })
            
            # Update endpoint statistics
            with self.lock:
                stats = self.endpoint_stats[endpoint]
                stats['count'] += 1
                stats['total_time'] += duration
                stats['avg_time'] = stats['total_time'] / stats['count']
                stats['min_time'] = min(stats['min_time'], duration)
                stats['max_time'] = max(stats['max_time'], duration)
                
                # Add performance headers
                response.headers['X-Response-Time'] = f"{duration*1000:.2f}ms"
                response.headers['X-Request-ID'] = g.request_id
        
        return response
    
    def teardown_request(self, exception):
        """Clean up after request"""
        with self.lock:
            self.active_requests = max(0, self.active_requests - 1)
    
    def record_db_query(self, query_time: float, query: str = None):
        """Record database query performance"""
        self.db_query_times.append({
            'query': query or 'unknown',
            'duration': query_time,
            'timestamp': datetime.now(timezone.utc)
        })
    
    def get_system_metrics(self) -> Dict:
        """Get current system performance metrics"""
        try:
            process = psutil.Process()
            return {
                'cpu_percent': process.cpu_percent(),
                'memory_mb': process.memory_info().rss / 1024 / 1024,
                'active_requests': self.active_requests,
                'thread_count': threading.active_count()
            }
        except:
            return {
                'cpu_percent': 0,
                'memory_mb': 0,
                'active_requests': self.active_requests,
                'thread_count': threading.active_count()
            }
    
    def get_performance_stats(self) -> Dict:
        """Get performance statistics"""
        recent_requests = list(self.request_times)[-100:]  # Last 100 requests
        
        if not recent_requests:
            return {
                'request_count': 0,
                'avg_response_time': 0,
                'error_rate': 0,
                'slow_endpoints': []
            }
        
        # Calculate statistics
        total_time = sum(r['duration'] for r in recent_requests)
        error_count = sum(1 for r in recent_requests if r['status_code'] >= 400)
        
        # Get slow endpoints (avg > 1 second)
        slow_endpoints = []
        for endpoint, stats in self.endpoint_stats.items():
            if stats['count'] > 10 and stats['avg_time'] > 1.0:
                slow_endpoints.append({
                    'endpoint': endpoint,
                    'avg_time': stats['avg_time'],
                    'count': stats['count']
                })
        
        slow_endpoints.sort(key=lambda x: x['avg_time'], reverse=True)
        
        return {
            'request_count': len(recent_requests),
            'avg_response_time': total_time / len(recent_requests),
            'error_rate': error_count / len(recent_requests),
            'slow_endpoints': slow_endpoints[:10],  # Top 10 slow endpoints
            'system_metrics': self.get_system_metrics()
        }
    
    def get_endpoint_details(self, endpoint: str) -> Dict:
        """Get detailed statistics for a specific endpoint"""
        stats = self.endpoint_stats.get(endpoint, {})
        if not stats['count']:
            return {'error': 'Endpoint not found or no data available'}
        
        recent_times = [
            r['duration'] for r in self.request_times 
            if r['endpoint'] == endpoint
        ][-50:]  # Last 50 requests for this endpoint
        
        error_count = sum(
            1 for r in self.request_times
            if r['endpoint'] == endpoint and r.get('status_code', 200) >= 400
        )

        return {
            'endpoint': endpoint,
            'total_requests': stats['count'],
            'average_time': stats['avg_time'],
            'min_time': stats['min_time'],
            'max_time': stats['max_time'],
            'recent_times': recent_times,
            'success_rate': max(0.0, 1 - (error_count / stats['count'])) if stats['count'] > 0 else 1
        }

class DatabasePerformanceTracker:
    """Track database query performance"""
    
    def __init__(self, performance_monitor: PerformanceMonitor):
        self.monitor = performance_monitor
    
    def __enter__(self):
        self.start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        self.monitor.record_db_query(duration, getattr(self, 'query', 'unknown'))
    
    def set_query(self, query: str):
        """Set the query being tracked"""
        self.query = query

# Global instances
_performance_monitor = None

def get_performance_monitor() -> PerformanceMonitor:
    """Get global performance monitor instance"""
    global _performance_monitor
    if _performance_monitor is None:
        _performance_monitor = PerformanceMonitor()
    return _performance_monitor

def setup_performance_monitoring(app) -> PerformanceMonitor:
    """Setup performance monitoring for Flask app"""
    global _performance_monitor
    _performance_monitor = PerformanceMonitor(app)
    return _performance_monitor

def track_db_performance():
    """Context manager for tracking database query performance"""
    return DatabasePerformanceTracker(get_performance_monitor())

def performance_stats():
    """Decorator to add performance tracking to routes"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Performance monitoring API endpoints
def register_performance_endpoints(app):
    """Register performance monitoring API endpoints"""
    
    @app.route('/api/performance/stats', methods=['GET'])
    def get_performance_statistics():
        """Get overall performance statistics"""
        monitor = get_performance_monitor()
        return jsonify(monitor.get_performance_stats())
    
    @app.route('/api/performance/endpoint/<endpoint>', methods=['GET'])
    def get_endpoint_performance(endpoint):
        """Get performance details for specific endpoint"""
        monitor = get_performance_monitor()
        return jsonify(monitor.get_endpoint_details(endpoint))
    
    @app.route('/api/performance/system', methods=['GET'])
    def get_system_performance():
        """Get system resource usage"""
        monitor = get_performance_monitor()
        return jsonify(monitor.get_system_metrics())

# Export main classes and functions
__all__ = [
    'PerformanceMonitor', 'DatabasePerformanceTracker', 'get_performance_monitor',
    'setup_performance_monitoring', 'track_db_performance', 'performance_stats',
    'register_performance_endpoints'
]