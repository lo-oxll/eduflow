"""
Comprehensive input validation framework for EduFlow system
Provides robust validation for all data inputs with detailed error reporting
"""
from typing import Any, Dict, List, Optional, Union, Callable
from datetime import datetime
import re
from utils import ValidationError, EduFlowUtils

class ValidationRule:
    """Base validation rule class"""
    
    def __init__(self, field_name: str, error_message: str = None):
        self.field_name = field_name
        self.error_message = error_message or f"Invalid {field_name}"
    
    def validate(self, value: Any) -> bool:
        """Validate the value - to be implemented by subclasses"""
        raise NotImplementedError
    
    def get_error_message(self) -> str:
        """Get the error message for this validation rule"""
        return self.error_message

class RequiredRule(ValidationRule):
    """Validation rule for required fields"""
    
    def __init__(self, field_name: str, error_message: str = None):
        super().__init__(field_name, error_message or f"{field_name} is required")
    
    def validate(self, value: Any) -> bool:
        return value is not None and value != "" and value != []

class StringRule(ValidationRule):
    """Validation rule for string fields"""
    
    def __init__(self, field_name: str, min_length: int = 0, max_length: int = None, 
                 error_message: str = None):
        super().__init__(field_name, error_message)
        self.min_length = min_length
        self.max_length = max_length
    
    def validate(self, value: Any) -> bool:
        if not isinstance(value, str):
            return False
        
        if len(value) < self.min_length:
            self.error_message = f"{self.field_name} must be at least {self.min_length} characters"
            return False
        
        if self.max_length and len(value) > self.max_length:
            self.error_message = f"{self.field_name} must be at most {self.max_length} characters"
            return False
        
        return True

class EmailRule(ValidationRule):
    """Validation rule for email format"""
    
    def __init__(self, field_name: str, error_message: str = None):
        super().__init__(field_name, error_message or f"{field_name} must be a valid email address")
        self.email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    
    def validate(self, value: Any) -> bool:
        if not isinstance(value, str):
            return False
        return bool(self.email_pattern.match(value))

class PhoneRule(ValidationRule):
    """Validation rule for phone numbers"""
    
    def __init__(self, field_name: str, error_message: str = None):
        super().__init__(field_name, error_message or f"{field_name} must be a valid phone number")
        # Simple phone pattern - can be enhanced based on requirements
        self.phone_pattern = re.compile(r'^[\+]?[1-9][\d]{0,15}$')
    
    def validate(self, value: Any) -> bool:
        if not isinstance(value, str):
            return False
        # Remove spaces and hyphens for validation
        clean_value = re.sub(r'[\s\-()]', '', value)
        return bool(self.phone_pattern.match(clean_value))

class NumberRule(ValidationRule):
    """Validation rule for numeric fields"""
    
    def __init__(self, field_name: str, min_value: Union[int, float] = None, 
                 max_value: Union[int, float] = None, error_message: str = None):
        super().__init__(field_name, error_message)
        self.min_value = min_value
        self.max_value = max_value
    
    def validate(self, value: Any) -> bool:
        try:
            num_value = float(value)
        except (ValueError, TypeError):
            self.error_message = f"{self.field_name} must be a number"
            return False
        
        if self.min_value is not None and num_value < self.min_value:
            self.error_message = f"{self.field_name} must be at least {self.min_value}"
            return False
        
        if self.max_value is not None and num_value > self.max_value:
            self.error_message = f"{self.field_name} must be at most {self.max_value}"
            return False
        
        return True

class IntegerRule(NumberRule):
    """Validation rule for integer fields"""
    
    def __init__(self, field_name: str, min_value: int = None, max_value: int = None, 
                 error_message: str = None):
        super().__init__(field_name, min_value, max_value, error_message)
    
    def validate(self, value: Any) -> bool:
        # First check if it's a number
        if not super().validate(value):
            return False
        
        # Then check if it's an integer
        try:
            int_value = int(value)
            if int_value != float(value):
                self.error_message = f"{self.field_name} must be a whole number"
                return False
        except (ValueError, TypeError):
            self.error_message = f"{self.field_name} must be a whole number"
            return False
        
        return True

class DateRule(ValidationRule):
    """Validation rule for date fields"""
    
    def __init__(self, field_name: str, date_format: str = "%Y-%m-%d", 
                 error_message: str = None):
        super().__init__(field_name, error_message or f"{field_name} must be a valid date")
        self.date_format = date_format
    
    def validate(self, value: Any) -> bool:
        if not isinstance(value, str):
            return False
        
        try:
            datetime.strptime(value, self.date_format)
            return True
        except ValueError:
            return False

class EnumRule(ValidationRule):
    """Validation rule for enumerated values"""
    
    def __init__(self, field_name: str, valid_values: List[str], 
                 error_message: str = None):
        super().__init__(field_name, error_message or f"{field_name} must be one of: {', '.join(valid_values)}")
        self.valid_values = valid_values
    
    def validate(self, value: Any) -> bool:
        return value in self.valid_values

class CustomRule(ValidationRule):
    """Validation rule for custom validation logic"""
    
    def __init__(self, field_name: str, validation_function: Callable[[Any], bool], 
                 error_message: str):
        super().__init__(field_name, error_message)
        self.validation_function = validation_function
    
    def validate(self, value: Any) -> bool:
        return self.validation_function(value)

class ValidationResult:
    """Result of validation process"""
    
    def __init__(self):
        self.is_valid = True
        self.errors = {}
        self.warnings = {}
    
    def add_error(self, field: str, message: str):
        """Add a validation error"""
        self.is_valid = False
        if field not in self.errors:
            self.errors[field] = []
        self.errors[field].append(message)
    
    def add_warning(self, field: str, message: str):
        """Add a validation warning"""
        if field not in self.warnings:
            self.warnings[field] = []
        self.warnings[field].append(message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert validation result to dictionary"""
        return {
            'is_valid': self.is_valid,
            'errors': self.errors,
            'warnings': self.warnings
        }

class Validator:
    """Main validator class that manages validation rules"""
    
    def __init__(self):
        self.rules = {}
        self.global_rules = []
    
    def add_rule(self, field_name: str, rule: ValidationRule):
        """Add a validation rule for a specific field"""
        if field_name not in self.rules:
            self.rules[field_name] = []
        self.rules[field_name].append(rule)
        return self
    
    def add_global_rule(self, rule: ValidationRule):
        """Add a global validation rule that applies to the entire data set"""
        self.global_rules.append(rule)
        return self
    
    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        """Validate data against all rules"""
        result = ValidationResult()
        
        # Validate individual field rules
        for field_name, rules in self.rules.items():
            value = data.get(field_name)
            
            for rule in rules:
                if not rule.validate(value):
                    result.add_error(field_name, rule.get_error_message())
        
        # Validate global rules
        for rule in self.global_rules:
            if not rule.validate(data):
                result.add_error('_global', rule.get_error_message())
        
        return result
    
    def validate_and_format(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate data and return formatted response
        
        Returns:
            Dict with 'success' and either 'data' or 'errors' keys
        """
        result = self.validate(data)
        
        if result.is_valid:
            return {
                'success': True,
                'data': data
            }
        else:
            return {
                'success': False,
                'errors': result.errors,
                'message': 'Validation failed',
                'message_ar': 'فشل التحقق من صحة البيانات'
            }

# Predefined validators for common EduFlow entities

def create_student_validator() -> Validator:
    """Create validator for student data"""
    validator = Validator()
    
    return (validator
            .add_rule('full_name', RequiredRule('full_name', 'Student name is required'))
            .add_rule('full_name', StringRule('full_name', min_length=2, max_length=255))
            .add_rule('grade', RequiredRule('grade', 'Grade is required'))
            .add_rule('grade', CustomRule('grade', EduFlowUtils.validate_grade_format, 
                                        'Invalid grade format'))
            .add_rule('room', RequiredRule('room', 'Room is required'))
            .add_rule('room', StringRule('room', max_length=100))
            .add_rule('blood_type', CustomRule('blood_type', EduFlowUtils.validate_blood_type, 
                                             'Invalid blood type'))
            .add_rule('parent_contact', StringRule('parent_contact', max_length=255)))

def create_school_validator() -> Validator:
    """Create validator for school data"""
    validator = Validator()
    
    return (validator
            .add_rule('name', RequiredRule('name', 'School name is required'))
            .add_rule('name', StringRule('name', min_length=2, max_length=255))
            .add_rule('study_type', RequiredRule('study_type', 'Study type is required'))
            .add_rule('study_type', EnumRule('study_type', ['صباحي', 'مسائي']))
            .add_rule('level', RequiredRule('level', 'Educational level is required'))
            .add_rule('level', CustomRule('level', EduFlowUtils.validate_educational_level,
                                        'Invalid educational level'))
            .add_rule('gender_type', RequiredRule('gender_type', 'Gender type is required'))
            .add_rule('gender_type', EnumRule('gender_type', ['بنين', 'بنات', 'مختلطة'])))

def create_subject_validator() -> Validator:
    """Create validator for subject data"""
    validator = Validator()
    
    return (validator
            .add_rule('name', RequiredRule('name', 'Subject name is required'))
            .add_rule('name', StringRule('name', min_length=1, max_length=255))
            .add_rule('grade_level', RequiredRule('grade_level', 'Grade level is required'))
            .add_rule('grade_level', StringRule('grade_level', max_length=50)))

def create_grade_validator(grade_field: str = 'grade') -> Validator:
    """Create validator for grade/score data"""
    validator = Validator()
    
    return (validator
            .add_rule('subject_name', RequiredRule('subject_name', 'Subject name is required'))
            .add_rule('subject_name', StringRule('subject_name', max_length=255))
            .add_rule('month1', IntegerRule('month1', min_value=0, max_value=100))
            .add_rule('month2', IntegerRule('month2', min_value=0, max_value=100))
            .add_rule('midterm', IntegerRule('midterm', min_value=0, max_value=100))
            .add_rule('month3', IntegerRule('month3', min_value=0, max_value=100))
            .add_rule('month4', IntegerRule('month4', min_value=0, max_value=100))
            .add_rule('final', IntegerRule('final', min_value=0, max_value=100)))

def create_user_validator() -> Validator:
    """Create validator for user data"""
    validator = Validator()
    
    return (validator
            .add_rule('username', RequiredRule('username', 'Username is required'))
            .add_rule('username', StringRule('username', min_length=3, max_length=50))
            .add_rule('password', RequiredRule('password', 'Password is required'))
            .add_rule('password', StringRule('password', min_length=6, max_length=128))
            .add_rule('role', RequiredRule('role', 'Role is required'))
            .add_rule('role', EnumRule('role', ['admin', 'school', 'teacher', 'student'])))

# Validation middleware for Flask routes
def validate_request(validator: Validator):
    """
    Flask route decorator for request validation
    
    Usage:
        @app.route('/api/students', methods=['POST'])
        @validate_request(create_student_validator())
        def create_student():
            # Request data is already validated
            pass
    """
    def decorator(f):
        from functools import wraps
        from flask import request, jsonify
        
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get request data
            if request.is_json:
                data = request.get_json()
            else:
                data = request.form.to_dict()
            
            # Validate data
            result = validator.validate_and_format(data)
            
            if not result['success']:
                return jsonify(result), 400
            
            # Add validated data to request context
            request.validated_data = result['data']
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Export commonly used functions and classes
__all__ = [
    'ValidationRule', 'RequiredRule', 'StringRule', 'EmailRule', 'PhoneRule',
    'NumberRule', 'IntegerRule', 'DateRule', 'EnumRule', 'CustomRule',
    'ValidationResult', 'Validator', 'create_student_validator',
    'create_school_validator', 'create_subject_validator', 'create_grade_validator',
    'create_user_validator', 'validate_request'
]