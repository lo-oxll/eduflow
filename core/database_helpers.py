#!/usr/bin/env python3
"""
Database helper functions for teacher-subject assignment system
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import get_postgresql_pool, get_teacher_subjects
from typing import List, Dict, Optional, Union

def get_teacher_subject_assignments(teacher_id: int) -> List[Dict]:
    """
    Get all subjects assigned to a specific teacher
    
    Args:
        teacher_id (int): The teacher's ID
        
    Returns:
        List[Dict]: List of subject assignments with details
    """
    try:
        pool = get_postgresql_pool()
        if not pool:
            return []
            
        conn = pool.getconn()
        try:
            cursor = conn.cursor(dictionary=True)
            query = '''
                SELECT s.id, s.name, s.grade_level, s.created_at,
                       ts.teacher_id, ts.created_at as assigned_at
                FROM teacher_subjects ts
                JOIN subjects s ON ts.subject_id = s.id
                WHERE ts.teacher_id = %s
                ORDER BY s.grade_level, s.name
            '''
            cursor.execute(query, (teacher_id,))
            return cursor.fetchall()
        finally:
            pool.putconn(conn)
    except Exception as e:
        print(f"Error getting teacher subjects: {e}")
        return []

def get_available_subjects_for_school(school_id: int, grade_level: Optional[str] = None) -> List[Dict]:
    """
    Get all available subjects for a school, optionally filtered by grade level
    
    Args:
        school_id (int): The school's ID
        grade_level (str, optional): Filter by specific grade level
        
    Returns:
        List[Dict]: List of available subjects
    """
    try:
        pool = get_postgresql_pool()
        if not pool:
            return []
            
        conn = pool.getconn()
        try:
            cursor = conn.cursor(dictionary=True)
            
            query = '''
                SELECT id, name, grade_level, created_at
                FROM subjects 
                WHERE school_id = %s
            '''
            params = [school_id]
            
            if grade_level:
                query += ' AND grade_level = %s'
                params.append(grade_level)
                
            query += ' ORDER BY grade_level, name'
            
            cursor.execute(query, tuple(params))
            return cursor.fetchall()
        finally:
            pool.putconn(conn)
    except Exception as e:
        print(f"Error getting available subjects: {e}")
        return []

def assign_subjects_to_teacher(teacher_id: int, subject_ids: List[int]) -> Dict:
    """
    Assign multiple subjects to a teacher
    
    Args:
        teacher_id (int): The teacher's ID
        subject_ids (List[int]): List of subject IDs to assign
        
    Returns:
        Dict: Result with success status and details
    """
    try:
        # Validate inputs
        if not subject_ids:
            return {'success': False, 'error': 'No subjects provided for assignment'}
            
        if not isinstance(subject_ids, list):
            return {'success': False, 'error': 'Subject IDs must be provided as a list'}
            
        # Validate that all subject IDs are integers
        try:
            subject_ids = [int(sid) for sid in subject_ids]
        except (ValueError, TypeError):
            return {'success': False, 'error': 'All subject IDs must be valid integers'}
            
        pool = get_postgresql_pool()
        if not pool:
            return {'success': False, 'error': 'Database connection failed'}
            
        conn = pool.getconn()
        try:
            cursor = conn.cursor()
            
            # First, get teacher's school_id to validate subjects belong to same school
            cursor.execute('SELECT school_id FROM teachers WHERE id = %s', (teacher_id,))
            teacher = cursor.fetchone()
            
            if not teacher:
                return {'success': False, 'error': 'Teacher not found'}
                
            school_id = teacher[0]
            
            # Validate that all subjects belong to the teacher's school
            placeholders = ','.join(['%s'] * len(subject_ids))
            cursor.execute(f'''
                SELECT id FROM subjects 
                WHERE id IN ({placeholders}) AND school_id = %s
            ''', tuple(subject_ids + [school_id]))
            
            valid_subjects = [row[0] for row in cursor.fetchall()]
            
            if len(valid_subjects) != len(subject_ids):
                invalid_count = len(subject_ids) - len(valid_subjects)
                return {
                    'success': False, 
                    'error': f'{invalid_count} subjects do not belong to this school'
                }
            
            # Remove existing assignments for this teacher
            cursor.execute('DELETE FROM teacher_subjects WHERE teacher_id = %s', (teacher_id,))
            
            # Add new assignments
            for subject_id in subject_ids:
                cursor.execute('''
                    INSERT INTO teacher_subjects (teacher_id, subject_id) 
                    VALUES (%s, %s)
                ''', (teacher_id, subject_id))
                
            conn.commit()
            
            return {
                'success': True,
                'message': f'Successfully assigned {len(subject_ids)} subjects to teacher',
                'assigned_count': len(subject_ids)
            }
            
        finally:
            pool.putconn(conn)
            
    except Exception as e:
        print(f"Error assigning subjects to teacher: {e}")
        return {'success': False, 'error': f'Database error: {str(e)}'}

def remove_subject_from_teacher(teacher_id: int, subject_id: int) -> Dict:
    """
    Remove a specific subject assignment from a teacher
    
    Args:
        teacher_id (int): The teacher's ID
        subject_id (int): The subject ID to remove
        
    Returns:
        Dict: Result with success status and details
    """
    try:
        pool = get_postgresql_pool()
        if not pool:
            return {'success': False, 'error': 'Database connection failed'}
            
        conn = pool.getconn()
        try:
            cursor = conn.cursor()
            
            # Check if the assignment exists
            cursor.execute('''
                SELECT 1 FROM teacher_subjects 
                WHERE teacher_id = %s AND subject_id = %s
            ''', (teacher_id, subject_id))
            
            if not cursor.fetchone():
                return {'success': False, 'error': 'Subject assignment not found'}
            
            # Remove the assignment
            cursor.execute('''
                DELETE FROM teacher_subjects 
                WHERE teacher_id = %s AND subject_id = %s
            ''', (teacher_id, subject_id))
            
            conn.commit()
            
            return {
                'success': True,
                'message': 'Subject assignment removed successfully'
            }
            
        finally:
            pool.putconn(conn)
            
    except Exception as e:
        print(f"Error removing subject from teacher: {e}")
        return {'success': False, 'error': f'Database error: {str(e)}'}

def get_teachers_by_subject(subject_id: int) -> List[Dict]:
    """
    Get all teachers assigned to a specific subject
    
    Args:
        subject_id (int): The subject ID
        
    Returns:
        List[Dict]: List of teachers assigned to the subject
    """
    try:
        pool = get_postgresql_pool()
        if not pool:
            return []
            
        conn = pool.getconn()
        try:
            cursor = conn.cursor(dictionary=True)
            query = '''
                SELECT t.id, t.full_name, t.teacher_code, t.grade_level, t.email, t.phone,
                       ts.created_at as assigned_at
                FROM teacher_subjects ts
                JOIN teachers t ON ts.teacher_id = t.id
                WHERE ts.subject_id = %s
                ORDER BY t.full_name
            '''
            cursor.execute(query, (subject_id,))
            return cursor.fetchall()
        finally:
            pool.putconn(conn)
    except Exception as e:
        print(f"Error getting teachers by subject: {e}")
        return []

def validate_subject_assignment(teacher_id: int, subject_id: int) -> Dict:
    """
    Validate if a subject can be assigned to a teacher
    
    Args:
        teacher_id (int): The teacher's ID
        subject_id (int): The subject ID to validate
        
    Returns:
        Dict: Validation result with success status and any errors
    """
    try:
        pool = get_postgresql_pool()
        if not pool:
            return {'success': False, 'error': 'Database connection failed'}
            
        conn = pool.getconn()
        try:
            cursor = conn.cursor()
            
            # Check if teacher exists
            cursor.execute('SELECT school_id FROM teachers WHERE id = %s', (teacher_id,))
            teacher = cursor.fetchone()
            if not teacher:
                return {'success': False, 'error': 'Teacher not found'}
                
            school_id = teacher[0]
            
            # Check if subject exists and belongs to the same school
            cursor.execute('''
                SELECT id FROM subjects 
                WHERE id = %s AND school_id = %s
            ''', (subject_id, school_id))
            
            if not cursor.fetchone():
                return {
                    'success': False, 
                    'error': 'Subject not found or does not belong to this school'
                }
            
            # Check if assignment already exists
            cursor.execute('''
                SELECT 1 FROM teacher_subjects 
                WHERE teacher_id = %s AND subject_id = %s
            ''', (teacher_id, subject_id))
            
            if cursor.fetchone():
                return {'success': False, 'error': 'Subject already assigned to this teacher'}
                
            return {'success': True, 'message': 'Assignment is valid'}
            
        finally:
            pool.putconn(conn)
            
    except Exception as e:
        print(f"Error validating subject assignment: {e}")
        return {'success': False, 'error': f'Database error: {str(e)}'}

def get_teacher_with_subjects(teacher_id: int) -> Optional[Dict]:
    """
    Get teacher details along with their assigned subjects
    
    Args:
        teacher_id (int): The teacher's ID
        
    Returns:
        Optional[Dict]: Teacher details with subjects, or None if not found
    """
    try:
        pool = get_postgresql_pool()
        if not pool:
            return None
            
        conn = pool.getconn()
        try:
            cursor = conn.cursor(dictionary=True)
            
            # Get teacher details
            cursor.execute('''
                SELECT t.*, s.name as school_name
                FROM teachers t
                JOIN schools s ON t.school_id = s.id
                WHERE t.id = %s
            ''', (teacher_id,))
            
            teacher = cursor.fetchone()
            if not teacher:
                return None
                
            # Get assigned subjects
            teacher['subjects'] = get_teacher_subjects(teacher_id)
            teacher['subject_count'] = len(teacher['subjects'])
            
            return teacher
            
        finally:
            pool.putconn(conn)
            
    except Exception as e:
        print(f"Error getting teacher with subjects: {e}")
        return None

# Make functions available for import
__all__ = [
    'get_teacher_subject_assignments',
    'get_available_subjects_for_school',
    'assign_subjects_to_teacher',
    'remove_subject_from_teacher',
    'get_teachers_by_subject',
    'validate_subject_assignment',
    'get_teacher_with_subjects'
]