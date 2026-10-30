"""
Provision passwords for portal accounts (schools / teachers / students).

Generates a random password for every account that does not have one yet and
writes them to a CSV file so the school can hand them out. Accounts that already
have a password are left untouched unless --reset is passed.

Usage:
    python scripts/set_portal_passwords.py [--output FILE] [--reset] [--school ID]

After every account has a password, set REQUIRE_PORTAL_PASSWORDS=true so
code-only logins are rejected.
"""
import argparse
import csv
import os
import secrets
import string
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, 'core'))

import bcrypt
from database import get_postgresql_pool

ALPHABET = string.ascii_letters + string.digits
TABLES = {
    'school': ('schools', 'code', 'name'),
    'teacher': ('teachers', 'teacher_code', 'full_name'),
    'student': ('students', 'student_code', 'full_name'),
}


def generate_password(length=12):
    return ''.join(secrets.choice(ALPHABET) for _ in range(length))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='portal_credentials.csv',
                        help='CSV file to write the generated credentials to')
    parser.add_argument('--reset', action='store_true',
                        help='Also reset accounts that already have a password')
    parser.add_argument('--school', type=int, default=None,
                        help='Only provision accounts of this school id')
    args = parser.parse_args()

    pool = get_postgresql_pool()
    if not pool:
        print('[ERROR] Database connection failed')
        return 1

    rows = []
    conn = pool.getconn()
    try:
        cursor = conn.cursor(dictionary=True)
        for entity, (table, code_col, name_col) in TABLES.items():
            school_col = 'NULL AS school_id' if entity == 'school' else 'school_id'
            query = (f"SELECT id, {code_col} AS code, {name_col} AS name, "
                     f"{school_col}, password_hash FROM {table}")
            params = ()
            if entity != 'school':
                if args.school:
                    query += ' WHERE school_id = %s'
                    params = (args.school,)
            elif args.school:
                query += ' WHERE id = %s'
                params = (args.school,)

            cursor.execute(query, params)
            for row in cursor.fetchall():
                if row.get('password_hash') and not args.reset:
                    continue
                password = generate_password()
                pwd_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                cursor.execute(f'UPDATE {table} SET password_hash = %s WHERE id = %s',  # nosec B608
                               (pwd_hash, row['id']))
                rows.append({
                    'entity': entity,
                    'id': row['id'],
                    'code': row['code'],
                    'name': row['name'],
                    'password': password,
                })
        conn.commit()
    finally:
        pool.putconn(conn)

    if not rows:
        print('[INFO] Nothing to do - every account already has a password.')
        return 0

    with open(args.output, 'w', newline='', encoding='utf-8-sig') as fh:
        writer = csv.DictWriter(fh, fieldnames=['entity', 'id', 'code', 'name', 'password'])
        writer.writeheader()
        writer.writerows(rows)

    print(f'[OK] Generated passwords for {len(rows)} accounts.')
    print(f'[OK] Written to {args.output}')
    print('[WARN] This file contains plaintext passwords - distribute it securely and delete it afterwards.')
    print('[NEXT] Set REQUIRE_PORTAL_PASSWORDS=true to reject code-only logins.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
