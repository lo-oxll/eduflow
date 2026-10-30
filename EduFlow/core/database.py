import os
import re
import secrets
import datetime
import time
import random
import string
import bcrypt
import sqlite3
from dotenv import load_dotenv
from urllib.parse import urlparse

load_dotenv()


def _normalize_database_url(url: str) -> str:
    """Normalize provider connection strings for psycopg2.

    Accepts the legacy ``postgres://`` scheme and adds ``sslmode=require`` for
    Supabase hosts, which reject unencrypted connections.
    """
    if not url:
        return url

    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]

    host = (urlparse(url).hostname or '').lower()
    if ('supabase.co' in host or 'supabase.com' in host) and 'sslmode=' not in url:
        separator = '&' if urlparse(url).query else '?'
        url = f"{url}{separator}sslmode=require"

    return url


def _is_production() -> bool:
    return os.getenv('NODE_ENV', 'development').lower() == 'production'


# Database configuration
DATABASE_URL = _normalize_database_url(os.getenv('DATABASE_URL', ''))
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'postgres')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', '')
POSTGRES_DATABASE = os.getenv('POSTGRES_DATABASE', 'school_db')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', 5432))
SQLITE_PATH = os.getenv('SQLITE_PATH', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'school.db'))

# Connection pool settings
DB_POOL_MIN_SIZE = int(os.getenv('DB_POOL_MIN_SIZE', 5))
DB_POOL_MAX_SIZE = int(os.getenv('DB_POOL_MAX_SIZE', 20))
DB_POOL_TIMEOUT = int(os.getenv('DB_POOL_TIMEOUT', 30))

_postgresql_pool = None
_use_sqlite = False

# SQLite adapter class to mimic PostgreSQL connection pool interface
class SQLiteConnectionWrapper:
    def __init__(self, path):
        self.path = path
        self._conn = None
    
    def getconn(self):
        """Get a connection - mimics PostgreSQL pool interface"""
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return SQLiteConnection(conn)
    
    def putconn(self, conn):
        """Return connection to pool - mimics PostgreSQL pool interface"""
        # For SQLite, just close the connection as there's no pooling
        try:
            conn.close()
        except:
            pass

    def get_connection(self):
        return self.getconn()

    def return_connection(self, conn):
        self.putconn(conn)


class _PgConnAdapter:
    """Adapts a psycopg2 connection to the mysql-style API used by server.py
    (conn.cursor(dictionary=True); conn.close() returns it to the pool)."""
    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool

    def cursor(self, dictionary=False):
        if dictionary:
            from psycopg2.extras import RealDictCursor
            return self._conn.cursor(cursor_factory=RealDictCursor)
        return self._conn.cursor()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        try:
            self._pool.putconn(self._conn)
        except Exception:
            pass


class _PgPoolFacade:
    """Wraps a psycopg2 ThreadedConnectionPool exposing get_connection/putconn."""
    def __init__(self, pool):
        self._pool = pool

    def getconn(self):
        return _PgConnAdapter(self._pool.getconn(), self._pool)

    def putconn(self, conn):
        raw = conn._conn if isinstance(conn, _PgConnAdapter) else conn
        try:
            self._pool.putconn(raw)
        except Exception:
            pass

    def get_connection(self):
        return self.getconn()

    def return_connection(self, conn):
        self.putconn(conn)

    def closeall(self):
        self._pool.closeall()

_DDL_RE = re.compile(r'^\s*(CREATE|ALTER)\s', re.IGNORECASE)

_DDL_TRANSLATIONS = (
    (re.compile(r'\bSERIAL\s+PRIMARY\s+KEY\b', re.IGNORECASE), 'INTEGER PRIMARY KEY AUTOINCREMENT'),
    (re.compile(r'\bSERIAL\b', re.IGNORECASE), 'INTEGER'),
    (re.compile(r'\bJSONB\b', re.IGNORECASE), 'TEXT'),
    (re.compile(r'\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b', re.IGNORECASE), ''),
    (re.compile(r'\bINT\b', re.IGNORECASE), 'INTEGER'),
)


def _translate_ddl(query):
    """Rewrite PostgreSQL DDL types into SQLite equivalents (schema statements only)."""
    for pattern, replacement in _DDL_TRANSLATIONS:
        query = pattern.sub(replacement, query)
    return query


class SQLiteConnection:
    def __init__(self, conn):
        self._conn = conn
        try:
            # SQLite disables FK enforcement by default; orphans were possible before
            self._conn.execute('PRAGMA foreign_keys = ON')
        except sqlite3.Error:
            pass
    
    def cursor(self, dictionary=False):
        return SQLiteCursor(self._conn.cursor(), dictionary)
    
    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

class SQLiteCursor:
    def __init__(self, cursor, dictionary=False):
        self._cursor = cursor
        self._dictionary = dictionary
        self.lastrowid = None
        self.rowcount = 0
    
    def close(self):
        """Close the cursor - mimics PostgreSQL cursor interface"""
        try:
            self._cursor.close()
        except:
            pass
    
    def execute(self, query, params=None):
        # Translate PostgreSQL placeholders to SQLite ones (queries only, never data)
        query = query.replace('%s', '?')
        # DDL emitted by create_tables() is written in PostgreSQL syntax; translate
        # type names only for schema statements so data queries stay untouched.
        if _DDL_RE.match(query):
            query = _translate_ddl(query)

        if params:
            self._cursor.execute(query, params)
        else:
            self._cursor.execute(query)
        self.lastrowid = self._cursor.lastrowid
        self.rowcount = self._cursor.rowcount
    
    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        if self._dictionary:
            return dict(row)
        return tuple(row)
    
    def fetchall(self):
        rows = self._cursor.fetchall()
        if self._dictionary:
            return [dict(row) for row in rows]
        return [tuple(row) for row in rows]

def get_postgresql_pool():
    """Get PostgreSQL connection pool - PRIMARY DATABASE FOR PRODUCTION"""
    global _postgresql_pool, _use_sqlite
    
    # Return existing pool if available
    if _postgresql_pool:
        return _postgresql_pool
    
    # If already determined to use SQLite, return SQLite wrapper
    if _use_sqlite:
        return SQLiteConnectionWrapper(SQLITE_PATH)
    
    try:
        import psycopg2
        from psycopg2 import pool
        
        # Use DATABASE_URL if provided
        if DATABASE_URL:
            print(f"[INFO] Connecting to PostgreSQL via DATABASE_URL...")
            _postgresql_pool = pool.ThreadedConnectionPool(
                DB_POOL_MIN_SIZE, DB_POOL_MAX_SIZE,
                dsn=DATABASE_URL,
                connect_timeout=DB_POOL_TIMEOUT
            )
        else:
            # Use individual connection parameters
            print(f"[INFO] Connecting to PostgreSQL via individual parameters...")
            connect_kwargs = {
                'host': POSTGRES_HOST,
                'user': POSTGRES_USER,
                'password': POSTGRES_PASSWORD,
                'database': POSTGRES_DATABASE,
                'port': POSTGRES_PORT,
                'connect_timeout': DB_POOL_TIMEOUT,
            }
            if 'supabase.co' in POSTGRES_HOST.lower() or 'supabase.com' in POSTGRES_HOST.lower():
                connect_kwargs['sslmode'] = 'require'
            _postgresql_pool = pool.ThreadedConnectionPool(
                DB_POOL_MIN_SIZE, DB_POOL_MAX_SIZE, **connect_kwargs
            )
        
        # Test the connection
        conn = _postgresql_pool.getconn()
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        db_version = cursor.fetchone()[0]
        cursor.close()
        _postgresql_pool.putconn(conn)
        
        print(f"[OK] Using PostgreSQL database: {POSTGRES_DATABASE}")
        print(f"[OK] PostgreSQL version: {db_version[:50]}...")
        _postgresql_pool = _PgPoolFacade(_postgresql_pool)
        return _postgresql_pool
        
    except Exception as e:
        if _is_production():
            raise RuntimeError(
                'PostgreSQL is required in production but the connection failed: '
                f'{e}. Check DATABASE_URL / POSTGRES_* and SSL settings.'
            ) from e
        print(f"[WARN] PostgreSQL connection failed: {e}")
        print(f"[WARN] Falling back to SQLite for local development: {SQLITE_PATH}")
        print(f"[CRITICAL] PostgreSQL is REQUIRED for production deployment!")
        _use_sqlite = True
        return SQLiteConnectionWrapper(SQLITE_PATH)

def _sqlite_ensure_legacy_columns(conn):
    """Backfill legacy SQLite schemas created before newer auth columns existed."""
    if not isinstance(conn, SQLiteConnection):
        return

    def _table_columns(table_name):
        cur = conn.cursor()
        try:
            cur.execute(f'PRAGMA table_info({table_name})')
            return {row[1] for row in cur.fetchall()}
        finally:
            cur.close()

    table_columns = {
        'users': (
            ('must_change_password', 'BOOLEAN DEFAULT TRUE'),
            ('two_factor_enabled', 'BOOLEAN DEFAULT FALSE'),
            ('two_factor_secret', 'VARCHAR(255)'),
            ('two_factor_enforced', 'BOOLEAN DEFAULT FALSE'),
            ('updated_at', 'TIMESTAMP'),
        ),
        'academic_years': (
            ('year_name', 'VARCHAR(50) DEFAULT ""'),
            ('is_active', 'BOOLEAN DEFAULT FALSE'),
            ('start_date', 'DATE'),
            ('end_date', 'DATE'),
        ),
    }

    for table_name, columns in table_columns.items():
        try:
            existing = _table_columns(table_name)
        except sqlite3.Error:
            continue

        for column_name, definition in columns:
            if column_name in existing:
                continue
            try:
                cursor = conn.cursor()
                cursor.execute(f'ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}')
                cursor.close()
                print(f'[INFO] Added missing SQLite column: {table_name}.{column_name}')
            except sqlite3.Error as exc:
                print(f'[WARN] Could not add missing SQLite column {table_name}.{column_name}: {exc}')

    try:
        conn.commit()
    except sqlite3.Error:
        pass


def init_db():
    create_tables()


def get_mysql_pool():
    """Legacy alias: server.py was written against a MySQL pool API.
    Returns the active connection pool (PostgreSQL in prod, SQLite in dev)."""
    return get_postgresql_pool()


def get_database_dialect():
    """Return the dialect of the active backend: 'postgresql' or 'sqlite'."""
    global _use_sqlite
    if not _use_sqlite:
        get_postgresql_pool()
    return 'sqlite' if _use_sqlite else 'postgresql'


def group_concat_sql(expression, separator=','):
    """Dialect-aware GROUP_CONCAT replacement (PostgreSQL needs STRING_AGG)."""
    if get_database_dialect() == 'postgresql':
        return f"STRING_AGG({expression}::text, '{separator}')"
    return f"GROUP_CONCAT({expression}, '{separator}')"


def get_database_info():
    dialect = get_database_dialect()
    if dialect == 'postgresql':
        host, port, database = POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DATABASE
        if DATABASE_URL:
            parsed = urlparse(DATABASE_URL)
            host = parsed.hostname or host
            port = parsed.port or port
            database = (parsed.path or '/').lstrip('/') or database
        target = f"{host}:{port}/{database}"
    else:
        target = SQLITE_PATH
    return {'dialect': dialect, 'target': target, 'production_ready': dialect == 'postgresql'}

def create_tables():
    pool = get_postgresql_pool()
    if not pool:
        return
    
    conn = None
    cursor = None
    try:
        conn = pool.getconn()
        if isinstance(conn, SQLiteConnection):
            _sqlite_ensure_legacy_columns(conn)
        cursor = conn.cursor()
        
        print("[INFO] Creating database tables...")
        
        # Enable foreign keys (PostgreSQL enforces by default)
        # No need for PRAGMA like SQLite
        
        # Create users table
        cursor.execute('''CREATE TABLE IF NOT EXISTS users (
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
        )''')

        # Create refresh_tokens table for enhanced token management
        cursor.execute('''CREATE TABLE IF NOT EXISTS refresh_tokens (
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
        )''')
        
        # Create indexes for refresh_tokens (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_refresh_token_hash ON refresh_tokens(token_hash)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_refresh_user_id ON refresh_tokens(user_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_refresh_jti ON refresh_tokens(jti)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Create roles table for RBAC
        cursor.execute('''CREATE TABLE IF NOT EXISTS roles (
          id SERIAL PRIMARY KEY,
          role_name VARCHAR(50) UNIQUE NOT NULL,
          role_name_ar VARCHAR(100) NOT NULL,
          description TEXT,
          is_system_role BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')

        # Create permissions table for RBAC
        cursor.execute('''CREATE TABLE IF NOT EXISTS permissions (
          id SERIAL PRIMARY KEY,
          permission_code VARCHAR(100) UNIQUE NOT NULL,
          permission_name VARCHAR(255) NOT NULL,
          permission_name_ar VARCHAR(255) NOT NULL,
          resource_type VARCHAR(50) NOT NULL,
          action VARCHAR(50) NOT NULL,
          description TEXT
        )''')

        # Create role_permissions junction table
        cursor.execute('''CREATE TABLE IF NOT EXISTS role_permissions (
          id SERIAL PRIMARY KEY,
          role_id INT NOT NULL,
          permission_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
          FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
          UNIQUE(role_id, permission_id)
        )''')

        # Create user_roles table for role assignments
        cursor.execute('''CREATE TABLE IF NOT EXISTS user_roles (
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
        )''')

        # Create oauth_accounts table for OAuth2 integration
        cursor.execute('''CREATE TABLE IF NOT EXISTS oauth_accounts (
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
        )''')
        
        # Create user_backup_codes table for 2FA recovery
        cursor.execute('''CREATE TABLE IF NOT EXISTS user_backup_codes (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          code_hash VARCHAR(255) NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          used_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )''')
        
        # Create index for user_backup_codes
        try:
            cursor.execute('CREATE INDEX idx_backup_codes_user ON user_backup_codes(user_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        
        # Create password_history table for tracking password changes
        cursor.execute('''CREATE TABLE IF NOT EXISTS password_history (
          id SERIAL PRIMARY KEY,
          user_id INT NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )''')
        
        # Create index for password_history
        try:
            cursor.execute('CREATE INDEX idx_password_history_user ON password_history(user_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Create schools table
        cursor.execute('''CREATE TABLE IF NOT EXISTS schools (
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
        )''')

        try:
            cursor.execute("ALTER TABLE schools ADD COLUMN password_hash VARCHAR(255) NULL")
        except Exception as e:
            if 'duplicate column' not in str(e).lower() and 'already exists' not in str(e).lower():
                print(f"[INFO] schools.password_hash: {e}")
        
        # Add is_suspended column if it doesn't exist (for existing databases)
        try:
            cursor.execute("ALTER TABLE schools ADD COLUMN is_suspended INT DEFAULT 0")
        except Exception as e:
            if 'duplicate column' not in str(e).lower():
                print(f"[INFO] is_suspended column already exists or error: {e}")
        
        try:
            cursor.execute("ALTER TABLE schools ADD COLUMN suspended_at TIMESTAMP NULL")
        except Exception as e:
            if 'duplicate column' not in str(e).lower():
                print(f"[INFO] suspended_at column already exists or error: {e}")
        
        try:
            cursor.execute("ALTER TABLE schools ADD COLUMN suspended_reason TEXT NULL")
        except Exception as e:
            if 'duplicate column' not in str(e).lower():
                print(f"[INFO] suspended_reason column already exists or error: {e}")

        # Create students table
        cursor.execute('''CREATE TABLE IF NOT EXISTS students (
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
        )''')

        try:
            cursor.execute("ALTER TABLE students ADD COLUMN password_hash VARCHAR(255) NULL")
        except Exception as e:
            if 'duplicate column' not in str(e).lower() and 'already exists' not in str(e).lower():
                print(f"[INFO] students.password_hash: {e}")
        
        # Create indexes for students table (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_students_school_id ON students(school_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_students_code ON students(student_code)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_students_grade ON students(grade)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_students_name ON students(full_name)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        
        # Add new columns to existing students table if they don't exist (for migration)
        # SQLite has limited ALTER TABLE support - skip for now
        # try:
        #     cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_contact VARCHAR(255)")
        # except Exception as e:
        #     print(f"[INFO] Parent contact column migration: {e}")
        # try:
        #     cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_type VARCHAR(10)")
        # except Exception as e:
        #     print(f"[INFO] Blood type column migration: {e}")
        # try:
        #     cursor.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS chronic_disease TEXT")
        # except Exception as e:
        #     print(f"[INFO] Chronic disease column migration: {e}")
        # try:
        #     cursor.execute("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS free_text_subjects TEXT")
        # except Exception as e:
        #     print(f"[INFO] Free text subjects column migration: {e}")
        
        # Add unique constraint to prevent duplicate students (same name, grade, room, school)
        # SQLite doesn't support adding constraints after table creation
        # try:
        #     cursor.execute("ALTER TABLE students ADD CONSTRAINT unique_student_school_grade_room UNIQUE (school_id, full_name, grade, room)")
        # except Exception as e:
        #     print(f"[INFO] Unique constraint already exists: {e}")
        
        # Migration: Ensure grade_level column allows NULL values
        # SQLite doesn't support ALTER COLUMN
        # try:
        #     cursor.execute("ALTER TABLE teachers ALTER COLUMN grade_level DROP NOT NULL")
        # except Exception as e:
        #     print(f"[INFO] Grade level column migration skipped: {e}")

        # Create subjects table
        cursor.execute('''CREATE TABLE IF NOT EXISTS subjects (
          id SERIAL PRIMARY KEY,
          school_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          grade_level VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
        )''')
        
        # Create indexes for subjects table (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_subjects_school ON subjects(school_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_subjects_grade_level ON subjects(grade_level)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Create grade_levels table for custom grade levels per school
        cursor.execute('''CREATE TABLE IF NOT EXISTS grade_levels (
          id SERIAL PRIMARY KEY,
          school_id INT NOT NULL,
          name VARCHAR(255) NOT NULL,
          display_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
        )''')
        
        # Create indexes for grade_levels (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_grade_levels_school ON grade_levels(school_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Create class_sections table to normalize class/room per grade and school
        cursor.execute('''CREATE TABLE IF NOT EXISTS class_sections (
          id SERIAL PRIMARY KEY,
          school_id INT NOT NULL,
          grade_level_id INT,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE,
          FOREIGN KEY(grade_level_id) REFERENCES grade_levels(id) ON DELETE SET NULL,
          UNIQUE(school_id, grade_level_id, name)
        )''')
        
        # Create indexes for class_sections (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_class_sections_school ON class_sections(school_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_class_sections_grade ON class_sections(grade_level_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Create teachers table for managing teachers and their subjects
        cursor.execute('''CREATE TABLE IF NOT EXISTS teachers (
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
        )''')
        
        # Create indexes for teachers table (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute("ALTER TABLE teachers ADD COLUMN password_hash VARCHAR(255) NULL")
        except Exception as e:
            if 'duplicate column' not in str(e).lower() and 'already exists' not in str(e).lower():
                print(f"[INFO] teachers.password_hash: {e}")
        try:
            cursor.execute('CREATE INDEX idx_teachers_school ON teachers(school_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_teachers_code ON teachers(teacher_code)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_teachers_email ON teachers(email)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Create teacher_subjects table for many-to-many relationship
        cursor.execute('''CREATE TABLE IF NOT EXISTS teacher_subjects (
          id SERIAL PRIMARY KEY,
          teacher_id INT NOT NULL,
          subject_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
          FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
          UNIQUE(teacher_id, subject_id)
        )''')
        
        # Create indexes for teacher_subjects (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_teacher_subjects_teacher ON teacher_subjects(teacher_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_teacher_subjects_subject ON teacher_subjects(subject_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Create teacher_class_assignments table for tracking which teachers teach which classes
        cursor.execute('''CREATE TABLE IF NOT EXISTS teacher_class_assignments (
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
        )''')
        
        # Create indexes for teacher_class_assignments (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_tca_teacher ON teacher_class_assignments(teacher_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_tca_academic_year ON teacher_class_assignments(academic_year_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Create system_academic_years table for centralized academic year management
        cursor.execute('''CREATE TABLE IF NOT EXISTS system_academic_years (
          id SERIAL PRIMARY KEY,
          name VARCHAR(50) NOT NULL UNIQUE,
          start_year INT NOT NULL,
          end_year INT NOT NULL,
          start_date DATE,
          end_date DATE,
          is_current INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')
        
        # Create indexes for system_academic_years (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_system_ay_current ON system_academic_years(is_current)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_system_ay_name ON system_academic_years(name)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        
        # Legacy: Keep academic_years table for backward compatibility during migration
        # Renamed to legacy_academic_years to avoid conflict with new academic_history system
        cursor.execute('''CREATE TABLE IF NOT EXISTS legacy_academic_years (
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
        )''')
        
        # Create indexes for legacy_academic_years (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_ay_school ON legacy_academic_years(school_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_ay_current ON legacy_academic_years(is_current)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        
        # Create student_grades table for storing grades per academic year
        cursor.execute('''CREATE TABLE IF NOT EXISTS student_grades (
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
        )''')
        
        # Create indexes for student_grades (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_sg_student ON student_grades(student_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_sg_subject ON student_grades(subject_name)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_sg_academic_year ON student_grades(academic_year_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_sg_composite ON student_grades(student_id, subject_name)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        
        # Create student_attendance table for storing attendance per academic year
        cursor.execute('''CREATE TABLE IF NOT EXISTS student_attendance (
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
        )''')
        
        # Create indexes for student_attendance (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_sa_student ON student_attendance(student_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_sa_date ON student_attendance(attendance_date)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_sa_status ON student_attendance(status)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_sa_composite ON student_attendance(student_id, attendance_date)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Remove duplicate grade/attendance rows left by the old read-then-insert
        # flow, then enforce one row per key so writes can use ON CONFLICT.
        try:
            cursor.execute('''DELETE FROM student_grades WHERE id NOT IN (
                SELECT MAX(id) FROM student_grades
                GROUP BY student_id, academic_year_id, subject_name)''')
            conn.commit()
        except Exception as e:
            print(f"[WARN] Could not deduplicate student_grades: {e}")
        try:
            cursor.execute('CREATE UNIQUE INDEX idx_sg_unique ON student_grades(student_id, academic_year_id, subject_name)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create unique index on student_grades: {e}")
        try:
            cursor.execute('''DELETE FROM student_attendance WHERE id NOT IN (
                SELECT MAX(id) FROM student_attendance
                GROUP BY student_id, academic_year_id, attendance_date)''')
            conn.commit()
        except Exception as e:
            print(f"[WARN] Could not deduplicate student_attendance: {e}")
        try:
            cursor.execute('CREATE UNIQUE INDEX idx_sa_unique ON student_attendance(student_id, academic_year_id, attendance_date)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create unique index on student_attendance: {e}")
        
        # ==========================================
        # Academic History Management Tables
        # These tables properly separate current grades from permanent academic records
        # ==========================================
        
        # 1. academic_years - Centralized academic year management (system-wide)
        cursor.execute('''CREATE TABLE IF NOT EXISTS academic_years (
          id SERIAL PRIMARY KEY,
          year_name VARCHAR(50) NOT NULL UNIQUE,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_active BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )''')
        
        # Create indexes for academic_years (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_ay_active ON academic_years(is_active)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_ay_year_name ON academic_years(year_name)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        
        # 2. student_enrollments - Student enrollment tracking per academic year
        cursor.execute('''CREATE TABLE IF NOT EXISTS student_enrollments (
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
        )''')
        
        # Create indexes for student_enrollments (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_se_student ON student_enrollments(student_id, status)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_se_academic_year ON student_enrollments(academic_year_id, status)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        
        # 3. academic_history - Permanent academic records (read-only after creation)
        cursor.execute('''CREATE TABLE IF NOT EXISTS academic_history (
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
        )''')
        
        # Create indexes for academic_history (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_ah_student ON academic_history(student_id, academic_year_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_ah_subject ON academic_history(academic_year_id, subject_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_ah_all ON academic_history(student_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        
        # 4. current_grades - Active grades for current academic year
        cursor.execute('''CREATE TABLE IF NOT EXISTS current_grades (
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
        )''')
        
        # Create indexes for current_grades (SQLite doesn't support IF NOT EXISTS)
        try:
            cursor.execute('CREATE INDEX idx_cg_student ON current_grades(student_id, academic_year_id, subject_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")
        try:
            cursor.execute('CREATE INDEX idx_cg_current ON current_grades(student_id, academic_year_id)')
        except Exception as e:
            if 'already exists' not in str(e).lower():
                print(f"[WARN] Could not create index: {e}")

        # Bootstrap admin: disabled in production unless explicitly allowed.
        # Never print the generated password in production logs.
        cursor.execute("SELECT id FROM users WHERE role = %s LIMIT 1", ('admin',))
        if not cursor.fetchone():
            allow_bootstrap = os.getenv('ALLOW_BOOTSTRAP_ADMIN', '').lower() in ('1', 'true', 'yes')
            is_production = os.getenv('NODE_ENV', 'development') == 'production'
            explicit_password = os.getenv('BOOTSTRAP_ADMIN_PASSWORD', '')

            if is_production and not allow_bootstrap:
                print('[WARN] No admin user exists and bootstrap is disabled in production. '
                      'Run scripts/create_admin_user.py to create one.')
            else:
                admin_user = os.getenv('BOOTSTRAP_ADMIN_USERNAME', 'admin')
                admin_pwd = explicit_password or secrets.token_urlsafe(16)
                pwd_hash = bcrypt.hashpw(admin_pwd.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cursor.execute('INSERT INTO users(username, password_hash, role) VALUES(%s, %s, %s)',
                               (admin_user, pwd_hash, 'admin'))
                if is_production:
                    print(f'[OK] Bootstrap admin created: {admin_user} (password from BOOTSTRAP_ADMIN_PASSWORD)')
                else:
                    print(f'[OK] Bootstrap admin created: {admin_user} / {admin_pwd}')
                    print('[WARN] This password is shown once - change it immediately after first login')
        
        conn.commit()
        print('[OK] Database tables created successfully')
    except Exception as e:
        print(f"[ERROR] Error creating tables: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if cursor:
            cursor.close()
        if conn:
            pool.putconn(conn)

def generate_school_code():
    import time
    import random
    import string
    timestamp = str(int(time.time() * 1000))[-6:]
    random_str = ''.join(random.choices(string.ascii_uppercase + string.digits, k=3))
    return f"SCH-{timestamp}-{random_str}"

def get_unique_school_code():
    code = generate_school_code()
    pool = get_postgresql_pool()
    if not pool:
        return code
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor()
        while True:
            cursor.execute('SELECT code FROM schools WHERE code = %s', (code,))
            if not cursor.fetchone():
                break
            code = generate_school_code()
    finally:
        if conn:
            pool.putconn(conn)
    
    return code

def generate_teacher_code():
    """Generate a unique teacher code in format TCHR-XXXXX-XXXX with enhanced uniqueness"""
    import time
    import random
    import string
    import hashlib
    
    # Use multiple entropy sources for maximum uniqueness
    timestamp_ns = str(int(time.time() * 1000000000))[-5:]  # Nanosecond timestamp
    timestamp_ms = str(int(time.time() * 1000))[-3:]       # Millisecond timestamp
    random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
    
    # Add process-specific entropy
    process_entropy = str(hash(str(time.process_time())))[-2:]
    
    # Combine all sources
    combined = f"{timestamp_ns}{timestamp_ms}{random_part}{process_entropy}"
    
    # Hash to ensure consistent length and distribution
    hash_obj = hashlib.md5(combined.encode(), usedforsecurity=False)
    hash_hex = hash_obj.hexdigest()[:4].upper()
    
    return f"TCHR-{timestamp_ns}-{hash_hex}"

def get_unique_teacher_code(school_id):
    """Generate a unique teacher code for a specific school with improved uniqueness"""
    import time
    import random
    import string
    
    max_attempts = 5000
    attempts = 0
    
    pool = get_postgresql_pool()
    if not pool:
        return generate_teacher_code()
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor()
        
        cursor.execute('SELECT teacher_code FROM teachers WHERE school_id = %s', (school_id,))
        existing_codes = {row[0] for row in cursor.fetchall()}
        
        while attempts < max_attempts:
            code = generate_teacher_code()
            
            if code not in existing_codes:
                cursor.execute('SELECT teacher_code FROM teachers WHERE teacher_code = %s AND school_id = %s', (code, school_id))
                if not cursor.fetchone():
                    if code.startswith('TCHR-') and len(code) == 14:
                        return code
            
            attempts += 1
            
            if attempts > 100:
                extra_random = ''.join(random.choices(string.ascii_uppercase + string.digits, k=2))
                timestamp = str(int(time.time() * 1000000000))[-5:]
                additional_random = ''.join(random.choices(string.ascii_uppercase + string.digits, k=2))
                code = f"TCHR-{timestamp}-{extra_random}{additional_random}"
            
            if attempts % 100 == 0:
                time.sleep(0.05)
            elif attempts % 50 == 0:
                time.sleep(0.02)
                
    finally:
        if conn:
            pool.putconn(conn)
    
    import uuid
    unique_suffix = str(uuid.uuid4())[:4].upper()
    timestamp = str(int(time.time() * 1000000000))[-5:]
    fallback_code = f"TCHR-{timestamp}-{unique_suffix}"
    
    conn = pool.getconn()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT teacher_code FROM teachers WHERE teacher_code = %s AND school_id = %s', (fallback_code, school_id))
        if not cursor.fetchone():
            return fallback_code
    finally:
        if conn:
            pool.putconn(conn)
    
    raise Exception(f"Unable to generate unique teacher code for school {school_id} after {max_attempts} attempts.")

def get_teacher_subjects(teacher_id):
    """Get all subjects assigned to a teacher (both predefined and free-text)"""
    pool = get_postgresql_pool()
    if not pool:
        return []
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor(dictionary=True)
        
        predefined_query = '''
            SELECT s.id, s.name, s.grade_level
            FROM teacher_subjects ts
            JOIN subjects s ON ts.subject_id = s.id
            WHERE ts.teacher_id = %s
            ORDER BY s.name
        '''
        cursor.execute(predefined_query, (teacher_id,))
        predefined_subjects = cursor.fetchall()
        
        free_text_query = '''
            SELECT free_text_subjects
            FROM teachers
            WHERE id = %s
        '''
        cursor.execute(free_text_query, (teacher_id,))
        result = cursor.fetchone()
        
        free_text_subjects = []
        if result and result['free_text_subjects']:
            subjects_list = [s.strip() for s in result['free_text_subjects'].split(',') if s.strip()]
            free_text_subjects = [{'id': None, 'name': subject, 'grade_level': 'free_text'} for subject in subjects_list]
        
        all_subjects = predefined_subjects + free_text_subjects
        return all_subjects
    finally:
        if conn:
            pool.putconn(conn)

def get_teacher_students(teacher_id, academic_year_id=None):
    """Get all students taught by a teacher based on their subjects"""
    pool = get_postgresql_pool()
    if not pool:
        return []
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor(dictionary=True)
        cursor.execute('SELECT school_id FROM teachers WHERE id = %s', (teacher_id,))
        teacher_school = cursor.fetchone()
        
        if not teacher_school:
            return []
        
        school_id = teacher_school['school_id']
        
        subject_query = '''
            SELECT s.id, s.name, s.grade_level
            FROM teacher_subjects ts
            JOIN subjects s ON ts.subject_id = s.id
            WHERE ts.teacher_id = %s
        '''
        cursor.execute(subject_query, (teacher_id,))
        teacher_subjects = cursor.fetchall()
        
        if not teacher_subjects:
            return []
        
        grade_levels = list(set([subject['grade_level'] for subject in teacher_subjects]))
        
        conditions = []
        params = [school_id]
        for grade in grade_levels:
            conditions.append("s.grade LIKE %s")
            params.append(f"% - {grade}")
        
        for grade in grade_levels:
            conditions.append("s.grade = %s")
            params.append(grade)
        
        student_query = f'''
            SELECT DISTINCT s.id, s.full_name, s.student_code, s.grade, s.room,
                   s.detailed_scores, s.daily_attendance
            FROM students s
            WHERE s.school_id = %s
              AND ({' OR '.join(conditions)})
        '''
        
        if academic_year_id:
            student_query += ' AND s.academic_year_id = %s'
            params.append(academic_year_id)
            
        cursor.execute(student_query, tuple(params))
        students = cursor.fetchall()
        
        import json
        for student in students:
            if student.get('detailed_scores'):
                try:
                    if isinstance(student['detailed_scores'], str):
                        student['detailed_scores'] = json.loads(student['detailed_scores'])
                except:
                    student['detailed_scores'] = {}
            else:
                student['detailed_scores'] = {}
                
            if student.get('daily_attendance'):
                try:
                    if isinstance(student['daily_attendance'], str):
                        student['daily_attendance'] = json.loads(student['daily_attendance'])
                except:
                    student['daily_attendance'] = {}
            else:
                student['daily_attendance'] = {}
        
        return students
    finally:
        if conn:
            pool.putconn(conn)

def assign_teacher_to_class(teacher_id, class_name, subject_id, academic_year_id=None):
    """Assign a teacher to teach a specific subject in a class"""
    pool = get_postgresql_pool()
    if not pool:
        return False
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor()
        query = '''INSERT INTO teacher_class_assignments 
                   (teacher_id, class_name, subject_id, academic_year_id) 
                   VALUES (%s, %s, %s, %s)'''
        cursor.execute(query, (teacher_id, class_name, subject_id, academic_year_id))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error assigning teacher to class: {e}")
        return False
    finally:
        if conn:
            pool.putconn(conn)

def remove_teacher_from_class(assignment_id):
    """Remove a teacher's class assignment"""
    pool = get_postgresql_pool()
    if not pool:
        return False
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM teacher_class_assignments WHERE id = %s', (assignment_id,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error removing teacher from class: {e}")
        return False
    finally:
        if conn:
            pool.putconn(conn)

def get_teacher_class_assignments(teacher_id, academic_year_id=None):
    """Get all class assignments for a teacher"""
    pool = get_postgresql_pool()
    if not pool:
        return []
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor(dictionary=True)
        if academic_year_id:
            query = '''
                SELECT tca.*, s.name as subject_name, t.full_name as teacher_name
                FROM teacher_class_assignments tca
                JOIN subjects s ON tca.subject_id = s.id
                JOIN teachers t ON tca.teacher_id = t.id
                WHERE tca.teacher_id = %s AND tca.academic_year_id = %s
                ORDER BY tca.class_name, s.name
            '''
            cursor.execute(query, (teacher_id, academic_year_id))
        else:
            query = '''
                SELECT tca.*, s.name as subject_name, t.full_name as teacher_name
                FROM teacher_class_assignments tca
                JOIN subjects s ON tca.subject_id = s.id
                JOIN teachers t ON tca.teacher_id = t.id
                WHERE tca.teacher_id = %s
                ORDER BY tca.class_name, s.name
            '''
            cursor.execute(query, (teacher_id,))
        return cursor.fetchall()
    finally:
        if conn:
            pool.putconn(conn)

def get_class_teachers(class_name, academic_year_id=None, school_id=None):
    """Get all teachers assigned to a specific class (optionally per school)"""
    pool = get_postgresql_pool()
    if not pool:
        return []
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor(dictionary=True)
        query = '''
            SELECT tca.*, t.full_name, t.teacher_code, s.name as subject_name
            FROM teacher_class_assignments tca
            JOIN teachers t ON tca.teacher_id = t.id
            JOIN subjects s ON tca.subject_id = s.id
            WHERE tca.class_name = %s
        '''
        params = [class_name]
        if academic_year_id:
            query += ' AND tca.academic_year_id = %s'
            params.append(academic_year_id)
        if school_id:
            query += ' AND t.school_id = %s'
            params.append(school_id)
        query += ' ORDER BY s.name'
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        if conn:
            pool.putconn(conn)

def get_school_teachers_with_assignments(school_id, academic_year_id=None):
    """Get all teachers in a school with their class assignments"""
    pool = get_postgresql_pool()
    if not pool:
        return []
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor(dictionary=True)
        if academic_year_id:
            query = '''
                SELECT t.*, 
                       COALESCE(STRING_AGG(DISTINCT s.name, ', '), '') as subject_names,
                       COALESCE(STRING_AGG(DISTINCT tca.class_name, ', '), '') as assigned_classes,
                       COUNT(DISTINCT tca.id) as assignment_count
                FROM teachers t
                LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
                LEFT JOIN subjects s ON ts.subject_id = s.id
                LEFT JOIN teacher_class_assignments tca ON t.id = tca.teacher_id AND tca.academic_year_id = %s
                WHERE t.school_id = %s
                GROUP BY t.id
                ORDER BY t.full_name
            '''
            cursor.execute(query, (academic_year_id, school_id))
        else:
            query = '''
                SELECT t.*, 
                       COALESCE(STRING_AGG(DISTINCT s.name, ', '), '') as subject_names,
                       COALESCE(STRING_AGG(DISTINCT tca.class_name, ', '), '') as assigned_classes,
                       COUNT(DISTINCT tca.id) as assignment_count
                FROM teachers t
                LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
                LEFT JOIN subjects s ON ts.subject_id = s.id
                LEFT JOIN teacher_class_assignments tca ON t.id = tca.teacher_id
                WHERE t.school_id = %s
                GROUP BY t.id
                ORDER BY t.full_name
            '''
            cursor.execute(query, (school_id,))
        return cursor.fetchall()
    finally:
        if conn:
            pool.putconn(conn)

def get_school_teacher_class_assignments(school_id, academic_year_id=None):
    """Get all teacher-class assignments for a school"""
    pool = get_postgresql_pool()
    if not pool:
        return []
        
    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor(dictionary=True)
        query = '''
            SELECT tca.*, s.name as subject_name, t.full_name as teacher_name, t.teacher_code
            FROM teacher_class_assignments tca
            JOIN subjects s ON tca.subject_id = s.id
            JOIN teachers t ON tca.teacher_id = t.id
            WHERE t.school_id = %s
        '''
        params = [school_id]
        if academic_year_id:
            query += ' AND tca.academic_year_id = %s'
            params.append(academic_year_id)
        
        query += ' ORDER BY tca.class_name, s.name'
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    except Exception as e:
        print(f"Error getting school teacher class assignments: {e}")
        return []
    finally:
        if conn:
            pool.putconn(conn)
