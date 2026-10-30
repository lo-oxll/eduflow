"""
Database Indexing Script for EduFlow
Creates recommended indexes for performance optimization on PostgreSQL
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import PostgreSQL connection
try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)


class DatabaseIndexer:
    """Manage database indexes for optimal performance on PostgreSQL"""
    
    def __init__(self):
        """Initialize PostgreSQL connection"""
        self.database_url = os.getenv('DATABASE_URL', '')
        self.postgres_host = os.getenv('POSTGRES_HOST', 'localhost')
        self.postgres_user = os.getenv('POSTGRES_USER', 'postgres')
        self.postgres_password = os.getenv('POSTGRES_PASSWORD', '')
        self.postgres_database = os.getenv('POSTGRES_DATABASE', 'school_db')
        self.postgres_port = os.getenv('POSTGRES_PORT', '5432')
        
        self.conn = None
        self.cursor = None
        self.connect()
    
    def connect(self):
        """Connect to PostgreSQL database"""
        try:
            if self.database_url:
                self.conn = psycopg2.connect(self.database_url)
            else:
                self.conn = psycopg2.connect(
                    host=self.postgres_host,
                    user=self.postgres_user,
                    password=self.postgres_password,
                    database=self.postgres_database,
                    port=self.postgres_port
                )
            
            self.cursor = self.conn.cursor()
            print(f"[OK] Connected to PostgreSQL: {self.postgres_database}")
            
        except Exception as e:
            print(f"[ERROR] Failed to connect to PostgreSQL: {e}")
            sys.exit(1)
    
    def create_indexes(self):
        """Create all recommended indexes for PostgreSQL"""
        print("🔧 Creating database indexes...\n")
        
        indexes_created = []
        
        # Students table indexes
        print("📊 Creating indexes for 'students' table...")
        students_indexes = [
            ("idx_students_school_id", "students", "school_id"),
            ("idx_students_code", "students", "student_code"),
            ("idx_students_grade", "students", "grade"),
            ("idx_students_name", "students", "full_name"),
            ("idx_students_room", "students", "room"),
        ]
        
        for idx_name, table, column in students_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        # Teachers table indexes
        print("\n📊 Creating indexes for 'teachers' table...")
        teachers_indexes = [
            ("idx_teachers_school_id", "teachers", "school_id"),
            ("idx_teachers_code", "teachers", "teacher_code"),
            ("idx_teachers_email", "teachers", "email"),
            ("idx_teachers_grade_level", "teachers", "grade_level"),
        ]
        
        for idx_name, table, column in teachers_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        # Student grades table indexes
        print("\n📊 Creating indexes for 'student_grades' table...")
        grades_indexes = [
            ("idx_grades_student_id", "student_grades", "student_id"),
            ("idx_grades_subject", "student_grades", "subject_name"),
            ("idx_grades_academic_year", "student_grades", "academic_year_id"),
            ("idx_grades_composite", "student_grades", "student_id, subject_name"),
        ]
        
        for idx_name, table, column in grades_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        # Attendance table indexes
        print("\n📊 Creating indexes for 'student_attendance' table...")
        attendance_indexes = [
            ("idx_attendance_student_id", "student_attendance", "student_id"),
            ("idx_attendance_date", "student_attendance", "attendance_date"),
            ("idx_attendance_status", "student_attendance", "status"),
            ("idx_attendance_composite", "student_attendance", "student_id, attendance_date"),
            ("idx_attendance_academic_year", "student_attendance", "academic_year_id"),
        ]
        
        for idx_name, table, column in attendance_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        # Subjects table indexes
        print("\n📊 Creating indexes for 'subjects' table...")
        subjects_indexes = [
            ("idx_subjects_school_id", "subjects", "school_id"),
            ("idx_subjects_grade_level", "subjects", "grade_level"),
            ("idx_subjects_name", "subjects", "name"),
        ]
        
        for idx_name, table, column in subjects_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        # Teacher-Subject relationship indexes
        print("\n📊 Creating indexes for 'teacher_subjects' table...")
        teacher_subjects_indexes = [
            ("idx_teacher_subjects_teacher_id", "teacher_subjects", "teacher_id"),
            ("idx_teacher_subjects_subject_id", "teacher_subjects", "subject_id"),
            ("idx_teacher_subjects_composite", "teacher_subjects", "teacher_id, subject_id"),
        ]
        
        for idx_name, table, column in teacher_subjects_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        # Schools table indexes
        print("\n📊 Creating indexes for 'schools' table...")
        schools_indexes = [
            ("idx_schools_code", "schools", "code"),
            ("idx_schools_name", "schools", "name"),
            ("idx_schools_study_type", "schools", "study_type"),
        ]
        
        for idx_name, table, column in schools_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        # Academic years table index
        print("\n📊 Creating indexes for 'academic_years' table...")
        academic_years_indexes = [
            ("idx_academic_years_active", "academic_years", "is_active"),
            ("idx_academic_years_start", "academic_years", "start_date"),
            ("idx_academic_years_name", "academic_years", "year_name"),
        ]
        
        for idx_name, table, column in academic_years_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        # Additional important indexes
        print("\n📊 Creating additional performance indexes...")
        additional_indexes = [
            # User roles
            ("idx_user_roles_user", "user_roles", "user_id"),
            ("idx_user_roles_role", "user_roles", "role_id"),
            ("idx_user_roles_school", "user_roles", "school_id"),
            
            # Refresh tokens
            ("idx_refresh_tokens_user", "refresh_tokens", "user_id"),
            ("idx_refresh_tokens_expires", "refresh_tokens", "expires_at"),
            
            # Class sections
            ("idx_class_sections_school", "class_sections", "school_id"),
            ("idx_class_sections_grade", "class_sections", "grade_level_id"),
            
            # Teacher assignments
            ("idx_tca_teacher", "teacher_class_assignments", "teacher_id"),
            ("idx_tca_class", "teacher_class_assignments", "class_name"),
            ("idx_tca_academic_year", "teacher_class_assignments", "academic_year_id"),
            
            # Grade levels
            ("idx_grade_levels_school", "grade_levels", "school_id"),
            
            # OAuth accounts
            ("idx_oauth_user", "oauth_accounts", "user_id"),
            ("idx_oauth_provider", "oauth_accounts", "provider"),
        ]
        
        for idx_name, table, column in academic_years_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        for idx_name, table, column in additional_indexes:
            if self._create_index(idx_name, table, column):
                indexes_created.append(f"{table}.{column}")
        
        self.conn.commit()
        self.close()
        
        print("\n" + "=" * 60)
        print(f"✅ Successfully created {len(indexes_created)} indexes!")
        print("=" * 60)
        print("\nCreated indexes:")
        for idx in sorted(indexes_created):
            print(f"  ✓ {idx}")
        print("=" * 60)
    
    def _create_index(self, index_name, table, column):
        """Create a single index if it doesn't exist"""
        try:
            # Check if index exists
            self.cursor.execute("""
                SELECT indexname 
                FROM pg_indexes 
                WHERE tablename = %s 
                AND indexname = %s
            """, (table, index_name))
            
            if self.cursor.fetchone():
                print(f"  ⚠️  Index {index_name} already exists - skipping")
                return False
            
            # Create index
            sql = f"CREATE INDEX {index_name} ON {table} ({column})"
            self.cursor.execute(sql)
            print(f"  ✅ Created index: {index_name}")
            return True
            
        except Exception as e:
            print(f"  ❌ Failed to create {index_name}: {str(e)}")
            self.conn.rollback()
            return False
    
    def drop_indexes(self):
        """Drop all custom indexes (use with caution)"""
        print("⚠️ Dropping all custom indexes...\n")
        
        indexes_to_drop = [
            # Students
            "idx_students_school_id",
            "idx_students_code",
            "idx_students_grade",
            "idx_students_name",
            "idx_students_room",
            # Teachers
            "idx_teachers_school_id",
            "idx_teachers_code",
            "idx_teachers_email",
            "idx_teachers_grade_level",
            # Grades
            "idx_grades_student_id",
            "idx_grades_subject",
            "idx_grades_academic_year",
            "idx_grades_composite",
            # Attendance
            "idx_attendance_student_id",
            "idx_attendance_date",
            "idx_attendance_status",
            "idx_attendance_composite",
            "idx_attendance_academic_year",
            # Subjects
            "idx_subjects_school_id",
            "idx_subjects_grade_level",
            "idx_subjects_name",
            # Teacher-Subjects
            "idx_teacher_subjects_teacher_id",
            "idx_teacher_subjects_subject_id",
            "idx_teacher_subjects_composite",
            # Schools
            "idx_schools_code",
            "idx_schools_name",
            "idx_schools_study_type",
            # Academic Years
            "idx_academic_years_active",
            "idx_academic_years_start",
            "idx_academic_years_name",
            # Additional indexes
            "idx_user_roles_user",
            "idx_user_roles_role",
            "idx_user_roles_school",
            "idx_refresh_tokens_user",
            "idx_refresh_tokens_expires",
            "idx_class_sections_school",
            "idx_class_sections_grade",
            "idx_tca_teacher",
            "idx_tca_class",
            "idx_tca_academic_year",
            "idx_grade_levels_school",
            "idx_oauth_user",
            "idx_oauth_provider",
        ]
        
        dropped_count = 0
        
        for index_name in indexes_to_drop:
            try:
                self.cursor.execute(f"DROP INDEX IF EXISTS {index_name}")
                print(f"  ✅ Dropped: {index_name}")
                dropped_count += 1
            except Exception as e:
                print(f"  ⚠️  Could not drop {index_name}: {str(e)}")
        
        self.conn.commit()
        self.close()
        
        print("\n" + "=" * 60)
        print(f"✅ Dropped {dropped_count} indexes!")
        print("=" * 60)
    
    def show_index_stats(self):
        """Show index usage statistics"""
        print("📊 Index Statistics:\n")
        
        self.cursor.execute("""
            SELECT 
                schemaname,
                tablename,
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY tablename, indexname
        """)
        
        indexes = self.cursor.fetchall()
        
        current_table = None
        for idx in indexes:
            if idx[1] != current_table:
                current_table = idx[1]
                print(f"\n📁 Table: {current_table}")
                print("-" * 60)
            
            print(f"  Index: {idx[2]:35} | Definition: {idx[3][:60]}...")
        
        self.close()


    def close(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        print("\n[OK] Database connection closed")


def help():
    """Show help"""
    print("""
╔══════════════════════════════════════════════════╗
║     EduFlow Database Index Manager               ║
╚══════════════════════════════════════════════════╝

Usage:
    python scripts/create_indexes.py [command]

Commands:
    create    Create all recommended indexes
    drop      Drop all custom indexes (dangerous!)
    stats     Show index statistics
    help      Show this help

Examples:
    python scripts/create_indexes.py create
    python scripts/create_indexes.py stats

Notes:
    - Indexes improve query performance significantly
    - Creating indexes on large tables may take time
    - Always backup before dropping indexes
    """)


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        help()
        return
    
    command = sys.argv[1]
    
    indexer = DatabaseIndexer()
    
    if command == "create":
        indexer.create_indexes()
    
    elif command == "drop":
        confirm = input("⚠️ Are you sure you want to drop ALL indexes? (yes/no): ")
        if confirm.lower() == "yes":
            indexer.drop_indexes()
        else:
            print("❌ Operation cancelled")
    
    elif command == "stats":
        indexer.show_index_stats()
    
    elif command == "help":
        help()
    
    else:
        print(f"❌ Unknown command: {command}")
        help()
        sys.exit(1)


if __name__ == "__main__":
    main()
