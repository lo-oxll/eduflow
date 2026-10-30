"""
API Optimization Module for EduFlow
Provides field selection, query batching, and response optimization
"""
from typing import Dict, List, Optional, Any, Union
from flask import request, jsonify, Response
import json
import datetime
from functools import wraps


def _is_response(result) -> bool:
    """True for a Response or a (Response, status[, headers]) tuple."""
    if isinstance(result, Response):
        return True
    return (
        isinstance(result, tuple)
        and bool(result)
        and isinstance(result[0], Response)
    )


class FieldSelector:
    """Field selection for API responses"""
    
    @staticmethod
    def parse_fields(fields_param: str) -> List[str]:
        """
        Parse fields parameter from request
        
        Args:
            fields_param: Comma-separated field names or JSON array
            
        Returns:
            List of field names
        """
        if not fields_param:
            return []
        
        # Handle JSON array format
        if fields_param.startswith('[') and fields_param.endswith(']'):
            try:
                return json.loads(fields_param)
            except json.JSONDecodeError:
                pass
        
        # Handle comma-separated format
        return [field.strip() for field in fields_param.split(',') if field.strip()]
    
    @staticmethod
    def filter_fields(data: Union[Dict, List[Dict]], fields: List[str]) -> Union[Dict, List[Dict]]:
        """
        Filter data to include only specified fields
        
        Args:
            data: Data to filter (dict or list of dicts)
            fields: Fields to include
            
        Returns:
            Filtered data
        """
        if not fields:
            return data
        
        def filter_dict(item: Dict) -> Dict:
            return {key: value for key, value in item.items() if key in fields}
        
        if isinstance(data, list):
            return [filter_dict(item) for item in data]
        elif isinstance(data, dict):
            return filter_dict(data)
        else:
            return data

class QueryBatcher:
    """Query batching for database operations"""
    
    def __init__(self, max_batch_size: int = 100):
        self.max_batch_size = max_batch_size
        self.pending_queries = []
    
    def add_query(self, query_func, *args, **kwargs):
        """
        Add query to batch
        
        Args:
            query_func: Function to execute
            *args: Arguments for function
            **kwargs: Keyword arguments for function
        """
        self.pending_queries.append({
            'func': query_func,
            'args': args,
            'kwargs': kwargs
        })
    
    def execute_batch(self) -> List[Any]:
        """
        Execute all pending queries in batches
        
        Returns:
            List of results from all queries
        """
        results = []
        
        # Process in batches
        for i in range(0, len(self.pending_queries), self.max_batch_size):
            batch = self.pending_queries[i:i + self.max_batch_size]
            
            # Execute batch
            batch_results = []
            for query in batch:
                try:
                    result = query['func'](*query['args'], **query['kwargs'])
                    batch_results.append(result)
                except Exception as e:
                    batch_results.append({'error': str(e)})
            
            results.extend(batch_results)
        
        # Clear pending queries
        self.pending_queries.clear()
        
        return results

class ResponseOptimizer:
    """Response optimization utilities"""
    
    @staticmethod
    def paginate_data(data: List[Dict], page: int = 1, per_page: int = 50) -> Dict[str, Any]:
        """
        Paginate data for API responses
        
        Args:
            data: List of data items
            page: Page number (1-based)
            per_page: Items per page
            
        Returns:
            Paginated response dictionary
        """
        total_items = len(data)
        total_pages = (total_items + per_page - 1) // per_page
        
        # Handle invalid page numbers
        if page < 1:
            page = 1
        elif page > total_pages and total_pages > 0:
            page = total_pages
        
        # Calculate slice indices
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        
        # Get page data
        page_data = data[start_idx:end_idx]
        
        return {
            'data': page_data,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_items': total_items,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            }
        }
    
    @staticmethod
    def add_metadata(response_data: Dict, metadata: Dict) -> Dict:
        """
        Add metadata to response
        
        Args:
            response_data: Main response data
            metadata: Metadata to add
            
        Returns:
            Response with metadata
        """
        if isinstance(response_data, dict):
            response_data['_metadata'] = metadata
        return response_data
    
    @staticmethod
    def optimize_json_response(data: Any, indent: Optional[int] = None) -> str:
        """
        Optimize JSON response for size
        
        Args:
            data: Data to serialize
            indent: JSON indentation (None for compact)
            
        Returns:
            JSON string
        """
        return json.dumps(data, separators=(',', ':'), indent=indent, default=str)

class APIOptimizer:
    """Main API optimization class"""
    
    def __init__(self):
        self.field_selector = FieldSelector()
        self.query_batcher = QueryBatcher()
        self.response_optimizer = ResponseOptimizer()
    
    def field_selection(self, default_fields: List[str] = None):
        """
        Decorator for field selection in API endpoints
        
        Args:
            default_fields: Default fields to include if none specified
        """
        def decorator(f):
            @wraps(f)
            def wrapper(*args, **kwargs):
                # Get fields parameter from request
                fields_param = request.args.get('fields')
                fields = self.field_selector.parse_fields(fields_param)
                
                # Use default fields if none specified
                if not fields and default_fields:
                    fields = default_fields
                
                # Execute function
                result = f(*args, **kwargs)

                # Error responses from role/scope guards must pass through untouched
                if _is_response(result):
                    return result

                # Apply field filtering if requested
                if fields and isinstance(result, (dict, list)):
                    result = self.field_selector.filter_fields(result, fields)

                return jsonify(result)
            return wrapper
        return decorator
    
    def pagination(self, default_per_page: int = 50):
        """
        Decorator for pagination in API endpoints
        
        Args:
            default_per_page: Default items per page
        """
        def decorator(f):
            @wraps(f)
            def wrapper(*args, **kwargs):
                # Get pagination parameters
                page = max(1, int(request.args.get('page', 1)))
                per_page = min(1000, max(1, int(request.args.get('per_page', default_per_page))))
                
                # Execute function
                result = f(*args, **kwargs)

                if _is_response(result):
                    return result

                # Apply pagination if result is a list
                if isinstance(result, list):
                    result = self.response_optimizer.paginate_data(result, page, per_page)

                return jsonify(result)
            return wrapper
        return decorator
    
    def batch_queries(self, max_batch_size: int = 100):
        """
        Decorator for query batching
        
        Args:
            max_batch_size: Maximum queries per batch
        """
        def decorator(f):
            @wraps(f)
            def wrapper(*args, **kwargs):
                # Set up batcher for this request
                batcher = QueryBatcher(max_batch_size)
                
                # Execute function with batcher
                result = f(batcher, *args, **kwargs)
                
                # Execute any pending queries
                if batcher.pending_queries:
                    batch_results = batcher.execute_batch()
                    # You might want to merge these results with the main result
                    # depending on your specific use case
                
                return jsonify(result)
            return wrapper
        return decorator
    
    def optimize_response(self, include_metadata: bool = True):
        """
        Decorator for response optimization
        
        Args:
            include_metadata: Whether to include response metadata
        """
        def decorator(f):
            @wraps(f)
            def wrapper(*args, **kwargs):
                # Execute function
                result = f(*args, **kwargs)

                if _is_response(result):
                    return result

                # Add metadata if requested
                if include_metadata and isinstance(result, dict):
                    metadata = {
                        'timestamp': str(datetime.datetime.now(datetime.timezone.utc)),
                        'request_id': getattr(request, 'request_id', 'unknown')
                    }
                    result = self.response_optimizer.add_metadata(result, metadata)
                
                return jsonify(result)
            return wrapper
        return decorator

# Global API optimizer instance
_api_optimizer = None

def get_api_optimizer() -> APIOptimizer:
    """Get global API optimizer instance"""
    global _api_optimizer
    if _api_optimizer is None:
        _api_optimizer = APIOptimizer()
    return _api_optimizer

def setup_api_optimization() -> APIOptimizer:
    """Setup API optimization"""
    global _api_optimizer
    _api_optimizer = APIOptimizer()
    return _api_optimizer

# Convenience decorators
def field_selection(default_fields: List[str] = None):
    """Field selection decorator"""
    return get_api_optimizer().field_selection(default_fields)

def pagination(default_per_page: int = 50):
    """Pagination decorator"""
    return get_api_optimizer().pagination(default_per_page)

def batch_queries(max_batch_size: int = 100):
    """Query batching decorator"""
    return get_api_optimizer().batch_queries(max_batch_size)

def optimize_response(include_metadata: bool = True):
    """Response optimization decorator"""
    return get_api_optimizer().optimize_response(include_metadata)

# Export main classes and functions
__all__ = [
    'FieldSelector', 'QueryBatcher', 'ResponseOptimizer', 'APIOptimizer',
    'get_api_optimizer', 'setup_api_optimization', 'field_selection',
    'pagination', 'batch_queries', 'optimize_response'
]