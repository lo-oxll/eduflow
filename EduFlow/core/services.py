"""
Service Layer for EduFlow School Management System
Provides organized business logic separated from API routes
"""
from typing import Dict, List, Optional, Any, Tuple
from core.database import get_postgresql_pool
import datetime
import json
from flask import g
from security import get_security_middleware
from cache import get_cache_manager
from security_enhanced import get_argon2_hasher, SecurityUtils

class BaseService:
    """Base service class with common functionality"""
    
    def __init__(self):
        self.pool = get_postgresql_pool()
        self.security = get_security_middleware()
        self.audit_logger = self.security.audit_logger if self.security else None
        self.cache_manager = get_cache_manager()
    
    def _execute_query(self, query: str, params: tuple = None, fetch_one: bool = False):
        """Execute database query with connection management"""
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
            
            conn.commit()
            return result
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

class SchoolService(BaseService):
    """Service for school-related operations"""
    
    def get_all_schools(self) -> List[Dict]:
        """Get all schools with their details"""
        query = """
            SELECT id, name, code, study_type, level AS stage, gender_type, 
                   created_at, updated_at
            FROM schools
            ORDER BY name
        """
        return self._execute_query(query)
    
    def get_school_by_code(self, code: str) -> Optional[Dict]:
        """Get school by code"""
        query = "SELECT * FROM schools WHERE code = %s"
        return self._execute_query(query, (code,), fetch_one=True)
    
    def create_school(self, school_data: Dict) -> Dict:
        """Create a new school with auto-generated code"""
        # Validate required fields
        required_fields = ['name', 'study_type', 'level', 'gender_type']
        for field in required_fields:
            if not school_data.get(field):
                raise ValueError(f"Missing required field: {field}")
        
        # Generate unique school code
        code = self._generate_unique_school_code()
        
        query = """
            INSERT INTO schools (name, code, study_type, level, gender_type, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        params = (
            school_data['name'],
            code,
            school_data['study_type'],
            school_data['level'],
            school_data['gender_type'],
            datetime.datetime.now(datetime.timezone.utc)
        )
        
        self._execute_query(query, params)
        
        # Log audit trail
        if self.audit_logger:
            self.audit_logger.log_action(
                user_id=getattr(g, 'current_user', {}).get('id', 0),
                action='CREATE',
                resource_type='school',
                details={'school_name': school_data['name'], 'school_code': code}
            )
        
        return {
            'success': True,
            'code': code,
            'message': 'School created successfully'
        }
    
    def _generate_unique_school_code(self) -> str:
        """Generate unique 6-character school code"""
        import random
        import string
        
        while True:
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            existing = self._execute_query(
                "SELECT id FROM schools WHERE code = %s", 
                (code,), 
                fetch_one=True
            )
            if not existing:
                return code

class AcademicYearService(BaseService):
    """Service for academic year operations"""
    
    def create_academic_year(self, data: Dict) -> Dict:
        """Create a new academic year"""
        # Validate required fields
        required_fields = ['school_id', 'start_year', 'end_year']
        for field in required_fields:
            if not data.get(field):
                raise ValueError(f"Missing required field: {field}")
        
        # Check if school exists
        school = self._execute_query(
            "SELECT id FROM schools WHERE id = %s",
            (data['school_id'],),
            fetch_one=True
        )
        if not school:
            raise ValueError("School not found")
        
        # Check for existing academic year
        existing = self._execute_query(
            """SELECT id FROM academic_years 
               WHERE school_id = %s AND start_year = %s AND end_year = %s""",
            (data['school_id'], data['start_year'], data['end_year']),
            fetch_one=True
        )
        if existing:
            raise ValueError("Academic year already exists for this school")
        
        # Handle current year setting
        if data.get('is_current'):
            # Set other years as not current for this school
            self._execute_query(
                "UPDATE academic_years SET is_current = FALSE WHERE school_id = %s",
                (data['school_id'],)
            )
        
        query = """
            INSERT INTO academic_years 
            (school_id, start_year, end_year, is_current, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """
        params = (
            data['school_id'],
            data['start_year'],
            data['end_year'],
            bool(data.get('is_current', False)),
            datetime.datetime.now(datetime.timezone.utc)
        )
        
        self._execute_query(query, params)
        
        # Log audit trail
        if self.audit_logger:
            self.audit_logger.log_action(
                user_id=getattr(g, 'current_user', {}).get('id', 0),
                action='CREATE',
                resource_type='academic_year',
                details={
                    'school_id': data['school_id'],
                    'start_year': data['start_year'],
                    'end_year': data['end_year'],
                    'is_current': bool(data.get('is_current', False))
                }
            )
        
        return {
            'success': True,
            'message': 'Academic year created successfully'
        }
    
    def get_academic_years_by_school(self, school_id: int) -> List[Dict]:
        """Get all academic years for a school"""
        query = """
            SELECT id, school_id, start_year, end_year, is_current,
                   created_at, updated_at,
                   CONCAT(start_year, '-', end_year) as year_range
            FROM academic_years
            WHERE school_id = %s
            ORDER BY start_year DESC
        """
        return self._execute_query(query, (school_id,))
    
    def get_current_academic_year(self, school_id: int) -> Optional[Dict]:
        """Get current academic year for a school"""
        query = """
            SELECT id, school_id, start_year, end_year, is_current,
                   created_at, updated_at
            FROM academic_years
            WHERE school_id = %s AND is_current = TRUE
            LIMIT 1
        """
        return self._execute_query(query, (school_id,), fetch_one=True)
    
    def set_current_academic_year(self, year_id: int, school_id: int) -> Dict:
        """Set an academic year as current for a school"""
        # First set all years as not current
        self._execute_query(
            "UPDATE academic_years SET is_current = FALSE WHERE school_id = %s",
            (school_id,)
        )
        
        # Then set the specified year as current
        self._execute_query(
            "UPDATE academic_years SET is_current = TRUE WHERE id = %s AND school_id = %s",
            (year_id, school_id)
        )
        
        return {
            'success': True,
            'message': 'Current academic year updated successfully'
        }

class StudentService(BaseService):
    """Service for student-related operations"""
    
    def create_student(self, student_data: Dict) -> Dict:
        """Create a new student"""
        # Validate required fields
        required_fields = ['name', 'school_id', 'grade_level']
        for field in required_fields:
            if not student_data.get(field):
                raise ValueError(f"Missing required field: {field}")
        
        # Generate unique student code
        code = self._generate_unique_student_code()
        
        query = """
            INSERT INTO students 
            (name, code, school_id, grade_level, classroom, parent_phone, 
             enrollment_date, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        params = (
            student_data['name'],
            code,
            student_data['school_id'],
            student_data['grade_level'],
            student_data.get('classroom', ''),
            student_data.get('parent_phone', ''),
            student_data.get('enrollment_date') or datetime.datetime.now(datetime.timezone.utc).date(),
            datetime.datetime.now(datetime.timezone.utc)
        )
        
        self._execute_query(query, params)
        
        return {
            'success': True,
            'code': code,
            'message': 'Student created successfully'
        }
    
    def get_students_by_school(self, school_id: int) -> List[Dict]:
        """Get all students for a school"""
        query = """
            SELECT s.id, s.full_name AS name, s.student_code AS code,
                   s.grade AS grade_level, s.room AS classroom,
                   s.parent_contact AS parent_phone, s.enrollment_date,
                   s.created_at, s.updated_at
            FROM students s
            WHERE s.school_id = %s
            ORDER BY s.full_name
        """
        return self._execute_query(query, (school_id,))
    
    def _generate_unique_student_code(self) -> str:
        """Generate unique student code"""
        import random
        import string
        
        while True:
            code = 'STUD-' + ''.join(random.choices(string.digits, k=6))
            existing = self._execute_query(
                "SELECT id FROM students WHERE code = %s", 
                (code,), 
                fetch_one=True
            )
            if not existing:
                return code

class TeacherService(BaseService):
    """Service for teacher-related operations"""
    
    def create_teacher(self, teacher_data: Dict) -> Dict:
        """Create a new teacher with auto-generated code"""
        # Validate required fields
        required_fields = ['name', 'school_id', 'subject']
        for field in required_fields:
            if not teacher_data.get(field):
                raise ValueError(f"Missing required field: {field}")
        
        # Generate unique teacher code
        code = self._generate_unique_teacher_code()
        
        query = """
            INSERT INTO teachers 
            (name, code, school_id, subject, email, phone, hire_date, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        params = (
            teacher_data['name'],
            code,
            teacher_data['school_id'],
            teacher_data['subject'],
            teacher_data.get('email', ''),
            teacher_data.get('phone', ''),
            teacher_data.get('hire_date') or datetime.datetime.now(datetime.timezone.utc).date(),
            datetime.datetime.now(datetime.timezone.utc)
        )
        
        self._execute_query(query, params)
        
        return {
            'success': True,
            'code': code,
            'message': 'Teacher created successfully'
        }
    
    def get_teachers_by_school(self, school_id: int) -> List[Dict]:
        """Get all teachers for a school"""
        query = """
            SELECT t.id, t.full_name AS name, t.teacher_code AS code,
                   t.grade_level, t.specialization, t.email, t.phone,
                   t.created_at, t.updated_at
            FROM teachers t
            WHERE t.school_id = %s
            ORDER BY t.full_name
        """
        return self._execute_query(query, (school_id,))
    
    def _generate_unique_teacher_code(self) -> str:
        """Generate unique teacher code in TCHR-XXXXX-XXXX format"""
        import random
        import string
        
        while True:
            # Generate TCHR-XXXXX-XXXX format
            prefix = "TCHR"
            middle = ''.join(random.choices(string.digits, k=5))
            suffix = ''.join(random.choices(string.digits, k=4))
            code = f"{prefix}-{middle}-{suffix}"
            
            existing = self._execute_query(
                "SELECT id FROM teachers WHERE code = %s", 
                (code,), 
                fetch_one=True
            )
            if not existing:
                return code

class RecommendationService(BaseService):
    """Service for generating role-based academic recommendations"""
    
    def get_teacher_recommendations(self, teacher_id: int) -> Dict:
        """
        Get detailed recommendations for teachers/admins showing:
        - Student weaknesses by subject area
        - Class performance insights
        - Actionable educational strategies
        """
        # Get teacher's subjects and students
        teacher = self._execute_query(
            "SELECT * FROM teachers WHERE id = %s",
            (teacher_id,),
            fetch_one=True
        )
        
        if not teacher:
            return {'success': False, 'error': 'Teacher not found'}
        
        # Get teacher's assigned subjects
        subjects = self._execute_query("""
            SELECT s.id, s.name, s.grade_level
            FROM teacher_subjects ts
            JOIN subjects s ON ts.subject_id = s.id
            WHERE ts.teacher_id = %s
            ORDER BY s.name
        """, (teacher_id,))
        
        # Get students in these subjects
        grade_levels = [s['grade_level'] for s in subjects] if subjects else []
        students = []
        if grade_levels:
            placeholders = ','.join(['%s'] * len(grade_levels))
            students = self._execute_query(f"""
                SELECT id, full_name, student_code, grade, detailed_scores
                FROM students
                WHERE grade IN ({placeholders})
            """, tuple(grade_levels))
        
        # Analyze performance for each subject
        subject_analysis = {}
        for subject in subjects:
            subject_students = [s for s in students if s['grade'] == subject['grade_level']]
            analysis = self._analyze_subject_performance(subject['name'], subject_students)
            subject_analysis[subject['name']] = analysis
        
        # Generate class insights
        class_insights = self._generate_class_insights(subjects, students, subject_analysis)
        
        # Generate actionable strategies
        strategies = self._generate_educational_strategies(subject_analysis)
        
        # Identify students needing attention
        at_risk_students = self._identify_at_risk_students(students)
        
        return {
            'success': True,
            'teacher_id': teacher_id,
            'subjects_analysis': subject_analysis,
            'class_insights': class_insights,
            'strategies': strategies,
            'at_risk_students': at_risk_students
        }
    
    def get_student_recommendations(self, student_id: int) -> Dict:
        """
        Get personalized recommendations for students showing:
        - Performance-based encouragement or warning
        - Motivational messages
        - Study suggestions tailored to their situation
        """
        student = self._execute_query(
            "SELECT * FROM students WHERE id = %s",
            (student_id,),
            fetch_one=True
        )
        
        if not student:
            return {'success': False, 'error': 'Student not found'}
        
        # Parse detailed scores
        detailed_scores = {}
        if student.get('detailed_scores'):
            if isinstance(student['detailed_scores'], str):
                try:
                    detailed_scores = json.loads(student['detailed_scores'])
                except:
                    detailed_scores = {}
            else:
                detailed_scores = student['detailed_scores']
        
        # Analyze overall performance
        overall_analysis = self._analyze_student_performance(student_id, detailed_scores)
        
        # Generate personalized message
        message = self._generate_student_message(overall_analysis)
        
        # Generate study suggestions
        suggestions = self._generate_study_suggestions(overall_analysis, student.get('grade', ''))
        
        return {
            'success': True,
            'student_id': student_id,
            'performance_analysis': overall_analysis,
            'message': message,
            'suggestions': suggestions
        }
    
    def _analyze_subject_performance(self, subject_name: str, students: List[Dict]) -> Dict:
        """Analyze performance of students in a specific subject"""
        if not students:
            return {
                'subject': subject_name,
                'student_count': 0,
                'average_score': 0,
                'pass_rate': 0,
                'excellent_count': 0,
                'good_count': 0,
                'needs_support_count': 0,
                'weak_subjects': [],
                'trend': 'stable'
            }
        
        excellent_threshold = 85
        pass_threshold = 60
        
        scores = []
        excellent_count = 0
        good_count = 0
        needs_support_count = 0
        
        for student in students:
            detailed_scores = {}
            if student.get('detailed_scores'):
                if isinstance(student['detailed_scores'], str):
                    try:
                        detailed_scores = json.loads(student['detailed_scores'])
                    except:
                        detailed_scores = {}
                else:
                    detailed_scores = student['detailed_scores']
            
            # Get score for this subject
            subject_data = detailed_scores.get(subject_name, {})
            student_scores = [
                subject_data.get('month1', 0) or 0,
                subject_data.get('month2', 0) or 0,
                subject_data.get('midterm', 0) or 0,
                subject_data.get('month3', 0) or 0,
                subject_data.get('month4', 0) or 0,
                subject_data.get('final', 0) or 0
            ]
            valid_scores = [s for s in student_scores if s > 0]
            
            if valid_scores:
                avg = sum(valid_scores) / len(valid_scores)
                scores.append(avg)
                
                if avg >= excellent_threshold:
                    excellent_count += 1
                elif avg >= pass_threshold:
                    good_count += 1
                else:
                    needs_support_count += 1
        
        avg_score = sum(scores) / len(scores) if scores else 0
        pass_rate = (len(scores) - needs_support_count) / len(scores) * 100 if scores else 0
        
        return {
            'subject': subject_name,
            'student_count': len(students),
            'average_score': round(avg_score, 2),
            'pass_rate': round(pass_rate, 2),
            'excellent_count': excellent_count,
            'good_count': good_count,
            'needs_support_count': needs_support_count,
            'weak_subjects': [],
            'trend': 'stable'
        }
    
    def _generate_class_insights(self, subjects: List[Dict], students: List[Dict], 
                                   subject_analysis: Dict) -> Dict:
        """Generate class-wide performance insights"""
        total_students = len(students)
        if total_students == 0:
            return {
                'total_students': 0,
                'overall_average': 0,
                'pass_rate': 0,
                'top_performers': [],
                'needs_attention': [],
                'subjects_need_focus': []
            }
        
        # Calculate overall average
        all_scores = []
        for subject_name, analysis in subject_analysis.items():
            if analysis['student_count'] > 0:
                all_scores.append(analysis['average_score'])
        
        overall_avg = sum(all_scores) / len(all_scores) if all_scores else 0
        
        # Find subjects needing focus (low pass rate)
        subjects_need_focus = [
            name for name, analysis in subject_analysis.items()
            if analysis['pass_rate'] < 70
        ]
        
        # Identify students needing attention (in multiple weak subjects)
        needs_attention = []
        for student in students:
            weak_count = 0
            for subject_name, analysis in subject_analysis.items():
                detailed_scores = {}
                if student.get('detailed_scores'):
                    if isinstance(student['detailed_scores'], str):
                        try:
                            detailed_scores = json.loads(student['detailed_scores'])
                        except:
                            detailed_scores = {}
                    else:
                        detailed_scores = student['detailed_scores']
                
                subject_data = detailed_scores.get(subject_name, {})
                scores = [
                    subject_data.get('month1', 0) or 0,
                    subject_data.get('month2', 0) or 0,
                    subject_data.get('midterm', 0) or 0,
                    subject_data.get('month3', 0) or 0,
                    subject_data.get('month4', 0) or 0,
                    subject_data.get('final', 0) or 0
                ]
                valid_scores = [s for s in scores if s > 0]
                if valid_scores:
                    avg = sum(valid_scores) / len(valid_scores)
                    if avg < 60:
                        weak_count += 1
            
            if weak_count >= 2:
                needs_attention.append({
                    'id': student['id'],
                    'name': student['full_name'],
                    'weak_subjects_count': weak_count
                })
        
        return {
            'total_students': total_students,
            'overall_average': round(overall_avg, 2),
            'pass_rate': round(sum(a.get('pass_rate', 0) for a in subject_analysis.values()) / len(subject_analysis), 2) if subject_analysis else 0,
            'top_performers': [],
            'needs_attention': needs_attention[:10],  # Limit to 10
            'subjects_need_focus': subjects_need_focus
        }
    
    def _generate_educational_strategies(self, subject_analysis: Dict) -> List[Dict]:
        """Generate actionable educational strategies in Arabic"""
        strategies = []
        
        for subject_name, analysis in subject_analysis.items():
            if analysis['pass_rate'] < 70:
                strategies.append({
                    'subject': subject_name,
                    'priority': 'high' if analysis['pass_rate'] < 50 else 'medium',
                    'issue': f'معدل النجاح منخفض ({analysis["pass_rate"]}%)',
                    'strategy': f'يفضل إجراء جلسات مراجعة إضافية وتمارين تدريبية لمادة {subject_name}',
                    'suggested_actions': [
                        'تحديد المواضيع التي يواجه الطلاب صعوبة في فهمها',
                        'توفير مواد تعليمية إضافية ومصادر مساعدة',
                        'النظر في برامج التدريس بين الأقران',
                        'جدولة جلسات تدريب إضافية بانتظام'
                    ]
                })
            
            if analysis['needs_support_count'] > analysis['student_count'] * 0.3:
                strategies.append({
                    'subject': subject_name,
                    'priority': 'high',
                    'issue': f'نسبة عالية من الطلاب يحتاجون دعماً ({analysis["needs_support_count"]}/{analysis["student_count"]})',
                    'strategy': 'تطبيق أساليب التدريس المتمايز والتعليم الشخصي',
                    'suggested_actions': [
                        'تقسيم المواضيع المعقدة إلى خطوات أصغر وأبسط',
                        'تقديم دعم فردي للطلاب الذين يواجهون صعوبات',
                        'استخدام الوسائل البصرية والأنشطة العملية',
                        'إنشاء مجموعات دراسية للتعلم التعاوني بين الطلاب'
                    ]
                })
        
        return strategies
    
    def _identify_at_risk_students(self, students: List[Dict]) -> List[Dict]:
        """Identify students who need immediate attention"""
        at_risk = []
        
        for student in students:
            detailed_scores = {}
            if student.get('detailed_scores'):
                if isinstance(student['detailed_scores'], str):
                    try:
                        detailed_scores = json.loads(student['detailed_scores'])
                    except:
                        detailed_scores = {}
                else:
                    detailed_scores = student['detailed_scores']
            
            weak_subjects = []
            for subject, scores in detailed_scores.items():
                student_scores = [
                    scores.get('month1', 0) or 0,
                    scores.get('month2', 0) or 0,
                    scores.get('midterm', 0) or 0,
                    scores.get('month3', 0) or 0,
                    scores.get('month4', 0) or 0,
                    scores.get('final', 0) or 0
                ]
                valid_scores = [s for s in student_scores if s > 0]
                if valid_scores:
                    avg = sum(valid_scores) / len(valid_scores)
                    if avg < 50:
                        weak_subjects.append({
                            'subject': subject,
                            'average': round(avg, 2)
                        })
            
            if weak_subjects:
                at_risk.append({
                    'id': student['id'],
                    'name': student['full_name'],
                    'grade': student['grade'],
                    'weak_subjects': weak_subjects
                })
        
        return at_risk
    
    def _analyze_student_performance(self, student_id: int, detailed_scores: Dict) -> Dict:
        """Analyze individual student performance"""
        if not detailed_scores:
            return {
                'overall_average': 0,
                'strong_subjects': [],
                'weak_subjects': [],
                'improving_trends': [],
                'declining_trends': [],
                'performance_level': 'unknown',
                'message_type': 'neutral'
            }
        
        strong_threshold = 70
        weak_threshold = 50
        
        subject_avgs = []
        strong_subjects = []
        weak_subjects = []
        
        for subject, scores in detailed_scores.items():
            student_scores = [
                scores.get('month1', 0) or 0,
                scores.get('month2', 0) or 0,
                scores.get('midterm', 0) or 0,
                scores.get('month3', 0) or 0,
                scores.get('month4', 0) or 0,
                scores.get('final', 0) or 0
            ]
            valid_scores = [s for s in student_scores if s > 0]
            
            if valid_scores:
                avg = sum(valid_scores) / len(valid_scores)
                subject_avgs.append(avg)
                
                if avg >= strong_threshold:
                    strong_subjects.append({'subject': subject, 'average': round(avg, 2)})
                elif avg < weak_threshold:
                    weak_subjects.append({'subject': subject, 'average': round(avg, 2)})
        
        overall_avg = sum(subject_avgs) / len(subject_avgs) if subject_avgs else 0
        
        # Determine performance level
        if overall_avg >= 90:
            performance_level = 'excellent'
        elif overall_avg >= 80:
            performance_level = 'very_good'
        elif overall_avg >= 70:
            performance_level = 'good'
        elif overall_avg >= 60:
            performance_level = 'satisfactory'
        elif overall_avg >= 50:
            performance_level = 'needs_support'
        else:
            performance_level = 'critical'
        
        return {
            'overall_average': round(overall_avg, 2),
            'strong_subjects': sorted(strong_subjects, key=lambda x: x['average'], reverse=True),
            'weak_subjects': sorted(weak_subjects, key=lambda x: x['average']),
            'improving_trends': [],
            'declining_trends': [],
            'performance_level': performance_level,
            'message_type': 'positive' if overall_avg >= 70 else ('warning' if overall_avg >= 50 else 'critical')
        }
    
    def _generate_student_message(self, analysis: Dict) -> Dict:
        """Generate personalized motivational message for student"""
        level = analysis.get('performance_level', 'unknown')
        avg = analysis.get('overall_average', 0)
        
        messages = {
            'excellent': {
                'type': 'encouragement',
                'icon': '🌟',
                'title': 'ممتاز!',
                'message': 'أداء استثنائي! تفوقك مبهر.继续保持努力，你的未来充满希望！'
            },
            'very_good': {
                'type': 'encouragement',
                'icon': '⭐',
                'title': 'جيد جداً',
                'message': 'عمل رائع! أنت في الطريق نحو التميز. استمر بنفس الهمة！'
            },
            'good': {
                'type': 'encouragement',
                'icon': '✅',
                'title': 'جيد',
                'message': 'أداء جيد! يمكنك الوصول للتميز مع مزيد من الجهد.加油！'
            },
            'satisfactory': {
                'type': 'warning',
                'icon': '🟡',
                'title': 'مقبول',
                'message': 'أنت على الطريق الصحيح، لكن هناك مجال للتحسين. حاول التركيز أكثر！'
            },
            'needs_support': {
                'type': 'warning',
                'icon': '⚠️',
                'title': 'يحتاج دعم',
                'message': 'حان وقت العمل الجاد! مع الجهد المناسب، يمكنك تحسين نتائجك.不要放弃！'
            },
            'critical': {
                'type': 'critical',
                'icon': '🚨',
                'title': 'ابدأ الآن',
                'message': 'كل خطوة صغيرة مهمة. اطلب المساعدة من معلميك وزملائك.你一定可以做到的！'
            }
        }
        
        return messages.get(level, messages['satisfactory'])
    
    def _generate_study_suggestions(self, analysis: Dict, grade_level: str) -> List[str]:
        """Generate study suggestions based on performance"""
        suggestions = []
        level = analysis.get('performance_level', 'satisfactory')
        
        if level == 'excellent':
            suggestions = [
                'حافظ على مستواك المتميز',
                'شارك زملائك في الدراسة',
                'استكشف مواضيع إضافية للتعمق'
            ]
        elif level == 'very_good':
            suggestions = [
                'ركّز على نقاط الضعف المحددة',
                'مارس المزيد من التمارين',
                'راجع الدروس بانتظام'
            ]
        elif level == 'good':
            suggestions = [
                'أضف 30 دقيقة يومياً للدراسة',
                'ركز على فهم الأساسيات',
                'اطلب توضيحاً عند الحاجة'
            ]
        elif level == 'satisfactory':
            suggestions = [
                'خصص ساعة إضافية للدراسة يومياً',
                'أنشئ جدولاً زمنياً للدراسة',
                'قسّم المواد إلى أجزاء صغيرة'
            ]
        else:
            suggestions = [
                'اطلب مساعدة المعلم في المواد الصعبة',
                'ادرس ساعتين إلى ثلاث ساعات يومياً',
                'انضم لدراسة جماعية مع الزملاء',
                'راجع الدروس فوراً بعد الحصة'
            ]
        
        # Add grade-level specific suggestions
        if 'ابتدائي' in grade_level:
            suggestions.append('استخدم ألعاب تعليمية وتطبيقات تفاعلية')
        elif 'متوسط' in grade_level or 'اعدادي' in grade_level:
            suggestions.append('نظّم وقتك وخصص أوقاتاً محددة للدراسة')
        elif 'ثانوي' in grade_level:
            suggestions.append('تدرب على أسئلة السنوات السابقة')
        
        return suggestions


class UserService(BaseService):
    """Service for user authentication and management"""
    
    def authenticate_admin(self, username: str, password: str) -> Optional[Dict]:
        """Authenticate admin user"""
        query = "SELECT * FROM users WHERE username = %s AND role = %s"
        user = self._execute_query(query, (username, 'admin'), fetch_one=True)
        
        if user and self._verify_password(password, user['password_hash']):
            return {
                'id': user['id'],
                'username': user['username'],
                'role': user['role']
            }
        return None
    
    def authenticate_school(self, code: str) -> Optional[Dict]:
        """Authenticate school by code"""
        query = "SELECT * FROM schools WHERE code = %s"
        school = self._execute_query(query, (code.upper(),), fetch_one=True)
        
        if school:
            return {
                'id': school['id'],
                'name': school['name'],
                'code': school['code'],
                'role': 'school'
            }
        return None
    
    def _verify_password(self, password: str, hashed_password: str) -> bool:
        """Verify password against hash (supports both Argon2 and bcrypt)"""
        hasher = get_argon2_hasher()
        return hasher.verify_password(password, hashed_password)
    
    def hash_password(self, password: str) -> str:
        """Hash password using Argon2"""
        hasher = get_argon2_hasher()
        return hasher.hash_password(password)
    
    def validate_password_strength(self, password: str) -> Tuple[bool, list]:
        """Validate password strength"""
        return SecurityUtils.validate_password_strength(password)
    
    def migrate_user_passwords(self, batch_size: int = 100) -> Dict:
        """
        Migrate user passwords from bcrypt to Argon2
        
        Args:
            batch_size: Number of users to process in each batch
            
        Returns:
            Migration statistics
        """
        hasher = get_argon2_hasher()
        pool = get_postgresql_pool()
        
        if not pool:
            return {'success': False, 'error': 'Database connection failed'}
        
        conn = pool.get_connection()
        try:
            cur = conn.cursor(dictionary=True)
            
            # Get all users with bcrypt hashes
            cur.execute("""
                SELECT id, username, password_hash, role
                FROM users
                WHERE password_hash LIKE '$2%'
                LIMIT %s
            """, (batch_size,))
            
            users_to_migrate = cur.fetchall()
            migrated_count = 0
            failed_count = 0
            
            for user in users_to_migrate:
                try:
                    # We can't migrate without the original password
                    # This will be done transparently on next login
                    pass
                except Exception as e:
                    failed_count += 1
            
            return {
                'success': True,
                'migrated': migrated_count,
                'failed': failed_count,
                'remaining': len(users_to_migrate) - migrated_count
            }
            
        finally:
            conn.close()

# Service instances for easy access
school_service = SchoolService()
academic_year_service = AcademicYearService()
student_service = StudentService()
teacher_service = TeacherService()
user_service = UserService()
recommendation_service = RecommendationService()

# Export services
__all__ = [
    'SchoolService', 'AcademicYearService', 'StudentService', 
    'TeacherService', 'UserService', 'RecommendationService',
    'school_service', 'academic_year_service', 'student_service', 
    'teacher_service', 'user_service', 'recommendation_service'
]