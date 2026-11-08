-- EduFlow schema for Supabase (generated from core/database.py create_tables, PostgreSQL dialect).
-- Run once in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  must_change_password BOOLEAN DEFAULT TRUE,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret VARCHAR(255),
  two_factor_enforced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  jti VARCHAR(64) UNIQUE NOT NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP NULL,
  replaced_by_token_jti VARCHAR(64),
  ip_address VARCHAR(45),
  user_agent TEXT,
  two_factor_verified BOOLEAN DEFAULT FALSE
  );

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) UNIQUE NOT NULL,
  role_name_ar VARCHAR(100) NOT NULL,
  description TEXT,
  is_system_role BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  permission_code VARCHAR(100) UNIQUE NOT NULL,
  permission_name VARCHAR(255) NOT NULL,
  permission_name_ar VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT
  );

CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
  );

CREATE TABLE IF NOT EXISTS schools (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NULL,
  study_type VARCHAR(100) NOT NULL,
  level VARCHAR(100) NOT NULL,
  gender_type VARCHAR(50) NOT NULL,
  is_suspended INT DEFAULT 0,
  suspended_at TIMESTAMP NULL,
  suspended_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  school_id INT NULL,
  granted_by INT NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE SET NULL,
  FOREIGN KEY(granted_by) REFERENCES users(id) ON DELETE RESTRICT
  );

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  scopes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_user_id),
  UNIQUE(user_id, provider)
  );

CREATE TABLE IF NOT EXISTS user_backup_codes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS password_history (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  student_code VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NULL,
  grade VARCHAR(50) NOT NULL,
  branch VARCHAR(100),
  room VARCHAR(100) NOT NULL,
  enrollment_date DATE,
  parent_contact VARCHAR(255),
  blood_type VARCHAR(10),
  chronic_disease TEXT,
  detailed_scores JSONB,
  daily_attendance JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE(school_id, full_name, grade, room)
  );

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  grade_level VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS grade_levels (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS class_sections (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL,
  grade_level_id INT,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY(grade_level_id) REFERENCES grade_levels(id) ON DELETE SET NULL,
  UNIQUE(school_id, grade_level_id, name)
  );

CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  teacher_code VARCHAR(50) UNIQUE NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  password_hash VARCHAR(255),
  grade_level VARCHAR(100),
  specialization VARCHAR(255),
  free_text_subjects TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id SERIAL PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(teacher_id, subject_id)
  );

CREATE TABLE IF NOT EXISTS system_academic_years (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  start_year INT NOT NULL,
  end_year INT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_current INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS teacher_class_assignments (
  id SERIAL PRIMARY KEY,
  teacher_id INT NOT NULL,
  class_name VARCHAR(255) NOT NULL,
  subject_id INT NOT NULL,
  academic_year_id INT,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY(academic_year_id) REFERENCES system_academic_years(id) ON DELETE SET NULL,
  UNIQUE(teacher_id, class_name, subject_id, academic_year_id)
  );

CREATE TABLE IF NOT EXISTS legacy_academic_years (
  id SERIAL PRIMARY KEY,
  school_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  start_year INT NOT NULL,
  end_year INT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_current INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS student_grades (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  month1 INT DEFAULT 0,
  month2 INT DEFAULT 0,
  midterm INT DEFAULT 0,
  month3 INT DEFAULT 0,
  month4 INT DEFAULT 0,
  final INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(academic_year_id) REFERENCES system_academic_years(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS student_attendance (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(academic_year_id) REFERENCES system_academic_years(id) ON DELETE CASCADE,
  UNIQUE(student_id, academic_year_id, attendance_date)
  );

CREATE TABLE IF NOT EXISTS academic_years (
  id SERIAL PRIMARY KEY,
  year_name VARCHAR(50) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS student_enrollments (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  grade_level_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  enrollment_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(grade_level_id) REFERENCES grade_levels(id) ON DELETE CASCADE,
  FOREIGN KEY(academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  UNIQUE(student_id, grade_level_id, academic_year_id)
  );

CREATE TABLE IF NOT EXISTS academic_history (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  grade_level_id INT NOT NULL,
  subject_id INT NOT NULL,
  final_grade DECIMAL(5,2) NOT NULL,
  teacher_notes TEXT,
  status VARCHAR(20) DEFAULT 'IN_PROGRESS',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  FOREIGN KEY(grade_level_id) REFERENCES grade_levels(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS current_grades (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  term_id INT,
  grade_type VARCHAR(20) NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) DEFAULT 10.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY(academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
  );

CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_refresh_user_id ON refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_jti ON refresh_tokens(jti);

CREATE INDEX IF NOT EXISTS idx_backup_codes_user ON user_backup_codes(user_id);

CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id);

ALTER TABLE schools ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_suspended INT DEFAULT 0;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP NULL;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS suspended_reason TEXT NULL;

ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);

CREATE INDEX IF NOT EXISTS idx_students_code ON students(student_code);

CREATE INDEX IF NOT EXISTS idx_students_grade ON students(grade);

CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name);

CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);

CREATE INDEX IF NOT EXISTS idx_subjects_grade_level ON subjects(grade_level);

CREATE INDEX IF NOT EXISTS idx_grade_levels_school ON grade_levels(school_id);

CREATE INDEX IF NOT EXISTS idx_class_sections_school ON class_sections(school_id);

CREATE INDEX IF NOT EXISTS idx_class_sections_grade ON class_sections(grade_level_id);

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);

CREATE INDEX IF NOT EXISTS idx_teachers_code ON teachers(teacher_code);

CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher ON teacher_subjects(teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject ON teacher_subjects(subject_id);

CREATE INDEX IF NOT EXISTS idx_tca_teacher ON teacher_class_assignments(teacher_id);

CREATE INDEX IF NOT EXISTS idx_tca_academic_year ON teacher_class_assignments(academic_year_id);

CREATE INDEX IF NOT EXISTS idx_system_ay_current ON system_academic_years(is_current);

CREATE INDEX IF NOT EXISTS idx_system_ay_name ON system_academic_years(name);

CREATE INDEX IF NOT EXISTS idx_ay_school ON legacy_academic_years(school_id);

CREATE INDEX IF NOT EXISTS idx_ay_current ON legacy_academic_years(is_current);

CREATE INDEX IF NOT EXISTS idx_sg_student ON student_grades(student_id);

CREATE INDEX IF NOT EXISTS idx_sg_subject ON student_grades(subject_name);

CREATE INDEX IF NOT EXISTS idx_sg_academic_year ON student_grades(academic_year_id);

CREATE INDEX IF NOT EXISTS idx_sg_composite ON student_grades(student_id, subject_name);

CREATE INDEX IF NOT EXISTS idx_sa_student ON student_attendance(student_id);

CREATE INDEX IF NOT EXISTS idx_sa_date ON student_attendance(attendance_date);

CREATE INDEX IF NOT EXISTS idx_sa_status ON student_attendance(status);

CREATE INDEX IF NOT EXISTS idx_sa_composite ON student_attendance(student_id, attendance_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sg_unique ON student_grades(student_id, academic_year_id, subject_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_unique ON student_attendance(student_id, academic_year_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_ay_active ON academic_years(is_active);

CREATE INDEX IF NOT EXISTS idx_ay_year_name ON academic_years(year_name);

CREATE INDEX IF NOT EXISTS idx_se_student ON student_enrollments(student_id, status);

CREATE INDEX IF NOT EXISTS idx_se_academic_year ON student_enrollments(academic_year_id, status);

CREATE INDEX IF NOT EXISTS idx_ah_student ON academic_history(student_id, academic_year_id);

CREATE INDEX IF NOT EXISTS idx_ah_subject ON academic_history(academic_year_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_ah_all ON academic_history(student_id);

CREATE INDEX IF NOT EXISTS idx_cg_student ON current_grades(student_id, academic_year_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_cg_current ON current_grades(student_id, academic_year_id);

-- Lock down the public Data API: the app reaches Postgres only via the Edge Function (direct connection), never via the anon key.
alter table public.users enable row level security;
alter table public.refresh_tokens enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.schools enable row level security;
alter table public.user_roles enable row level security;
alter table public.oauth_accounts enable row level security;
alter table public.user_backup_codes enable row level security;
alter table public.password_history enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.grade_levels enable row level security;
alter table public.class_sections enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.system_academic_years enable row level security;
alter table public.teacher_class_assignments enable row level security;
alter table public.legacy_academic_years enable row level security;
alter table public.student_grades enable row level security;
alter table public.student_attendance enable row level security;
alter table public.academic_years enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.academic_history enable row level security;
alter table public.current_grades enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
