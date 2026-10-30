"""
Database Seed Script
Populates the database with sample data for development/testing
"""
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta
import random
import json

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()


class DatabaseSeeder:
    """Seed database with sample educational data"""
    
    def __init__(self, db_connection):
        """Initialize seeder with database connection"""
        self.conn = db_connection
        self.cursor = self.conn.cursor(dictionary=True)
        
        # Sample data pools
        self.first_names_male = ['أحمد', 'محمد', 'علي', 'حسين', 'عمر', 'يوسف', 'إبراهيم', 'خالد']
        self.first_names_female = ['فاطمة', 'زينب', 'مريم', 'نور', 'هدى', 'سارة', 'ليلى', 'هند']
        self.last_names = ['محمد', 'علي', 'حسين', 'أحمد', 'كريم', 'رضا', 'ياسين', 'جمال']
        
        self.subjects = [
            'Mathematics', 'Arabic', 'English', 'Science', 
            'History', 'Geography', 'Physics', 'Chemistry',
            'Biology', 'Computer Science', 'Art', 'Physical Education'
        ]
        
        self.grade_levels = [
            'الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي',
            'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي',
            'الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'
        ]
    
    def clear_existing_data(self):
        """Clear existing test data (optional - use with caution)"""
        print("⚠️ Clearing existing data...")
        # TODO: Implement based on your actual table structure
        # self.cursor.execute("DELETE FROM students WHERE school_id IN (...)")
        # self.conn.commit()
    
    def create_schools(self, count=5):
        """Create sample schools"""
        print(f"\n🏫 Creating {count} schools...")
        
        schools = []
        for i in range(count):
            school_name = f"مدرسة {' '.join(random.choice(self.last_names))} {' '.join(random.choice(self.last_names))}"
            
            self.cursor.execute("""
                INSERT INTO schools (name, code, address, phone, email)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                school_name,
                f"SCH-{100 + i:03d}",
                f"{random.randint(1, 999)} شارع التعليم",
                f"+964770{random.randint(1000000, 9999999)}",
                f"school{i}@example.com"
            ))
            
            school_id = self.cursor.lastrowid
            schools.append({'id': school_id, 'name': school_name})
            print(f"  ✅ Created: {school_name}")
        
        self.conn.commit()
        return schools
    
    def create_teachers(self, schools, teachers_per_school=10):
        """Create sample teachers for each school"""
        print(f"\n👨‍🏫 Creating teachers...")
        
        all_teachers = []
        
        for school in schools:
            print(f"  School: {school['name']}")
            
            for i in range(teachers_per_school):
                gender = random.choice(['male', 'female'])
                first_name = random.choice(
                    self.first_names_male if gender == 'male' else self.first_names_female
                )
                last_name = random.choice(self.last_names)
                full_name = f"{first_name} {last_name}"
                
                subject = random.choice(self.subjects)
                
                self.cursor.execute("""
                    INSERT INTO teachers (full_name, email, subject, school_id, code)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    full_name,
                    f"teacher{i}_{school['id']}@example.com",
                    subject,
                    school['id'],
                    f"TCHR-{random.randint(10000, 99999)}-{random.randint(1000, 9999)}"
                ))
                
                teacher_id = self.cursor.lastrowid
                all_teachers.append({
                    'id': teacher_id,
                    'name': full_name,
                    'school_id': school['id'],
                    'subject': subject
                })
            
            self.conn.commit()
        
        print(f"  ✅ Created {len(all_teachers)} teachers")
        return all_teachers
    
    def create_students(self, schools, students_per_school=50):
        """Create sample students for each school"""
        print(f"\n👨‍🎓 Creating students...")
        
        all_students = []
        
        for school in schools:
            print(f"  School: {school['name']}")
            
            for i in range(students_per_school):
                gender = random.choice(['male', 'female'])
                first_name = random.choice(
                    self.first_names_male if gender == 'male' else self.first_names_female
                )
                last_name = random.choice(self.last_names)
                full_name = f"{first_name} {last_name}"
                
                grade_level = random.choice(self.grade_levels)
                
                # Generate date of birth (age 6-15)
                days_ago = random.randint(6*365, 15*365)
                dob = datetime.now() - timedelta(days=days_ago)
                
                self.cursor.execute("""
                    INSERT INTO students (full_name, student_code, grade, school_id, date_of_birth, gender)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    full_name,
                    f"STD-{random.randint(100000, 999999)}",
                    grade_level,
                    school['id'],
                    dob.strftime('%Y-%m-%d'),
                    gender
                ))
                
                student_id = self.cursor.lastrowid
                all_students.append({
                    'id': student_id,
                    'name': full_name,
                    'school_id': school['id'],
                    'grade': grade_level,
                    'gender': gender
                })
            
            self.conn.commit()
        
        print(f"  ✅ Created {len(all_students)} students")
        return all_students
    
    def create_grades(self, students, subjects=None):
        """Create sample grades for students"""
        print(f"\n📊 Creating grades...")
        
        if subjects is None:
            subjects = self.subjects[:6]  # Use first 6 subjects
        
        total_grades = 0
        
        for student in students:
            for subject in subjects:
                # Generate realistic grades
                base_grade = random.gauss(75, 15)  # Mean 75, std dev 15
                base_grade = max(0, min(100, base_grade))  # Clamp to 0-100
                
                detailed_scores = {
                    'month1': round(random.uniform(60, 100), 1),
                    'month2': round(random.uniform(60, 100), 1),
                    'midterm': round(random.uniform(60, 100), 1),
                    'month3': round(random.uniform(60, 100), 1),
                    'month4': round(random.uniform(60, 100), 1),
                    'final': round(base_grade, 1)
                }
                
                try:
                    self.cursor.execute("""
                        INSERT INTO student_grades 
                        (student_id, subject_name, academic_year_id, detailed_scores)
                        VALUES (%s, %s, %s, %s)
                    """, (
                        student['id'],
                        subject,
                        1,  # Default academic year
                        json.dumps(detailed_scores)
                    ))
                    total_grades += 1
                    
                except Exception as e:
                    print(f"    ⚠️ Failed to create grade for {student['name']} - {subject}: {e}")
        
        self.conn.commit()
        print(f"  ✅ Created {total_grades} grade records")
    
    def create_attendance(self, students, days=30):
        """Create sample attendance records"""
        print(f"\n📅 Creating attendance records...")
        
        total_records = 0
        
        for student in students:
            for day in range(days):
                date = datetime.now() - timedelta(days=day)
                
                # 90% attendance rate
                status = 'present' if random.random() < 0.9 else 'absent'
                if status == 'absent' and random.random() < 0.3:
                    status = 'excused'
                
                try:
                    self.cursor.execute("""
                        INSERT INTO attendance 
                        (student_id, date, status, notes)
                        VALUES (%s, %s, %s, %s)
                    """, (
                        student['id'],
                        date.strftime('%Y-%m-%d'),
                        status,
                        None
                    ))
                    total_records += 1
                    
                except Exception as e:
                    pass  # Skip duplicate dates
        
        self.conn.commit()
        print(f"  ✅ Created {total_records} attendance records")
    
    def seed_all(self):
        """Run complete seeding process"""
        print("\n🌱 Starting database seeding...\n")
        print("=" * 60)
        
        # Create entities
        schools = self.create_schools(count=5)
        teachers = self.create_teachers(schools, teachers_per_school=10)
        students = self.create_students(schools, students_per_school=50)
        
        # Get a subset of students for grades/attendance
        sample_students = random.sample(students, min(100, len(students)))
        
        self.create_grades(sample_students)
        self.create_attendance(sample_students, days=30)
        
        print("\n" + "=" * 60)
        print("✅ Database seeding completed successfully!")
        print(f"\nSummary:")
        print(f"  🏫 Schools: {len(schools)}")
        print(f"  👨‍🏫 Teachers: {len(teachers)}")
        print(f"  👨‍🎓 Students: {len(students)}")
        print(f"  📊 Grades: Generated for sample students")
        print(f"  📅 Attendance: Generated for last 30 days")
        print("=" * 60)


def main():
    """Main entry point"""
    print("""
╔══════════════════════════════════════════════════╗
║     EduFlow Database Seeder                      ║
║     Populate database with sample data           ║
╚══════════════════════════════════════════════════╝
    """)
    
    # Import database connection
    from database import DatabaseManager
    
    try:
        # Initialize database connection
        print("🔌 Connecting to database...")
        db_manager = DatabaseManager()
        conn = db_manager.get_connection()
        print("✅ Connected successfully\n")
        
        # Create seeder
        seeder = DatabaseSeeder(conn)
        
        # Check if user wants to clear existing data
        response = input("⚠️ Do you want to clear existing data first? (y/N): ")
        if response.lower() == 'y':
            seeder.clear_existing_data()
        
        # Run seeding
        seeder.seed_all()
        
        # Close connection
        conn.close()
        print("\n✅ Database connection closed")
        
    except Exception as e:
        print(f"\n❌ Seeding failed: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
