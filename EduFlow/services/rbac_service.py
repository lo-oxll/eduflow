"""
RBAC Service for EduFlow
Provides role-based access control with fine-grained permissions
"""
from typing import Dict, List, Optional
from core.database import get_postgresql_pool
import datetime


class RBACService:
    """Role-Based Access Control Service"""
    
    def __init__(self):
        self.pool = get_postgresql_pool()
    
    def _execute_query(self, query: str, params: tuple = None, fetch_one: bool = False):
        """Execute database query"""
        if not self.pool:
            raise Exception("Database connection failed")
        
        conn = self.pool.get_connection()
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(query, params or ())
            
            if fetch_one:
                result = cur.fetchone()
            else:
                result = cur.fetchall()
            
            return result
        finally:
            conn.close()
    
    def get_user_permissions(self, user_id: int, school_id: int = None) -> List[str]:
        """
        Get all permission codes for a user
        
        Args:
            user_id: User ID
            school_id: Optional school ID for context-specific permissions
            
        Returns:
            List of permission codes
        """
        query = """
            SELECT DISTINCT p.permission_code
            FROM user_roles ur
            JOIN role_permissions rp ON ur.role_id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE ur.user_id = %s 
              AND ur.is_active = TRUE
              AND (ur.expires_at IS NULL OR ur.expires_at > %s)
              AND (ur.school_id IS NULL OR ur.school_id = %s)
            ORDER BY p.permission_code
        """
        results = self._execute_query(query, (user_id, datetime.datetime.now(datetime.timezone.utc), school_id))
        return [r['permission_code'] for r in results]
    
    def has_permission(self, user_id: int, permission_code: str, school_id: int = None) -> bool:
        """
        Check if user has specific permission
        
        Args:
            user_id: User ID
            permission_code: Permission code to check
            school_id: Optional school ID for context
            
        Returns:
            True if user has permission
        """
        # Admin has all permissions
        admin_roles = self.get_user_roles(user_id, school_id)
        if any(r['role_name'] == 'admin' for r in admin_roles):
            return True
        
        permissions = self.get_user_permissions(user_id, school_id)
        return permission_code in permissions
    
    def get_user_roles(self, user_id: int, school_id: int = None) -> List[Dict]:
        """
        Get all roles assigned to a user
        
        Args:
            user_id: User ID
            school_id: Optional school ID filter
            
        Returns:
            List of role information
        """
        query = """
            SELECT r.id, r.role_name, r.role_name_ar, r.description,
                   ur.school_id, ur.granted_at, ur.expires_at, ur.is_active
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = %s
              AND ur.is_active = TRUE
              AND (ur.expires_at IS NULL OR ur.expires_at > %s)
              AND (ur.school_id IS NULL OR ur.school_id = %s)
            ORDER BY r.role_name
        """
        return self._execute_query(query, (user_id, datetime.datetime.now(datetime.timezone.utc), school_id))
    
    def assign_role_to_user(self, user_id: int, role_id: int, 
                           granted_by: int, school_id: int = None,
                           expires_at: datetime.datetime = None) -> Dict:
        """
        Assign role to user
        
        Args:
            user_id: User to assign role to
            role_id: Role to assign
            granted_by: User ID granting the role
            school_id: Optional school context
            expires_at: Optional expiration timestamp
            
        Returns:
            Assignment result
        """
        try:
            query = """
                INSERT INTO user_roles 
                (user_id, role_id, school_id, granted_by, expires_at)
                VALUES (%s, %s, %s, %s, %s)
            """
            params = (user_id, role_id, school_id, granted_by, expires_at)
            self._execute_query(query, params)
            
            return {
                'success': True,
                'message': 'Role assigned successfully',
                'message_ar': 'تم تعيين الدور بنجاح'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'error_ar': 'فشل تعيين الدور'
            }
    
    def revoke_user_role(self, user_id: int, role_id: int, school_id: int = None) -> Dict:
        """
        Remove role from user
        
        Args:
            user_id: User ID
            role_id: Role to remove
            school_id: Optional school context
            
        Returns:
            Revocation result
        """
        query = """
            UPDATE user_roles
            SET is_active = FALSE
            WHERE user_id = %s AND role_id = %s
              AND (school_id IS NULL OR school_id = %s)
        """
        self._execute_query(query, (user_id, role_id, school_id))
        
        return {
            'success': True,
            'message': 'Role revoked successfully',
            'message_ar': 'تم إلغاء الدور بنجاح'
        }
    
    def get_users_by_role(self, role_id: int, school_id: int = None) -> List[Dict]:
        """
        Get all users with specific role
        
        Args:
            role_id: Role ID
            school_id: Optional school filter
            
        Returns:
            List of users
        """
        query = """
            SELECT u.id, u.username, u.role as legacy_role,
                   ur.school_id, ur.granted_at, ur.expires_at
            FROM user_roles ur
            JOIN users u ON ur.user_id = u.id
            WHERE ur.role_id = %s
              AND ur.is_active = TRUE
              AND (ur.expires_at IS NULL OR ur.expires_at > %s)
              AND (ur.school_id IS NULL OR ur.school_id = %s)
            ORDER BY u.username
        """
        return self._execute_query(query, (role_id, datetime.datetime.now(datetime.timezone.utc), school_id))
    
    def get_role_by_name(self, role_name: str) -> Optional[Dict]:
        """Get role by name"""
        query = "SELECT * FROM roles WHERE role_name = %s"
        return self._execute_query(query, (role_name,), fetch_one=True)
    
    def get_permission_by_code(self, permission_code: str) -> Optional[Dict]:
        """Get permission by code"""
        query = "SELECT * FROM permissions WHERE permission_code = %s"
        return self._execute_query(query, (permission_code,), fetch_one=True)
    
    def get_all_roles(self) -> List[Dict]:
        """Get all available roles"""
        query = """
            SELECT id, role_name, role_name_ar, description, is_system_role
            FROM roles
            ORDER BY role_name
        """
        return self._execute_query(query)
    
    def get_all_permissions(self) -> List[Dict]:
        """Get all available permissions"""
        query = """
            SELECT id, permission_code, permission_name, permission_name_ar, 
                   resource_type, action
            FROM permissions
            ORDER BY resource_type, permission_code
        """
        return self._execute_query(query)
    
    def migrate_legacy_user_role(self, user_id: int, legacy_role: str, school_id: int = None) -> Dict:
        """
        Migrate user from legacy role system to new RBAC
        
        Args:
            user_id: User ID
            legacy_role: Legacy role name (admin, school, teacher, student)
            school_id: Optional school context
            
        Returns:
            Migration result
        """
        # Map legacy roles to new roles
        role_mapping = {
            'admin': 'admin',
            'school': 'school',
            'teacher': 'teacher',
            'student': 'student'
        }
        
        new_role_name = role_mapping.get(legacy_role)
        if not new_role_name:
            return {
                'success': False,
                'error': f'Unknown legacy role: {legacy_role}'
            }
        
        # Get new role
        role = self.get_role_by_name(new_role_name)
        if not role:
            return {
                'success': False,
                'error': f'Role not found: {new_role_name}'
            }
        
        # Check if already assigned
        existing_roles = self.get_user_roles(user_id, school_id)
        if any(r['role_name'] == new_role_name for r in existing_roles):
            return {
                'success': True,
                'message': 'Role already migrated',
                'already_exists': True
            }
        
        # Assign new role
        return self.assign_role_to_user(
            user_id=user_id,
            role_id=role['id'],
            granted_by=1,  # System migration
            school_id=school_id
        )


# Global instance
_rbac_service = None


def get_rbac_service() -> RBACService:
    """Get the global RBAC service instance"""
    global _rbac_service
    if _rbac_service is None:
        _rbac_service = RBACService()
    return _rbac_service


# Convenience functions
def has_permission(user_id: int, permission_code: str, school_id: int = None) -> bool:
    """Check if user has permission"""
    return get_rbac_service().has_permission(user_id, permission_code, school_id)


def get_user_permissions(user_id: int, school_id: int = None) -> List[str]:
    """Get user permissions"""
    return get_rbac_service().get_user_permissions(user_id, school_id)


__all__ = [
    'RBACService',
    'get_rbac_service',
    'has_permission',
    'get_user_permissions'
]
