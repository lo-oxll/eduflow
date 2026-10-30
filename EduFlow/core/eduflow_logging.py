"""
Centralized error logging system for EduFlow
Provides structured logging with different severity levels and context information
"""
import logging
import json
import traceback
from datetime import datetime
from typing import Any, Dict, Optional, List
from functools import wraps
import os

class LogLevel:
    """Log level constants"""
    DEBUG = 'DEBUG'
    INFO = 'INFO'
    WARNING = 'WARNING'
    ERROR = 'ERROR'
    CRITICAL = 'CRITICAL'

class ErrorLogger:
    """Centralized error logging system"""
    
    def __init__(self, log_file: str = None, max_file_size: int = 10 * 1024 * 1024):  # 10MB
        """
        Initialize the error logger
        
        Args:
            log_file: Path to log file (optional)
            max_file_size: Maximum log file size in bytes before rotation
        """
        self.log_file = log_file
        self.max_file_size = max_file_size
        self.logger = self._setup_logger()
        
        # Error categories for better organization
        self.error_categories = {
            'AUTHENTICATION': 'Authentication and authorization errors',
            'DATABASE': 'Database connection and query errors',
            'VALIDATION': 'Input validation errors',
            'BUSINESS_LOGIC': 'Business logic violations',
            'SYSTEM': 'System and infrastructure errors',
            'SECURITY': 'Security-related issues',
            'PERFORMANCE': 'Performance and timeout issues',
            'EXTERNAL_API': 'External API integration errors'
        }
    
    def _setup_logger(self) -> logging.Logger:
        """Set up the logging configuration"""
        logger = logging.getLogger('EduFlow')
        logger.setLevel(logging.DEBUG)
        
        # Clear existing handlers
        logger.handlers.clear()
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(console_formatter)
        logger.addHandler(console_handler)
        
        # File handler (if log file specified)
        if self.log_file:
            # Create directory if it doesn't exist
            log_dir = os.path.dirname(self.log_file)
            if log_dir and not os.path.exists(log_dir):
                os.makedirs(log_dir)
            
            file_handler = logging.FileHandler(self.log_file, encoding='utf-8')
            file_handler.setLevel(logging.DEBUG)
            file_formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            file_handler.setFormatter(file_formatter)
            logger.addHandler(file_handler)
        
        return logger
    
    def _rotate_log_file(self):
        """Rotate log file if it exceeds maximum size"""
        if not self.log_file or not os.path.exists(self.log_file):
            return
        
        if os.path.getsize(self.log_file) > self.max_file_size:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_file = f"{self.log_file}.{timestamp}"
            os.rename(self.log_file, backup_file)
            self.logger.info(f"Log file rotated: {backup_file}")
    
    def _format_log_entry(self, level: str, message: str, context: Dict[str, Any] = None, 
                         error: Exception = None, category: str = None) -> Dict[str, Any]:
        """Format log entry with structured data"""
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'level': level,
            'message': message,
            'category': category or 'GENERAL'
        }
        
        if context:
            log_entry['context'] = context
        
        if error:
            log_entry['error'] = {
                'type': type(error).__name__,
                'message': str(error),
                'traceback': traceback.format_exc()
            }
        
        return log_entry
    
    def debug(self, message: str, context: Dict[str, Any] = None, category: str = None):
        """Log debug message"""
        log_entry = self._format_log_entry(LogLevel.DEBUG, message, context, category=category)
        self.logger.debug(json.dumps(log_entry, ensure_ascii=False))
    
    def info(self, message: str, context: Dict[str, Any] = None, category: str = None):
        """Log info message"""
        log_entry = self._format_log_entry(LogLevel.INFO, message, context, category=category)
        self.logger.info(json.dumps(log_entry, ensure_ascii=False))
    
    def warning(self, message: str, context: Dict[str, Any] = None, error: Exception = None, 
                category: str = None):
        """Log warning message"""
        log_entry = self._format_log_entry(LogLevel.WARNING, message, context, error, category)
        self.logger.warning(json.dumps(log_entry, ensure_ascii=False))
    
    def error(self, message: str, context: Dict[str, Any] = None, error: Exception = None, 
              category: str = None):
        """Log error message"""
        log_entry = self._format_log_entry(LogLevel.ERROR, message, context, error, category)
        self.logger.error(json.dumps(log_entry, ensure_ascii=False))
        self._rotate_log_file()
    
    def critical(self, message: str, context: Dict[str, Any] = None, error: Exception = None, 
                 category: str = None):
        """Log critical message"""
        log_entry = self._format_log_entry(LogLevel.CRITICAL, message, context, error, category)
        self.logger.critical(json.dumps(log_entry, ensure_ascii=False))
        self._rotate_log_file()
    
    def log_exception(self, error: Exception, context: Dict[str, Any] = None, 
                     category: str = 'SYSTEM'):
        """
        Log exception with full traceback
        
        Args:
            error: Exception object
            context: Additional context information
            category: Error category
        """
        self.error(
            f"Exception occurred: {type(error).__name__}",
            context=context,
            error=error,
            category=category
        )
    
    def log_business_rule_violation(self, rule_name: str, details: str, 
                                  context: Dict[str, Any] = None):
        """
        Log business rule violation
        
        Args:
            rule_name: Name of the violated rule
            details: Details about the violation
            context: Additional context
        """
        violation_context = {
            'rule_name': rule_name,
            'violation_details': details
        }
        
        if context:
            violation_context.update(context)
        
        self.warning(
            f"Business rule violation: {rule_name}",
            context=violation_context,
            category='BUSINESS_LOGIC'
        )
    
    def log_security_event(self, event_type: str, details: str, 
                          user_id: str = None, ip_address: str = None):
        """
        Log security-related events
        
        Args:
            event_type: Type of security event
            details: Event details
            user_id: User ID associated with the event
            ip_address: IP address of the request
        """
        security_context = {
            'event_type': event_type,
            'details': details
        }
        
        if user_id:
            security_context['user_id'] = user_id
        if ip_address:
            security_context['ip_address'] = ip_address
        
        self.warning(
            f"Security event: {event_type}",
            context=security_context,
            category='SECURITY'
        )
    
    def log_performance_issue(self, operation: str, duration: float, 
                             threshold: float = None, context: Dict[str, Any] = None):
        """
        Log performance issues
        
        Args:
            operation: Operation name
            duration: Operation duration in seconds
            threshold: Performance threshold that was exceeded
            context: Additional context
        """
        perf_context = {
            'operation': operation,
            'duration_seconds': duration
        }
        
        if threshold:
            perf_context['threshold_seconds'] = threshold
            message = f"Performance issue: {operation} took {duration:.2f}s (threshold: {threshold}s)"
        else:
            message = f"Slow operation: {operation} took {duration:.2f}s"
        
        if context:
            perf_context.update(context)
        
        self.warning(
            message,
            context=perf_context,
            category='PERFORMANCE'
        )
    
    def get_error_statistics(self, hours: int = 24) -> Dict[str, Any]:
        """
        Get error statistics for the specified time period
        
        Args:
            hours: Number of hours to analyze
            
        Returns:
            Dict containing error statistics
        """
        # This would require parsing log files - simplified implementation
        stats = {
            'time_period_hours': hours,
            'total_errors': 0,
            'errors_by_category': {},
            'errors_by_level': {}
        }
        
        # In a real implementation, this would parse the log file
        # and extract statistics for the specified time period
        
        return stats

# Global logger instance
_default_logger = None

def get_logger(log_file: str = None) -> ErrorLogger:
    """
    Get the global logger instance
    
    Args:
        log_file: Path to log file (optional)
        
    Returns:
        ErrorLogger instance
    """
    global _default_logger
    if _default_logger is None:
        _default_logger = ErrorLogger(log_file)
    return _default_logger

def setup_logging(log_file: str = None, max_file_size: int = 10 * 1024 * 1024) -> ErrorLogger:
    """
    Setup global logging configuration
    
    Args:
        log_file: Path to log file
        max_file_size: Maximum log file size in bytes
        
    Returns:
        Configured ErrorLogger instance
    """
    global _default_logger
    _default_logger = ErrorLogger(log_file, max_file_size)
    return _default_logger

# Decorator for automatic error logging
def log_errors(category: str = 'SYSTEM', log_args: bool = False, log_result: bool = False):
    """
    Decorator to automatically log errors in function execution
    
    Args:
        category: Error category for logging
        log_args: Whether to log function arguments
        log_result: Whether to log function result (for successful execution)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            logger = get_logger()
            
            # Log function entry
            if log_args:
                context = {
                    'function': func.__name__,
                    'args': str(args)[:200],  # Limit length
                    'kwargs': str(kwargs)[:200]
                }
                logger.debug(f"Function {func.__name__} called", context=context)
            
            try:
                result = func(*args, **kwargs)
                
                # Log successful result
                if log_result:
                    context = {
                        'function': func.__name__,
                        'result': str(result)[:200] if result else 'None'
                    }
                    logger.debug(f"Function {func.__name__} completed successfully", context=context)
                
                return result
                
            except Exception as e:
                # Log the exception
                context = {
                    'function': func.__name__
                }
                if log_args:
                    context.update({
                        'args': str(args)[:200],
                        'kwargs': str(kwargs)[:200]
                    })
                
                logger.log_exception(e, context=context, category=category)
                raise
        
        return wrapper
    return decorator

# Context manager for logging operation duration
class LogOperation:
    """
    Context manager for logging operation duration and performance
    """
    
    def __init__(self, operation_name: str, threshold: float = 1.0, category: str = 'PERFORMANCE'):
        """
        Initialize operation logger
        
        Args:
            operation_name: Name of the operation
            threshold: Performance threshold in seconds
            category: Log category
        """
        self.operation_name = operation_name
        self.threshold = threshold
        self.category = category
        self.start_time = None
        self.logger = get_logger()
    
    def __enter__(self):
        self.start_time = datetime.now()
        self.logger.debug(f"Starting operation: {self.operation_name}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = (datetime.now() - self.start_time).total_seconds()
        
        context = {
            'operation': self.operation_name,
            'duration_seconds': duration
        }
        
        if exc_type is not None:
            # Operation failed
            self.logger.error(
                f"Operation failed: {self.operation_name}",
                context=context,
                error=exc_val,
                category=self.category
            )
        else:
            # Operation completed
            if duration > self.threshold:
                self.logger.log_performance_issue(
                    self.operation_name, duration, self.threshold, context
                )
            else:
                self.logger.debug(
                    f"Operation completed: {self.operation_name} ({duration:.3f}s)",
                    context=context
                )

# Export main functions
__all__ = [
    'ErrorLogger', 'LogLevel', 'get_logger', 'setup_logging', 'log_errors', 
    'LogOperation', 'LogOperation'
]