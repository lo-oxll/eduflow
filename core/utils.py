"""
Centralized utility functions for EduFlow system
Contains common validation, formatting, and helper functions
"""
import re
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from functools import wraps

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ValidationError(Exception):
    """Custom exception for validation errors"""
    def __init__(self, message: str, field: str = None, error_code: str = None):
        self.message = message
        self.field = field
        self.error_code = error_code
        super().__init__(self.message)

class EduFlowUtils:
    """Centralized utility class for EduFlow system"""
    
    # Valid blood types
    VALID_BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
    
    # Valid educational levels
    VALID_EDUCATIONAL_LEVELS = ['ابتدائي', 'متوسطة', 'ثانوية', 'إعدادية']
    
    # Grade level mappings
    STAGE_TO_LEVEL_MAPPING = {
        "ابتدائي": "ابتدائي",
        "متوسط": "متوسطة",
        "ثانوي": "ثانوية",
        "إعدادي": "إعدادية"
    }
    
    @staticmethod
    def validate_required_fields(data: Dict[str, Any], required_fields: List[str]) -> None:
        """
        Validate that all required fields are present and not empty
        
        Args:
            data: Dictionary containing the data to validate
            required_fields: List of required field names
            
        Raises:
            ValidationError: If any required field is missing or empty
        """
        missing_fields = []
        empty_fields = []
        
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
            elif data[field] is None or (isinstance(data[field], str) and not data[field].strip()):
                empty_fields.append(field)
        
        if missing_fields:
            raise ValidationError(
                f"Missing required fields: {', '.join(missing_fields)}",
                field=', '.join(missing_fields),
                error_code='MISSING_FIELDS'
            )
        
        if empty_fields:
            raise ValidationError(
                f"Empty required fields: {', '.join(empty_fields)}",
                field=', '.join(empty_fields),
                error_code='EMPTY_FIELDS'
            )
    
    @staticmethod
    def validate_blood_type(blood_type: str) -> bool:
        """
        Validate blood type against accepted values
        
        Args:
            blood_type: Blood type string to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        return blood_type in EduFlowUtils.VALID_BLOOD_TYPES
    
    @staticmethod
    def validate_educational_level(level: str) -> bool:
        """
        Validate educational level against accepted values
        
        Args:
            level: Educational level string to validate
            
        Returns:
            bool: True if valid, False otherwise
        """
        return level in EduFlowUtils.VALID_EDUCATIONAL_LEVELS
    
    @staticmethod
    def validate_grade_format(grade_string: str) -> bool:
        """
        Validate grade string format (e.g., "ابتدائي - الأول الابتدائي")
        
        Args:
            grade_string: Grade string to validate
            
        Returns:
            bool: True if valid format, False otherwise
        """
        if not grade_string:
            return False
        
        parts = grade_string.split(' - ')
        return len(parts) >= 2 and parts[0].strip() in EduFlowUtils.VALID_EDUCATIONAL_LEVELS
    
    @staticmethod
    def is_elementary_grades_1_to_4(grade_string: str) -> bool:
        """
        Check if a grade string represents elementary (ابتدائي) grades 1-4.
        These grades use a 10-point scale, while all others use 100-point scale.
        
        Args:
            grade_string: Full grade string like "ابتدائي - الأول الابتدائي"
            
        Returns:
            bool: True if grade is elementary 1-4, False otherwise
        """
        if not grade_string:
            return False
        
        grade_parts = grade_string.split(' - ')
        if len(grade_parts) < 2:
            return False
        
        educational_level = grade_parts[0].strip()
        grade_level = grade_parts[1].strip()
        
        # Check if this is an elementary (ابتدائي) school level
        is_elementary = ('ابتدائي' in educational_level or 
                        'ابتدائي' in grade_level or 
                        'الابتدائي' in grade_level)
        
        if not is_elementary:
            return False
        
        # Check if grade is first, second, third, or fourth
        grades_1_to_4 = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'اول', 'ثاني', 'ثالث', 'رابع', 'الاول']
        is_grades_1_to_4 = any(x in grade_level for x in grades_1_to_4)
        
        # Make sure it's NOT fifth or sixth grade (which should use 100-point scale)
        grades_5_or_6 = ['الخامس', 'السادس', 'خامس', 'سادس']
        is_grades_5_or_6 = any(x in grade_level for x in grades_5_or_6)
        
        return is_grades_1_to_4 and not is_grades_5_or_6
    
    @staticmethod
    def validate_score_range(score: Union[int, float], grade_string: str) -> bool:
        """
        Validate that a score is within the appropriate range for the given grade
        
        Args:
            score: Score value to validate
            grade_string: Grade string to determine score range
            
        Returns:
            bool: True if score is valid for the grade, False otherwise
        """
        try:
            score_value = float(score)
        except (ValueError, TypeError):
            return False
        
        # Use the helper function to check if this is elementary grades 1-4
        is_primary_1_to_4 = EduFlowUtils.is_elementary_grades_1_to_4(grade_string)
        
        if is_primary_1_to_4:
            return 0 <= score_value <= 10
        else:
            return 0 <= score_value <= 100
    
    @staticmethod
    def clean_detailed_scores(detailed_scores: Dict[str, Any]) -> Dict[str, Any]:
        """
        Clean detailed scores data by removing invalid entries
        
        Args:
            detailed_scores: Dictionary of subject scores
            
        Returns:
            Dict: Cleaned scores dictionary
        """
        if not isinstance(detailed_scores, dict):
            return {}
        
        cleaned_scores = {}
        for subject, scores in detailed_scores.items():
            # Skip invalid subject names
            if subject == '[object Object]' or not isinstance(subject, str) or not subject.strip():
                continue
            
            # Validate scores structure
            if isinstance(scores, dict):
                cleaned_scores[subject.strip()] = scores
        
        return cleaned_scores
    
    @staticmethod
    def generate_student_code() -> str:
        """
        Generate a unique student code
        
        Returns:
            str: Unique student code
        """
        import secrets
        import time
        timestamp = int(time.time() * 1000)
        random_part = secrets.token_hex(2).upper()
        return f"STD-{timestamp}-{random_part}"
    
    @staticmethod
    def generate_school_code() -> str:
        """
        Generate a unique school code
        
        Returns:
            str: Unique school code
        """
        import secrets
        import time
        import string
        timestamp = str(int(time.time() * 1000))[-6:]
        random_str = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(3))
        return f"SCH-{timestamp}-{random_str}"
    
    @staticmethod
    def sanitize_input(text: str) -> str:
        """
        Sanitize input text to prevent XSS and other security issues
        
        Args:
            text: Input text to sanitize
            
        Returns:
            str: Sanitized text
        """
        if not isinstance(text, str):
            return str(text) if text is not None else ""
        
        # Remove potentially dangerous characters
        # This is a basic implementation - in production, use a proper sanitization library
        dangerous_patterns = [
            r'<script[^>]*>.*?</script>',  # Script tags
            r'<[^>]+>',  # HTML tags
            r'javascript:',  # JavaScript protocol
            r'on\w+\s*=',  # Event handlers
        ]
        
        sanitized = text
        for pattern in dangerous_patterns:
            sanitized = re.sub(pattern, '', sanitized, flags=re.IGNORECASE | re.DOTALL)
        
        # Limit length to prevent abuse
        return sanitized[:1000]  # Limit to 1000 characters
    
    @staticmethod
    def format_response(success: bool, message: str = None, data: Any = None, error_code: str = None) -> Dict[str, Any]:
        """
        Format a standardized API response
        
        Args:
            success: Whether the operation was successful
            message: Optional message
            data: Optional data payload
            error_code: Optional error code for failures
            
        Returns:
            Dict: Formatted response dictionary
        """
        response = {'success': success}
        
        if message:
            response['message'] = message
            # Add Arabic translation for common messages
            arabic_messages = {
                'Student added successfully': 'تم إضافة الطالب بنجاح',
                'Student updated successfully': 'تم تحديث بيانات الطالب بنجاح',
                'Student deleted successfully': 'تم حذف الطالب بنجاح',
                'School added successfully': 'تم إضافة المدرسة بنجاح',
                'School updated successfully': 'تم تحديث المدرسة بنجاح',
                'School deleted successfully': 'تم حذف المدرسة بنجاح',
                'Subject added successfully': 'تم إضافة المادة بنجاح',
                'Subject updated successfully': 'تم تحديث المادة بنجاح',
                'Subject deleted successfully': 'تم حذف المادة بنجاح'
            }
            if message in arabic_messages:
                response['message_ar'] = arabic_messages[message]
        
        if data is not None:
            response['data'] = data
            
        if error_code and not success:
            response['error_code'] = error_code
            
        return response
    
    @staticmethod
    def log_error(error: Exception, context: str = None, user_id: str = None) -> None:
        """
        Log error with structured information
        
        Args:
            error: Exception object
            context: Context where error occurred
            user_id: User ID associated with the error
        """
        error_info = {
            'timestamp': datetime.now().isoformat(),
            'error_type': type(error).__name__,
            'error_message': str(error),
            'context': context or 'Unknown context'
        }
        
        if user_id:
            error_info['user_id'] = user_id
            
        logger.error(f"Error occurred: {json.dumps(error_info)}")
    
    @staticmethod
    def validate_json_data(json_string: str) -> Dict[str, Any]:
        """
        Safely parse and validate JSON data
        
        Args:
            json_string: JSON string to parse
            
        Returns:
            Dict: Parsed JSON data
            
        Raises:
            ValidationError: If JSON is invalid
        """
        try:
            if not json_string:
                return {}
            return json.loads(json_string)
        except json.JSONDecodeError as e:
            raise ValidationError(
                f"Invalid JSON data: {str(e)}",
                error_code='INVALID_JSON'
            )

# Decorator for input validation
def validate_input(required_fields: List[str] = None):
    """
    Decorator to validate input data for API endpoints
    
    Args:
        required_fields: List of required field names
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get request data (assuming Flask request context)
            try:
                from flask import request
                data = request.json or {}
            except:
                data = {}
            
            # Validate required fields
            if required_fields:
                try:
                    EduFlowUtils.validate_required_fields(data, required_fields)
                except ValidationError as e:
                    return EduFlowUtils.format_response(
                        success=False,
                        message=str(e),
                        error_code=e.error_code
                    ), 400
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Export commonly used functions
validate_required_fields = EduFlowUtils.validate_required_fields
validate_blood_type = EduFlowUtils.validate_blood_type
validate_educational_level = EduFlowUtils.validate_educational_level
validate_grade_format = EduFlowUtils.validate_grade_format
is_elementary_grades_1_to_4 = EduFlowUtils.is_elementary_grades_1_to_4
validate_score_range = EduFlowUtils.validate_score_range
clean_detailed_scores = EduFlowUtils.clean_detailed_scores
generate_student_code = EduFlowUtils.generate_student_code
generate_school_code = EduFlowUtils.generate_school_code
sanitize_input = EduFlowUtils.sanitize_input
format_response = EduFlowUtils.format_response
log_error = EduFlowUtils.log_error
validate_json_data = EduFlowUtils.validate_json_data