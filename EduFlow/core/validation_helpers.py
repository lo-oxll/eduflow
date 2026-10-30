#!/usr/bin/env python3
"""
Validation functions for teacher-subject assignment system
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from typing import List, Dict, Tuple, Any
from database_helpers import get_teacher_with_subjects, get_available_subjects_for_school

def validate_teacher_subject_assignment(teacher_id: int, subject_ids: List[int]) -> Dict[str, Any]:
    """
    Comprehensive validation for teacher-subject assignment
    
    Args:
        teacher_id (int): The teacher's ID
        subject_ids (List[int]): List of subject IDs to assign
        
    Returns:
        Dict: Validation result with success status and details
    """
    validation_result = {
        'success': True,
        'errors': [],
        'warnings': [],
        'valid_assignments': [],
        'invalid_assignments': []
    }
    
    try:
        # Validate teacher exists
        teacher = get_teacher_with_subjects(teacher_id)
        if not teacher:
            validation_result['success'] = False
            validation_result['errors'].append({
                'type': 'teacher_not_found',
                'message': 'Teacher not found',
                'message_ar': 'لم يتم العثور على المعلم'
            })
            return validation_result
            
        school_id = teacher['school_id']
        
        # Validate subject_ids format
        if not isinstance(subject_ids, list):
            validation_result['success'] = False
            validation_result['errors'].append({
                'type': 'invalid_format',
                'message': 'Subject IDs must be provided as a list',
                'message_ar': 'يجب تقديم معرفات المواد كقائمة'
            })
            return validation_result
            
        if not subject_ids:
            validation_result['success'] = False
            validation_result['errors'].append({
                'type': 'empty_list',
                'message': 'At least one subject must be selected',
                'message_ar': 'يجب اختيار مادة واحدة على الأقل'
            })
            return validation_result
            
        # Validate each subject ID
        valid_subject_ids = []
        for i, subject_id in enumerate(subject_ids):
            try:
                sid = int(subject_id)
                valid_subject_ids.append(sid)
            except (ValueError, TypeError):
                validation_result['invalid_assignments'].append({
                    'subject_id': subject_id,
                    'reason': 'Invalid subject ID format',
                    'reason_ar': 'تنسيق معرف المادة غير صحيح'
                })
                
        if not valid_subject_ids:
            validation_result['success'] = False
            validation_result['errors'].append({
                'type': 'no_valid_subjects',
                'message': 'No valid subject IDs provided',
                'message_ar': 'لم يتم تقديم معرفات مواد صالحة'
            })
            return validation_result
            
        # Check for duplicates
        if len(valid_subject_ids) != len(set(valid_subject_ids)):
            validation_result['warnings'].append({
                'type': 'duplicate_subjects',
                'message': 'Duplicate subject IDs detected and will be removed',
                'message_ar': 'تم اكتشاف معرفات مواد مكررة وستتم إزالتها'
            })
            valid_subject_ids = list(set(valid_subject_ids))
            
        # Validate subjects belong to the same school
        available_subjects = get_available_subjects_for_school(school_id)
        available_subject_ids = {subject['id'] for subject in available_subjects}
        
        for subject_id in valid_subject_ids:
            if subject_id not in available_subject_ids:
                validation_result['invalid_assignments'].append({
                    'subject_id': subject_id,
                    'reason': 'Subject does not belong to this school',
                    'reason_ar': 'المادة لا تنتمي إلى هذه المدرسة'
                })
            else:
                validation_result['valid_assignments'].append(subject_id)
                
        # Check if any assignments already exist
        existing_subject_ids = {subject['id'] for subject in teacher.get('subjects', [])}
        already_assigned = set(validation_result['valid_assignments']) & existing_subject_ids
        
        if already_assigned:
            validation_result['warnings'].append({
                'type': 'already_assigned',
                'message': f'{len(already_assigned)} subjects are already assigned to this teacher',
                'message_ar': f'{len(already_assigned)} مادة مخصصة بالفعل لهذا المعلم',
                'subject_ids': list(already_assigned)
            })
            
            # Remove already assigned subjects from valid assignments
            validation_result['valid_assignments'] = [
                sid for sid in validation_result['valid_assignments'] 
                if sid not in already_assigned
            ]
            
        # Final success check
        if not validation_result['valid_assignments'] and not validation_result['errors']:
            validation_result['success'] = False
            validation_result['errors'].append({
                'type': 'no_valid_assignments',
                'message': 'No valid subjects to assign',
                'message_ar': 'لا توجد مواد صالحة للتعيين'
            })
            
        return validation_result
        
    except Exception as e:
        return {
            'success': False,
            'errors': [{
                'type': 'validation_error',
                'message': f'Validation failed: {str(e)}',
                'message_ar': f'فشل التحقق: {str(e)}'
            }]
        }

def validate_subject_removal(teacher_id: int, subject_id: int) -> Dict[str, Any]:
    """
    Validate removal of a subject assignment from a teacher
    
    Args:
        teacher_id (int): The teacher's ID
        subject_id (int): The subject ID to remove
        
    Returns:
        Dict: Validation result with success status and details
    """
    try:
        # Validate teacher exists
        teacher = get_teacher_with_subjects(teacher_id)
        if not teacher:
            return {
                'success': False,
                'error': 'Teacher not found',
                'error_ar': 'لم يتم العثور على المعلم'
            }
            
        # Check if subject is assigned to teacher
        assigned_subject_ids = {subject['id'] for subject in teacher.get('subjects', [])}
        
        if subject_id not in assigned_subject_ids:
            return {
                'success': False,
                'error': 'Subject is not assigned to this teacher',
                'error_ar': 'المادة غير مخصصة لهذا المعلم'
            }
            
        return {
            'success': True,
            'message': 'Subject removal is valid',
            'message_ar': 'إزالة المادة صالحة'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'Validation failed: {str(e)}',
            'error_ar': f'فشل التحقق: {str(e)}'
        }

def validate_subject_data(subject_data: Dict) -> Dict[str, Any]:
    """
    Validate subject data for creation/update
    
    Args:
        subject_data (Dict): Subject data to validate
        
    Returns:
        Dict: Validation result with success status and details
    """
    required_fields = ['name', 'grade_level', 'school_id']
    validation_result = {
        'success': True,
        'errors': [],
        'warnings': []
    }
    
    # Check required fields
    for field in required_fields:
        if not subject_data.get(field):
            validation_result['success'] = False
            validation_result['errors'].append({
                'field': field,
                'type': 'missing_required_field',
                'message': f'{field} is required',
                'message_ar': f'{field} مطلوب'
            })
    
    # Validate field formats
    if subject_data.get('name'):
        name = str(subject_data['name']).strip()
        if len(name) < 2:
            validation_result['errors'].append({
                'field': 'name',
                'type': 'invalid_length',
                'message': 'Subject name must be at least 2 characters',
                'message_ar': 'يجب أن يكون اسم المادة على الأقل حرفين'
            })
        elif len(name) > 100:
            validation_result['errors'].append({
                'field': 'name',
                'type': 'invalid_length',
                'message': 'Subject name must be less than 100 characters',
                'message_ar': 'يجب أن يكون اسم المادة أقل من 100 حرف'
            })
    
    if subject_data.get('grade_level'):
        grade_level = str(subject_data['grade_level']).strip()
        if len(grade_level) < 1:
            validation_result['errors'].append({
                'field': 'grade_level',
                'type': 'invalid_length',
                'message': 'Grade level is required',
                'message_ar': 'المستوى الدراسي مطلوب'
            })
        elif len(grade_level) > 50:
            validation_result['errors'].append({
                'field': 'grade_level',
                'type': 'invalid_length',
                'message': 'Grade level must be less than 50 characters',
                'message_ar': 'يجب أن يكون المستوى الدراسي أقل من 50 حرف'
            })
    
    # Validate school_id
    try:
        school_id = int(subject_data.get('school_id', 0))
        if school_id <= 0:
            validation_result['errors'].append({
                'field': 'school_id',
                'type': 'invalid_value',
                'message': 'School ID must be a positive integer',
                'message_ar': 'يجب أن يكون معرف المدرسة عددًا صحيحًا موجبًا'
            })
    except (ValueError, TypeError):
        validation_result['errors'].append({
            'field': 'school_id',
            'type': 'invalid_format',
            'message': 'School ID must be a valid integer',
            'message_ar': 'يجب أن يكون معرف المدرسة عددًا صحيحًا صالحًا'
        })
    
    return validation_result

def get_assignment_summary(teacher_id: int) -> Dict[str, Any]:
    """
    Get a summary of teacher's subject assignments
    
    Args:
        teacher_id (int): The teacher's ID
        
    Returns:
        Dict: Assignment summary with counts and details
    """
    try:
        teacher = get_teacher_with_subjects(teacher_id)
        if not teacher:
            return {
                'success': False,
                'error': 'Teacher not found'
            }
            
        subjects = teacher.get('subjects', [])
        grade_levels = list({subject['grade_level'] for subject in subjects})
        
        return {
            'success': True,
            'teacher_id': teacher_id,
            'teacher_name': teacher.get('full_name', 'Unknown'),
            'total_subjects': len(subjects),
            'grade_levels': grade_levels,
            'subjects_by_grade': {
                grade: [subject for subject in subjects if subject['grade_level'] == grade]
                for grade in grade_levels
            },
            'subject_names': [subject['name'] for subject in subjects]
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'Failed to get assignment summary: {str(e)}'
        }

# Make functions available for import
__all__ = [
    'validate_teacher_subject_assignment',
    'validate_subject_removal',
    'validate_subject_data',
    'get_assignment_summary'
]