"""
Create (or reset) an admin user securely.

Usage:
    python scripts/create_admin_user.py [username]
Reads password from ADMIN_PASSWORD env var; if unset, generates a strong
one-time password and prints it once.
"""
import sys
import os
import secrets

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, 'core'))

import bcrypt
from database import get_postgresql_pool


def create_admin_user():
    username = sys.argv[1] if len(sys.argv) > 1 else os.getenv('ADMIN_USERNAME', 'admin')
    password = os.getenv('ADMIN_PASSWORD') or secrets.token_urlsafe(16)

    pool = get_postgresql_pool()
    if not pool:
        print("[ERROR] Database connection failed")
        return False

    conn = None
    try:
        conn = pool.getconn()
        cursor = conn.cursor()

        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        cursor.execute('SELECT id FROM users WHERE username = %s', (username,))
        if cursor.fetchone():
            cursor.execute(
                'UPDATE users SET password_hash = %s, role = %s WHERE username = %s',
                (password_hash, 'admin', username)
            )
            conn.commit()
            print(f"[OK] Admin '{username}' password reset")
        else:
            cursor.execute('''
                INSERT INTO users (username, password_hash, role)
                VALUES (%s, %s, %s)
            ''', (username, password_hash, 'admin'))
            conn.commit()
            print(f"[OK] Admin '{username}' created")

        print("[INFO] Credentials: {} / {}".format(username, password))
        print("[WARN] This password is shown once - store it now and change it after first login")
        return True

    except Exception as e:
        print(f"[ERROR] Failed to create user: {e}")
        return False
    finally:
        if conn:
            pool.putconn(conn)


if __name__ == '__main__':
    create_admin_user()
