"""
RBAC Seed Data for EduFlow
Defines all roles, permissions, and default role assignments
"""

ROLES = [
    # System Roles
    {
        'role_name': 'admin',
        'role_name_ar': 'مدير النظام',
        'description': 'Full system access with all permissions',
        'is_system_role': True
    },
    {
        'role_name': 'system_supervisor',
        'role_name_ar': 'مشرف النظام',
        'description': 'View-only access across all schools for monitoring',
        'is_system_role': True
    },
    {
        'role_name': 'branch_manager',
        'role_name_ar': 'مدير الفرع',
        'description': 'Full control over specific school branch',
        'is_system_role': True
    },
    {
        'role_name': 'teacher',
        'role_name_ar': 'معلم',
        'description': 'Teaching responsibilities with class management',
        'is_system_role': True
    },
    {
        'role_name': 'student_counselor',
        'role_name_ar': 'مرشد طلابي',
        'description': 'Access to student records for counseling purposes',
        'is_system_role': True
    },
    {
        'role_name': 'subject_coordinator',
        'role_name_ar': 'منسق المادة',
        'description': 'Coordinate specific subject across multiple classes',
        'is_system_role': True
    },
    {
        'role_name': 'academic_advisor',
        'role_name_ar': 'مستشار أكاديمي',
        'description': 'Academic planning and performance analysis',
        'is_system_role': True
    },
    {
        'role_name': 'parent',
        'role_name_ar': 'ولي الأمر',
        'description': 'View own children records only',
        'is_system_role': True
    },
    {
        'role_name': 'school',
        'role_name_ar': 'المدرسة',
        'description': 'School-level administrative access',
        'is_system_role': True
    },
    {
        'role_name': 'student',
        'role_name_ar': 'طالب',
        'description': 'Student view-only access to own records',
        'is_system_role': True
    }
]

PERMISSIONS = [
    # Student Management
    {'permission_code': 'students:view', 'permission_name': 'View Students', 'permission_name_ar': 'عرض الطلاب', 'resource_type': 'students', 'action': 'view'},
    {'permission_code': 'students:create', 'permission_name': 'Create Students', 'permission_name_ar': 'إضافة طلاب', 'resource_type': 'students', 'action': 'create'},
    {'permission_code': 'students:edit', 'permission_name': 'Edit Students', 'permission_name_ar': 'تعديل الطلاب', 'resource_type': 'students', 'action': 'edit'},
    {'permission_code': 'students:delete', 'permission_name': 'Delete Students', 'permission_name_ar': 'حذف الطلاب', 'resource_type': 'students', 'action': 'delete'},
    {'permission_code': 'students:export', 'permission_name': 'Export Student Data', 'permission_name_ar': 'تصدير بيانات الطلاب', 'resource_type': 'students', 'action': 'export'},
    
    # Teacher Management
    {'permission_code': 'teachers:view', 'permission_name': 'View Teachers', 'permission_name_ar': 'عرض المعلمين', 'resource_type': 'teachers', 'action': 'view'},
    {'permission_code': 'teachers:create', 'permission_name': 'Create Teachers', 'permission_name_ar': 'إضافة معلمين', 'resource_type': 'teachers', 'action': 'create'},
    {'permission_code': 'teachers:edit', 'permission_name': 'Edit Teachers', 'permission_name_ar': 'تعديل المعلمين', 'resource_type': 'teachers', 'action': 'edit'},
    {'permission_code': 'teachers:delete', 'permission_name': 'Delete Teachers', 'permission_name_ar': 'حذف معلمين', 'resource_type': 'teachers', 'action': 'delete'},
    
    # Grade Management
    {'permission_code': 'grades:view', 'permission_name': 'View Grades', 'permission_name_ar': 'عرض الدرجات', 'resource_type': 'grades', 'action': 'view'},
    {'permission_code': 'grades:edit', 'permission_name': 'Edit Grades', 'permission_name_ar': 'تعديل الدرجات', 'resource_type': 'grades', 'action': 'edit'},
    {'permission_code': 'grades:publish', 'permission_name': 'Publish Grades', 'permission_name_ar': 'نشر الدرجات', 'resource_type': 'grades', 'action': 'publish'},
    
    # Attendance Management
    {'permission_code': 'attendance:view', 'permission_name': 'View Attendance', 'permission_name_ar': 'عرض الحضور', 'resource_type': 'attendance', 'action': 'view'},
    {'permission_code': 'attendance:edit', 'permission_name': 'Edit Attendance', 'permission_name_ar': 'تعديل الحضور', 'resource_type': 'attendance', 'action': 'edit'},
    
    # Reports
    {'permission_code': 'reports:view', 'permission_name': 'View Reports', 'permission_name_ar': 'عرض التقارير', 'resource_type': 'reports', 'action': 'view'},
    {'permission_code': 'reports:generate', 'permission_name': 'Generate Reports', 'permission_name_ar': 'إنشاء تقارير', 'resource_type': 'reports', 'action': 'generate'},
    {'permission_code': 'reports:export', 'permission_name': 'Export Reports', 'permission_name_ar': 'تصدير تقارير', 'resource_type': 'reports', 'action': 'export'},
    
    # Settings
    {'permission_code': 'settings:view', 'permission_name': 'View Settings', 'permission_name_ar': 'عرض الإعدادات', 'resource_type': 'settings', 'action': 'view'},
    {'permission_code': 'settings:edit', 'permission_name': 'Edit Settings', 'permission_name_ar': 'تعديل الإعدادات', 'resource_type': 'settings', 'action': 'edit'},
    
    # User Management
    {'permission_code': 'users:view', 'permission_name': 'View Users', 'permission_name_ar': 'عرض المستخدمين', 'resource_type': 'users', 'action': 'view'},
    {'permission_code': 'users:manage', 'permission_name': 'Manage Users', 'permission_name_ar': 'إدارة المستخدمين', 'resource_type': 'users', 'action': 'manage'},
    
    # School Management
    {'permission_code': 'schools:view', 'permission_name': 'View Schools', 'permission_name_ar': 'عرض المدارس', 'resource_type': 'schools', 'action': 'view'},
    {'permission_code': 'schools:edit', 'permission_name': 'Edit Schools', 'permission_name_ar': 'تعديل المدارس', 'resource_type': 'schools', 'action': 'edit'},
    
    # Academic Management
    {'permission_code': 'academic_years:view', 'permission_name': 'View Academic Years', 'permission_name_ar': 'عرض السنوات الدراسية', 'resource_type': 'academic_years', 'action': 'view'},
    {'permission_code': 'academic_years:edit', 'permission_name': 'Edit Academic Years', 'permission_name_ar': 'تعديل السنوات الدراسية', 'resource_type': 'academic_years', 'action': 'edit'},
    
    # Recommendations & Analytics
    {'permission_code': 'recommendations:view', 'permission_name': 'View Recommendations', 'permission_name_ar': 'عرض التوصيات', 'resource_type': 'recommendations', 'action': 'view'},
    {'permission_code': 'analytics:view', 'permission_name': 'View Analytics', 'permission_name_ar': 'عرض التحليلات', 'resource_type': 'analytics', 'action': 'view'}
]

# Role-Permission Assignments
ROLE_PERMISSIONS = {
    'admin': [p['permission_code'] for p in PERMISSIONS],  # All permissions
    
    'system_supervisor': [
        'students:view', 'teachers:view', 'grades:view', 'attendance:view',
        'reports:view', 'reports:generate', 'analytics:view',
        'schools:view', 'academic_years:view'
    ],
    
    'branch_manager': [
        'students:view', 'students:create', 'students:edit',
        'teachers:view', 'teachers:create', 'teachers:edit',
        'grades:view', 'grades:edit', 'grades:publish',
        'attendance:view', 'attendance:edit',
        'reports:view', 'reports:generate',
        'settings:view', 'users:view',
        'schools:view', 'academic_years:view'
    ],
    
    'teacher': [
        'students:view',
        'grades:view', 'grades:edit',
        'attendance:view', 'attendance:edit',
        'reports:view',
        'recommendations:view'
    ],
    
    'student_counselor': [
        'students:view', 'students:edit',
        'grades:view',
        'attendance:view',
        'reports:view', 'reports:generate',
        'recommendations:view'
    ],
    
    'subject_coordinator': [
        'students:view',
        'grades:view', 'grades:edit',
        'reports:view', 'reports:generate',
        'recommendations:view'
    ],
    
    'academic_advisor': [
        'students:view',
        'grades:view',
        'attendance:view',
        'reports:view', 'reports:generate',
        'analytics:view', 'recommendations:view'
    ],
    
    'parent': [
        'students:view',  # Only own children
        'grades:view',   # Only own children
        'attendance:view'  # Only own children
    ],
    
    'school': [
        'students:view', 'students:create', 'students:edit', 'students:delete',
        'teachers:view', 'teachers:create', 'teachers:edit', 'teachers:delete',
        'grades:view', 'grades:edit', 'grades:publish',
        'attendance:view', 'attendance:edit',
        'reports:view', 'reports:generate', 'reports:export',
        'settings:view', 'settings:edit',
        'users:view',
        'schools:view', 'schools:edit',
        'academic_years:view', 'academic_years:edit'
    ],
    
    'student': [
        'grades:view',  # Only own grades
        'attendance:view',  # Only own attendance
        'reports:view'  # Only own reports
    ]
}

# Default user-role assignments (for existing users)
DEFAULT_USER_ROLE_ASSIGNMENTS = {
    'admin': ['admin'],
    'school': ['school'],
    'teacher': ['teacher'],
    'student': ['student']
}


def get_seed_sql():
    """Generate SQL statements for seeding RBAC data"""
    sql_statements = []
    
    # Insert roles
    for role in ROLES:
        sql = f"""
        INSERT INTO roles (role_name, role_name_ar, description, is_system_role)
        VALUES ('{role['role_name']}', '{role['role_name_ar']}', '{role['description']}', {str(role['is_system_role']).lower()})
        ON DUPLICATE KEY UPDATE 
            role_name_ar = VALUES(role_name_ar),
            description = VALUES(description);
        """
        sql_statements.append(sql)
    
    # Insert permissions
    for perm in PERMISSIONS:
        sql = f"""
        INSERT INTO permissions (permission_code, permission_name, permission_name_ar, resource_type, action)
        VALUES ('{perm['permission_code']}', '{perm['permission_name']}', '{perm['permission_name_ar']}', '{perm['resource_type']}', '{perm['action']}')
        ON DUPLICATE KEY UPDATE
            permission_name = VALUES(permission_name),
            permission_name_ar = VALUES(permission_name_ar);
        """
        sql_statements.append(sql)
    
    # Insert role_permissions (will be done programmatically after getting IDs)
    sql_statements.append("-- Role-permission assignments will be created by migration script")
    
    return '\n'.join(sql_statements)


if __name__ == '__main__':
    print("RBAC Seed Data")
    print("=" * 50)
    print(f"Total Roles: {len(ROLES)}")
    print(f"Total Permissions: {len(PERMISSIONS)}")
    print("\nRoles:")
    for role in ROLES:
        print(f"  - {role['role_name']} ({role['role_name_ar']})")
    print(f"\nPermissions per role:")
    for role_name, perms in ROLE_PERMISSIONS.items():
        print(f"  {role_name}: {len(perms)} permissions")
