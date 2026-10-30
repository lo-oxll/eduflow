"""Read-only connectivity check for the configured PostgreSQL/Supabase database.

Usage:
    python scripts/check_database.py
    python scripts/check_database.py --init   # create tables/indexes first
"""
import sys
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

load_dotenv(BASE_DIR / '.env')

REQUIRED_TABLES = (
    'users', 'schools', 'students', 'teachers', 'subjects',
    'student_grades', 'student_attendance', 'system_academic_years',
)


def main() -> int:
    try:
        import psycopg2
    except ImportError:
        print('[ERROR] psycopg2 is not installed. Run: pip install -r requirements.txt')
        return 1

    from core.database import DATABASE_URL, init_db

    if not DATABASE_URL:
        print('[ERROR] DATABASE_URL is empty; the app would use local SQLite.')
        return 1

    parsed = urlparse(DATABASE_URL)
    print(f'[INFO] Target: {parsed.hostname}:{parsed.port or 5432}{parsed.path}')

    if '--init' in sys.argv:
        init_db()
        print('[OK] Schema initialized (tables/indexes created)')

    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=15)
    except Exception as exc:
        print(f'[ERROR] Connection failed: {exc}')
        return 1

    try:
        with conn.cursor() as cursor:
            cursor.execute('SELECT version();')
            print(f'[OK] Connected: {cursor.fetchone()[0].split(",")[0]}')

            cursor.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
            tables = {row[0] for row in cursor.fetchall()}
            print(f'[INFO] Tables in public schema: {len(tables)}')

            missing = [name for name in REQUIRED_TABLES if name not in tables]
            if missing:
                print(f'[WARN] Missing tables: {", ".join(missing)}')
                print('[WARN] Run this script with --init to create the schema.')
                return 1

            print('[OK] Required tables are present')
    finally:
        conn.close()

    return 0


if __name__ == '__main__':
    sys.exit(main())
