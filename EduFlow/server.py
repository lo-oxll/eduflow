import os
import sys
import datetime
import secrets
import jwt
import bcrypt
import json
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CORE_DIR = os.path.join(BASE_DIR, 'core')
if CORE_DIR not in sys.path:
    sys.path.append(CORE_DIR)

from database import init_db, get_mysql_pool, get_unique_school_code, get_unique_teacher_code, get_teacher_subjects, get_teacher_students, assign_teacher_to_class, remove_teacher_from_class, get_teacher_class_assignments, get_class_teachers, get_school_teachers_with_assignments, get_school_teacher_class_assignments, get_database_info, group_concat_sql
from security import setup_security
from performance import setup_performance_monitoring, register_performance_endpoints
from cache import setup_cache
from api_optimization import setup_api_optimization, field_selection, pagination
from core.services import (
    school_service, academic_year_service, student_service,
    teacher_service, user_service, recommendation_service,
)

load_dotenv()

app = Flask(__name__, static_folder='public')

# Behind a reverse proxy (nginx / Render / Railway) the real client IP is in
# X-Forwarded-For. Required for rate limiting per client.
_trust_proxy = os.getenv('TRUST_PROXY', '').lower() in ('1', 'true', 'yes') or any(
    os.getenv(v) for v in ('RENDER', 'RAILWAY_ENVIRONMENT', 'VERCEL')
)
if _trust_proxy:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

_cors_origins = [o.strip() for o in os.getenv('CORS_ORIGINS', '').split(',') if o.strip()]
CORS(app, supports_credentials=True,
     origins=_cors_origins or ['http://localhost:8000', 'http://127.0.0.1:8000'])

PORT = int(os.getenv('PORT', 8000))
NODE_ENV = os.getenv('NODE_ENV', 'development')
JWT_SECRET = os.getenv('JWT_SECRET')
JWT_EXPIRES_HOURS = float(os.getenv('JWT_EXPIRES_HOURS', '8'))
if not JWT_SECRET:
    if NODE_ENV == 'production':
        raise RuntimeError('JWT_SECRET must be set in production')
    JWT_SECRET = secrets.token_hex(32)
    print('[WARN] JWT_SECRET not set - tokens will be invalidated on every restart (development only)')

# When enabled, portal accounts (school/student/teacher) must have a password
# configured by an administrator. Defaults to ON in production and OFF in development
# (provision passwords with scripts/set_portal_passwords.py).
REQUIRE_PORTAL_PASSWORDS = os.getenv(
    'REQUIRE_PORTAL_PASSWORDS',
    'true' if NODE_ENV == 'production' else 'false'
).lower() in ('1', 'true', 'yes')

# Security headers applied to every response. Inline scripts/styles are still
# allowed because the dashboards embed them; everything else is same-origin.
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.sheetjs.com https://cdnjs.cloudflare.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
    "img-src 'self' data:; "
    "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
    "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; "
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
)


_SENSITIVE_RESPONSE_KEYS = {'password_hash', 'two_factor_secret', 'token_hash'}


def _scrub_sensitive_payload(value):
    """Recursively drop credential material from API payloads."""
    if isinstance(value, dict):
        return {k: _scrub_sensitive_payload(v) for k, v in value.items()
                if k not in _SENSITIVE_RESPONSE_KEYS}
    if isinstance(value, list):
        return [_scrub_sensitive_payload(item) for item in value]
    return value


@app.after_request
def add_security_headers(response):
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'no-referrer')
    response.headers.setdefault('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
    response.headers.setdefault('Content-Security-Policy', _CSP)
    if NODE_ENV == 'production' and (request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https'):
        response.headers.setdefault('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

    # Some legacy queries use SELECT *; never let password hashes reach clients
    if response.is_json:
        try:
            raw = response.get_data()
            if any(k.encode() in raw for k in _SENSITIVE_RESPONSE_KEYS):
                cleaned = json.dumps(_scrub_sensitive_payload(json.loads(raw)))
                response.set_data(cleaned)
                response.headers['Content-Length'] = str(len(cleaned.encode('utf-8')))
        except Exception:
            pass
    return response

# Initialize database
init_db()

# Setup security middleware
security_middleware = setup_security(app, get_mysql_pool())

# Setup performance monitoring
performance_monitor = setup_performance_monitoring(app)
register_performance_endpoints(app)

# Setup caching
cache_manager = setup_cache()

# Setup API optimization
api_optimizer = setup_api_optimization()

# Uploads directory configuration
if NODE_ENV == 'production':
    UPLOADS_DIR = os.getenv('UPLOADS_DIR', '/tmp/uploads')  # nosec B108
else:
    UPLOADS_DIR = os.path.join(os.path.dirname(__file__), 'uploads')

if not os.path.exists(UPLOADS_DIR):
    os.makedirs(UPLOADS_DIR, mode=0o755, exist_ok=True)

# Helper functions for grade scale and validation
def is_elementary_grades_1_to_4(grade_string):
    """
    Check if a grade string represents elementary (ابتدائي) grades 1-4.
    These grades use a 10-point scale, while all others use 100-point scale.
    """
    if not grade_string:
        return False
    
    grade_parts = grade_string.split(' - ')
    if len(grade_parts) < 2:
        return False
    
    educational_level = grade_parts[0].strip()  # e.g., "ابتدائي"
    grade_level = grade_parts[1].strip()  # e.g., "الأول الابتدائي"
    
    # Check if this is an elementary (ابتدائي) school level
    is_elementary = ('ابتدائي' in educational_level or 
                     'ابتدائي' in grade_level or 
                     'الابتدائي' in grade_level)
    
    if not is_elementary:
        return False
    
    # Check if grade is first, second, third, or fourth
    grades_1_to_4 = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'اول', 'ثاني', 'ثالث', 'رابع', 'الاول']
    is_grades_1_to_4 = any(x in grade_level for x in grades_1_to_4)
    
    # Make sure it's NOT fifth or sixth grade (which should use 100-point scale)
    grades_5_or_6 = ['الخامس', 'السادس', 'خامس', 'سادس']
    is_grades_5_or_6 = any(x in grade_level for x in grades_5_or_6)
    
    return is_grades_1_to_4 and not is_grades_5_or_6


def get_grade_scale(grade_string):
    """
    Return grading scale information for a given grade string.
    For ابتدائي 1-4: max_score = 10
    For others: max_score = 100
    """
    if is_elementary_grades_1_to_4(grade_string):
        return {
            'scale': 10,
            'min_score': 0,
            'max_score': 10,
        }
    return {
        'scale': 100,
        'min_score': 0,
        'max_score': 100,
    }


_RESOURCE_SCHOOL_SQL = {
    'student': 'SELECT school_id FROM students WHERE id = %s',
    'teacher': 'SELECT school_id FROM teachers WHERE id = %s',
    'subject': 'SELECT school_id FROM subjects WHERE id = %s',
    'grade_level': 'SELECT school_id FROM grade_levels WHERE id = %s',
    'assignment': '''SELECT t.school_id FROM teacher_class_assignments tca
                     JOIN teachers t ON tca.teacher_id = t.id
                     WHERE tca.id = %s''',
}


def _scope_denied(message_ar='ليست لديك صلاحية للوصول إلى هذا المورد'):
    return jsonify({'error': 'Forbidden', 'error_ar': message_ar}), 403


def _scope_not_found(message_ar='المورد غير موجود'):
    return jsonify({'error': 'Not found', 'error_ar': message_ar}), 404


def _scope_cache():
    cache = getattr(g, '_scope_cache', None)
    if cache is None:
        cache = {}
        g._scope_cache = cache
    return cache


def _fetch_one(sql, params=()):
    """Fetch a single row, memoized for the duration of the request."""
    cache = _scope_cache()
    key = (sql, tuple(params))
    if key in cache:
        return cache[key]

    row = None
    pool = get_mysql_pool()
    if pool:
        conn = pool.get_connection()
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(sql, params)
            row = cur.fetchone()
        finally:
            conn.close()
    cache[key] = row
    return row


def _own_school_id(user):
    """Resolve which school a non-admin principal belongs to."""
    role = user.get('role')
    if role == 'school':
        return user.get('id')
    if role == 'teacher':
        row = _fetch_one('SELECT school_id FROM teachers WHERE id = %s', (user.get('id'),))
    elif role == 'student':
        row = _fetch_one('SELECT school_id FROM students WHERE id = %s', (user.get('id'),))
    else:
        return None
    return row['school_id'] if row else None


def _can_access_school(user, school_id):
    if not user:
        return False
    if user.get('role') == 'admin':
        return True
    own = _own_school_id(user)
    return own is not None and int(own) == int(school_id)


def ensure_school_scope(school_id):
    """Deny access to a school's data unless the caller owns it (admin bypasses)."""
    current_user = getattr(g, 'current_user', None)
    if not current_user:
        return jsonify({'error': 'Authentication required', 'error_ar': 'مصادقة مطلوبة'}), 401
    if not _can_access_school(current_user, school_id):
        return _scope_denied('لا يمكنك الوصول إلى بيانات مدرسة أخرى')
    return None


def ensure_student_scope(student_id):
    """Deny access to a student unless it is the caller or belongs to their school."""
    current_user = getattr(g, 'current_user', None)
    if not current_user:
        return jsonify({'error': 'Authentication required', 'error_ar': 'مصادقة مطلوبة'}), 401

    if current_user.get('role') == 'student':
        if int(current_user.get('id')) != int(student_id):
            return _scope_denied('لا يمكنك الوصول إلى بيانات طالب آخر')
        return None

    return ensure_resource_scope('student', student_id)


def ensure_resource_scope(kind, resource_id):
    """Verify the caller may touch a resource id (student/teacher/subject/...)."""
    current_user = getattr(g, 'current_user', None)
    if not current_user:
        return jsonify({'error': 'Authentication required', 'error_ar': 'مصادقة مطلوبة'}), 401

    role = current_user.get('role')

    if role == 'student':
        # Students may only address themselves
        if kind != 'student' or int(current_user.get('id')) != int(resource_id):
            return _scope_denied()
        return None

    if kind == 'teacher' and role == 'teacher':
        if int(current_user.get('id')) != int(resource_id):
            return _scope_denied('لا يمكنك الوصول إلى بيانات معلم آخر')
        return None

    if kind == 'school':
        return ensure_school_scope(resource_id)

    sql = _RESOURCE_SCHOOL_SQL.get(kind)
    if not sql:
        return None

    row = _fetch_one(sql, (resource_id,))
    if not row:
        return _scope_not_found()
    if not _can_access_school(current_user, row['school_id']):
        return _scope_denied()
    return None


def scoped(f):
    """Enforce tenant ownership for every resource id present in the URL.

    Must run after a role decorator (it relies on g.current_user)."""
    @wraps(f)
    def decorated(*args, **kwargs):
        for kind, param in (
            ('school', 'school_id'),
            ('student', 'student_id'),
            ('teacher', 'teacher_id'),
            ('subject', 'subject_id'),
            ('grade_level', 'grade_level_id'),
            ('assignment', 'assignment_id'),
        ):
            if param in kwargs:
                error = ensure_resource_scope(kind, kwargs[param])
                if error:
                    return error
        return f(*args, **kwargs)

    return decorated

# Authentication decorator: decodes JWT and attaches current_user
def authenticate_token(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        from flask import g, request
        import jwt

        auth_header = request.headers.get('Authorization', '')
        token = None
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]

        if not token:
            return jsonify({'error': 'Authentication required', 'error_ar': 'مصادقة مطلوبة'}), 401

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            g.current_user = payload
            return f(*args, **kwargs)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired', 'error_ar': 'انتهت صلاحية الجلسة'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token', 'error_ar': 'رمز غير صالح'}), 401

    return decorated


# Role requirement decorator: يفرض وجود توكن ودور مسموح به
def roles_required(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            from flask import g, request
            import jwt

            auth_header = request.headers.get('Authorization', '')
            token = None
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]

            if not token:
                return jsonify({'error': 'Authentication required', 'error_ar': 'مصادقة مطلوبة'}), 401

            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
                g.current_user = payload

                # إذا تم تمرير أدوار مطلوبة، تأكد أن دور المستخدم ضمنها
                if roles and payload.get('role') not in roles:
                    return jsonify(
                        {
                            'error': 'Forbidden',
                            'error_ar': 'ليست لديك صلاحية للوصول إلى هذا المورد',
                        }
                    ), 403

                return f(*args, **kwargs)
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Token expired', 'error_ar': 'انتهت صلاحية الجلسة'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'error': 'Invalid token', 'error_ar': 'رمز غير صالح'}), 401

        return decorated

    return decorator

@app.route('/health', methods=['GET'])
def health_check():
    db_info = get_database_info()
    health_status = {
        'status': 'healthy',
        'timestamp': datetime.datetime.now().isoformat(),
        'environment': NODE_ENV,
        'database': db_info['dialect'],
        'platform': {
            'render': bool(os.getenv('RENDER')),
            'railway': bool(os.getenv('RAILWAY_ENVIRONMENT')),
            'vercel': bool(os.getenv('VERCEL')),
            'detected': 'Render.com' if os.getenv('RENDER') else 
                         'Railway.app' if os.getenv('RAILWAY_ENVIRONMENT') else 
                         'Vercel.com' if os.getenv('VERCEL') else 'Unknown/Local'
        },
        'configuration': {
            'hasJWTSecret': bool(os.getenv('JWT_SECRET')),
            'isProduction': NODE_ENV == 'production',
            'requirePortalPasswords': REQUIRE_PORTAL_PASSWORDS,
        },
        'warnings': []
    }
    
    if NODE_ENV != 'production' and (os.getenv('RENDER') or os.getenv('RAILWAY_ENVIRONMENT') or os.getenv('VERCEL')):
        health_status['warnings'].append('NODE_ENV should be set to "production" for hosting platforms')

    if NODE_ENV == 'production' and not db_info['production_ready']:
        health_status['status'] = 'degraded'
        health_status['warnings'].append(
            'PostgreSQL is not reachable - running on the SQLite fallback'
        )
        
    return jsonify(health_status)

# ------ Portal authentication helpers ------

def _hash_password(plain):
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _password_matches(provided, stored_hash):
    if not stored_hash or not provided:
        return False
    try:
        return bcrypt.checkpw(str(provided).encode('utf-8'), stored_hash.encode('utf-8'))
    except ValueError:
        return False


def _locked_response(lock_key):
    """Return a 429 response when the account is locked, otherwise None."""
    locked, remaining = security_middleware.account_lockout.is_locked_out(lock_key)
    if not locked:
        return None
    minutes = max(1, int((remaining or 0) // 60) + 1)
    return jsonify({
        'error': 'Account temporarily locked',
        'error_ar': f'تم قفل الحساب مؤقتاً بسبب محاولات فاشلة. حاول بعد {minutes} دقيقة'
    }), 429


def _record_login_failure(lock_key):
    security_middleware.account_lockout.record_failed_attempt(
        lock_key, request.remote_addr or ''
    )


def _invalid_credentials():
    # Same message for unknown account and wrong password (no enumeration)
    return jsonify({
        'error': 'Invalid credentials',
        'error_ar': 'بيانات دخول غير صحيحة'
    }), 401


def _portal_password_valid(account):
    """Password check shared by the school/student/teacher portals.

    Returns (ok, error_response). Accounts without a configured password keep
    working until an administrator provisions one, unless
    REQUIRE_PORTAL_PASSWORDS is enabled."""
    provided = str(request.json.get('password') or '') if request.is_json else ''
    stored = account.get('password_hash')

    if stored:
        return _password_matches(provided, stored), None

    if REQUIRE_PORTAL_PASSWORDS:
        return False, (jsonify({
            'error': 'Password not configured for this account',
            'error_ar': 'لم يتم تعيين كلمة مرور لهذا الحساب. تواصل مع إدارة المدرسة'
        }), 403)

    return True, None


# API Routes
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json(silent=True) or {}
    username = str(data.get('username') or '').strip()
    password = str(data.get('password') or '')

    if not username or not password:
        return jsonify({
            'error': 'Username and password required',
            'error_ar': 'اسم المستخدم وكلمة المرور مطلوبان'
        }), 400

    lock_key = f"admin:{username}"
    locked = _locked_response(lock_key)
    if locked:
        return locked

    user = _fetch_one(
        'SELECT id, username, password_hash, role, must_change_password '
        'FROM users WHERE username = %s AND role = %s',
        (username, 'admin')
    )

    if not user or not _password_matches(password, user.get('password_hash')):
        _record_login_failure(lock_key)
        return _invalid_credentials()

    security_middleware.account_lockout.reset_failed_attempts(lock_key)

    token = jwt.encode({
        'id': user['id'],
        'username': user['username'],
        'role': user['role'],
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=JWT_EXPIRES_HOURS)
    }, JWT_SECRET, algorithm='HS256')

    return jsonify({
        'success': True,
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'must_change_password': bool(user.get('must_change_password'))
        }
    })


@app.route('/api/admin/change-password', methods=['POST'])
@roles_required('admin')
def admin_change_password():
    data = request.get_json(silent=True) or {}
    current_password = str(data.get('current_password') or '')
    new_password = str(data.get('new_password') or '')

    if len(new_password) < 8:
        return jsonify({
            'error': 'Password must be at least 8 characters',
            'error_ar': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'
        }), 400

    user_id = g.current_user.get('id')
    user = _fetch_one('SELECT id, password_hash FROM users WHERE id = %s', (user_id,))
    if not user:
        return jsonify({'error': 'User not found', 'error_ar': 'المستخدم غير موجود'}), 404
    if not _password_matches(current_password, user.get('password_hash')):
        return _invalid_credentials()

    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500

    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            'UPDATE users SET password_hash = %s, must_change_password = FALSE WHERE id = %s',
            (_hash_password(new_password), user_id)
        )
        conn.commit()
    finally:
        conn.close()

    return jsonify({'success': True, 'message': 'تم تغيير كلمة المرور بنجاح'})


@app.route('/api/admin/portal-password', methods=['POST'])
@roles_required('admin')
def admin_set_portal_password():
    """Set (or reset) the password of a school, teacher or student account."""
    data = request.get_json(silent=True) or {}
    entity = str(data.get('entity') or '')
    entity_id = data.get('id')
    password = str(data.get('password') or '')

    tables = {'school': 'schools', 'teacher': 'teachers', 'student': 'students'}
    table = tables.get(entity)
    if not table or not entity_id:
        return jsonify({
            'error': 'entity must be school, teacher or student and id is required',
            'error_ar': 'نوع الحساب ومعرفه مطلوبان'
        }), 400
    if len(password) < 8:
        return jsonify({
            'error': 'Password must be at least 8 characters',
            'error_ar': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'
        }), 400

    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500

    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(f'UPDATE {table} SET password_hash = %s WHERE id = %s',
                    (_hash_password(password), entity_id))
        updated = cur.rowcount
        conn.commit()
    finally:
        conn.close()

    if not updated:
        return jsonify({'error': 'Account not found', 'error_ar': 'الحساب غير موجود'}), 404
    return jsonify({'success': True, 'message': 'تم تعيين كلمة المرور'})


@app.route('/api/school/login', methods=['POST'])
def school_login():
    data = request.get_json(silent=True) or {}
    code = str(data.get('code') or '').strip().upper()

    if not code:
        return jsonify({
            'error': 'School code is required',
            'error_ar': 'رمز المدرسة مطلوب'
        }), 400

    lock_key = f"school:{code}"
    locked = _locked_response(lock_key)
    if locked:
        return locked

    school = _fetch_one(
        'SELECT id, code, name, study_type, level, gender_type, is_suspended, '
        'suspended_reason, password_hash FROM schools WHERE code = %s',
        (code,)
    )

    if not school:
        _record_login_failure(lock_key)
        return _invalid_credentials()

    ok, error = _portal_password_valid(school)
    if not ok:
        _record_login_failure(lock_key)
        return error or _invalid_credentials()

    if school.get('is_suspended'):
        return jsonify({
            'error': 'School account is suspended',
            'error_ar': 'حساب المدرسة موقوف. ' + (school.get('suspended_reason') or '')
        }), 403

    security_middleware.account_lockout.reset_failed_attempts(lock_key)

    token = jwt.encode({
        'id': school['id'],
        'code': school['code'],
        'name': school['name'],
        'role': 'school',
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=JWT_EXPIRES_HOURS)
    }, JWT_SECRET, algorithm='HS256')

    return jsonify({
        'success': True,
        'token': token,
        'school': {
            'id': school['id'],
            'code': school['code'],
            'name': school['name'],
            'study_type': school['study_type'],
            'level': school['level'],
            'gender_type': school['gender_type'],
        }
    })


@app.route('/api/student/login', methods=['POST'])
def student_login():
    data = request.get_json(silent=True) or {}
    code = str(data.get('code') or '').strip()

    if not code:
        return jsonify({
            'error': 'Student code is required',
            'error_ar': 'رمز الطالب مطلوب'
        }), 400

    lock_key = f"student:{code}"
    locked = _locked_response(lock_key)
    if locked:
        return locked

    student = _fetch_one(
        '''SELECT s.id, s.school_id, s.full_name, s.student_code, s.grade, s.branch,
                  s.room, s.password_hash, sch.name AS school_name,
                  sch.is_suspended AS school_suspended
           FROM students s
           JOIN schools sch ON s.school_id = sch.id
           WHERE s.student_code = %s''',
        (code,)
    )

    if not student:
        _record_login_failure(lock_key)
        return _invalid_credentials()

    ok, error = _portal_password_valid(student)
    if not ok:
        _record_login_failure(lock_key)
        return error or _invalid_credentials()

    if student.get('school_suspended'):
        return jsonify({
            'error': 'School account is suspended',
            'error_ar': 'حساب المدرسة موقوف'
        }), 403

    security_middleware.account_lockout.reset_failed_attempts(lock_key)

    token = jwt.encode({
        'id': student['id'],
        'code': student['student_code'],
        'name': student['full_name'],
        'role': 'student',
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=JWT_EXPIRES_HOURS)
    }, JWT_SECRET, algorithm='HS256')

    return jsonify({
        'success': True,
        'token': token,
        'student': {
            'id': student['id'],
            'school_id': student['school_id'],
            'school_name': student['school_name'],
            'full_name': student['full_name'],
            'student_code': student['student_code'],
            'grade': student['grade'],
            'branch': student['branch'],
            'room': student['room'],
        }
    })

@app.route('/api/schools', methods=['GET'])
@roles_required('admin')
def get_schools():
    query = 'SELECT * FROM schools ORDER BY created_at DESC'
    schools = []
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query)
        schools = cur.fetchall()
    finally:
        conn.close()
    return jsonify({'success': True, 'schools': schools})

STAGE_TO_LEVEL_MAPPING = {
    "ابتدائي": "ابتدائي",
    "متوسط": "متوسطة",
    "ثانوي": "ثانوية",
    "إعدادي": "إعدادية"
}

@app.route('/api/schools', methods=['POST'])
@roles_required('admin')
def add_school():
    data = request.json
    name = data.get('name')
    study_type = data.get('study_type')
    level = data.get('level')
    gender_type = data.get('gender_type')
    
    if level and level not in STAGE_TO_LEVEL_MAPPING.values():
        level = STAGE_TO_LEVEL_MAPPING.get(level, level)
        
    if not all([name, study_type, level, gender_type]):
        return jsonify({
            'error': 'All fields are required',
            'error_ar': 'جميع الحقول مطلوبة'
        }), 400
        
    code = get_unique_school_code()
    
    query = """INSERT INTO schools (name, code, study_type, level, gender_type) 
               VALUES (%s, %s, %s, %s, %s)"""
    params = (name, code, study_type, level, gender_type)
    
    school = None
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, params)
        last_id = cur.lastrowid
        conn.commit()
        cur.execute('SELECT * FROM schools WHERE id = %s', (last_id,))
        school = cur.fetchone()
    finally:
        conn.close()
        
    return jsonify({
        'success': True,
        'message': 'تم إضافة المدرسة بنجاح',
        'school': dict(school)
    }), 201

@app.route('/api/schools/<int:school_id>', methods=['PUT'])
@roles_required('admin')
@scoped
def update_school(school_id):
    data = request.json
    name = data.get('name')
    study_type = data.get('study_type')
    level = data.get('level')
    gender_type = data.get('gender_type')
    
    if level and level not in STAGE_TO_LEVEL_MAPPING.values():
        level = STAGE_TO_LEVEL_MAPPING.get(level, level)
        
    query = """UPDATE schools SET name = %s, study_type = %s, level = %s, gender_type = %s, updated_at = CURRENT_TIMESTAMP 
               WHERE id = %s"""
    params = (name, study_type, level, gender_type, school_id)
    
    school = None
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, params)
        conn.commit()
        cur.execute('SELECT * FROM schools WHERE id = %s', (school_id,))
        school = cur.fetchone()
    finally:
        conn.close()
        
    if not school:
        return jsonify({'error': 'School not found', 'error_ar': 'لم يتم العثور على المدرسة'}), 404
        
    return jsonify({
        'success': True,
        'message': 'تم تحديث المدرسة بنجاح',
        'school': dict(school)
    })

@app.route('/api/schools/<int:school_id>', methods=['DELETE'])
@roles_required('admin')
@scoped
def delete_school(school_id):
    """Delete a school and all related records"""
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        
        # Delete related records in proper order (foreign key constraints)
        # 1. Delete teacher_subjects (references both teachers and subjects)
        cur.execute('DELETE FROM teacher_subjects WHERE teacher_id IN (SELECT id FROM teachers WHERE school_id = %s)', (school_id,))
        teacher_subjects_deleted = cur.rowcount
        
        # 2. Delete teacher_class_assignments
        cur.execute('DELETE FROM teacher_class_assignments WHERE teacher_id IN (SELECT id FROM teachers WHERE school_id = %s)', (school_id,))
        teacher_assignments_deleted = cur.rowcount
        
        # 3. Delete student_grades
        cur.execute('DELETE FROM student_grades WHERE student_id IN (SELECT id FROM students WHERE school_id = %s)', (school_id,))
        student_grades_deleted = cur.rowcount
        
        # 4. Delete student_attendance
        cur.execute('DELETE FROM student_attendance WHERE student_id IN (SELECT id FROM students WHERE school_id = %s)', (school_id,))
        student_attendance_deleted = cur.rowcount
        
        # 5. Delete teachers (will cascade to teacher_subjects if not already deleted)
        cur.execute('DELETE FROM teachers WHERE school_id = %s', (school_id,))
        teachers_deleted = cur.rowcount
        
        # 6. Delete students (will cascade to student_grades and student_attendance if not already deleted)
        cur.execute('DELETE FROM students WHERE school_id = %s', (school_id,))
        students_deleted = cur.rowcount
        
        # 7. Delete subjects
        cur.execute('DELETE FROM subjects WHERE school_id = %s', (school_id,))
        subjects_deleted = cur.rowcount
        
        # 8. Delete grade_levels
        cur.execute('DELETE FROM grade_levels WHERE school_id = %s', (school_id,))
        grade_levels_deleted = cur.rowcount
        
        # 9. Finally delete the school
        cur.execute('DELETE FROM schools WHERE id = %s', (school_id,))
        row_count = cur.rowcount
        
        conn.commit()
        
        print(f"Deleted school {school_id}: {teachers_deleted} teachers, {students_deleted} students, {subjects_deleted} subjects, {grade_levels_deleted} grade levels")
        print(f"  - Teacher subject assignments: {teacher_subjects_deleted}")
        print(f"  - Teacher class assignments: {teacher_assignments_deleted}")
        print(f"  - Student grades: {student_grades_deleted}")
        print(f"  - Student attendance: {student_attendance_deleted}")
    finally:
        conn.close()
        
    if row_count == 0:
        return jsonify({'error': 'School not found', 'error_ar': 'لم يتم العثور على المدرسة'}), 404
        
    return jsonify({
        'success': True,
        'message': 'تم حذف المدرسة وجميع بياناتها المرتبطة بنجاح',
        'deleted': row_count,
        'details': {
            'teachers_deleted': teachers_deleted,
            'students_deleted': students_deleted,
            'subjects_deleted': subjects_deleted,
            'grade_levels_deleted': grade_levels_deleted,
            'teacher_subject_assignments_deleted': teacher_subjects_deleted,
            'teacher_class_assignments_deleted': teacher_assignments_deleted,
            'student_grades_deleted': student_grades_deleted,
            'student_attendance_deleted': student_attendance_deleted
        }
    })

@app.route('/api/school/<int:school_id>/students', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_students(school_id):
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error

    query = 'SELECT * FROM students WHERE school_id = %s ORDER BY created_at DESC'
    students = []
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, (school_id,))
        students = cur.fetchall()
        for s in students:
            # MySQL JSON type might be returned as string or dict depending on driver/version
            for col in ['detailed_scores', 'daily_attendance']:
                if isinstance(s.get(col), str):
                    try:
                        s[col] = json.loads(s[col])
                    except:
                        s[col] = {}
                elif s.get(col) is None:
                    s[col] = {}
    finally:
        conn.close()
    return jsonify({'success': True, 'students': students})

@app.route('/api/school/<int:school_id>/student', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def add_student(school_id):
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error
    data = request.json
    full_name = data.get('full_name')
    grade = data.get('grade')
    room = data.get('room')
    enrollment_date = data.get('enrollment_date')
    parent_contact = data.get('parent_contact')  # New field: one or two phone numbers
    blood_type = data.get('blood_type')  # New field: blood type selection
    chronic_disease = data.get('chronic_disease')  # New field: optional medical conditions
    
    if not all([full_name, grade, room]):
        return jsonify({
            'error': 'Full name, grade, and room are required',
            'error_ar': 'الاسم الكامل والصف والغرفة مطلوبة'
        }), 400
        
    grade_parts = grade.split(' - ')
    if len(grade_parts) < 2:
        return jsonify({
            'error': 'Invalid grade format',
            'error_ar': 'تنسيق الصف غير صحيح'
        }), 400
        
    level = grade_parts[0].strip()
    if level not in ['ابتدائي', 'متوسطة', 'ثانوية', 'إعدادية']:
        return jsonify({
            'error': 'Invalid educational level',
            'error_ar': 'مستوى تعليمي غير صحيح'
        }), 400
    
    # Validate blood type if provided
    valid_blood_types = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
    if blood_type and blood_type not in valid_blood_types:
        return jsonify({
            'error': 'Invalid blood type',
            'error_ar': 'فصيلة دم غير صالحة'
        }), 400

    # Duplicate check with room included for more precise matching
    # Use a single transaction to prevent race conditions
    check_query = "SELECT COUNT(*) FROM students WHERE full_name = %s AND grade = %s AND room = %s AND school_id = %s"
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    student = None
    try:
        cur = conn.cursor(dictionary=True)
        
        # Check for duplicates within the same transaction
        cur.execute(check_query, (full_name, grade, room, school_id))
        count = cur.fetchone()
        count = list(count.values())[0] if count else 0
        
        if count > 0:
            conn.rollback()
            return jsonify({
                'error': 'A student with the same name already exists in this grade and room',
                'error_ar': 'طالب بنفس الاسم موجود بالفعل في هذا الصف والغرفة'
            }), 400
        
        student_code = f"STD-{int(datetime.datetime.now().timestamp() * 1000)}-{secrets.token_hex(2).upper()}"
        
        query = """INSERT INTO students (school_id, full_name, student_code, grade, room, enrollment_date, 
                   parent_contact, blood_type, chronic_disease, detailed_scores, daily_attendance) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"""
        params = (school_id, full_name, student_code, grade, room, enrollment_date, 
                  parent_contact, blood_type, chronic_disease, '{}', '{}')
        
        cur.execute(query, params)
        last_id = cur.lastrowid
        conn.commit()
        cur.execute('SELECT * FROM students WHERE id = %s', (last_id,))
        student = cur.fetchone()
    except Exception as e:
        conn.rollback()
        print(f"Error creating student: {e}")
        return jsonify({'error': 'Failed to create student', 'error_ar': 'فشل في إنشاء الطالب'}), 500
    finally:
        conn.close()
        
    return jsonify({
        'success': True,
        'message': 'تم إضافة الطالب بنجاح',
        'student': dict(student)
    }), 201

# Add more routes as needed (this covers the main ones from server.js first 1000 lines)
# For the sake of the task, I will continue with the rest of the routes logic...

@app.route('/api/student/<int:student_id>', methods=['PUT'])
@roles_required('admin', 'school')
@scoped
def update_student(student_id):
    data = request.json
    full_name = data.get('full_name')
    grade = data.get('grade')
    room = data.get('room')
    detailed_scores = data.get('detailed_scores')
    daily_attendance = data.get('daily_attendance')
    parent_contact = data.get('parent_contact')  # New field
    blood_type = data.get('blood_type')  # New field
    chronic_disease = data.get('chronic_disease')  # New field
    
    # Validate blood type if provided
    valid_blood_types = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']
    if blood_type and blood_type not in valid_blood_types:
        return jsonify({
            'error': 'Invalid blood type',
            'error_ar': 'فصيلة دم غير صالحة'
        }), 400
    
    final_detailed_scores = detailed_scores or {}
    
    if detailed_scores and grade:
        cleaned_scores = {}
        for subject, scores in detailed_scores.items():
            if subject == '[object Object]':
                continue
            if isinstance(subject, str) and len(subject) > 0:
                cleaned_scores[subject] = scores
        
        # Use centralized grade scale helper
        scale_info = get_grade_scale(grade)
        min_score = scale_info['min_score']
        max_score = scale_info['max_score']
        
        for subject, scores in cleaned_scores.items():
            if not isinstance(scores, dict):
                continue
            for period, score_val in scores.items():
                try:
                    score = int(score_val)
                except (ValueError, TypeError):
                    # Ignore invalid values instead of raising, to avoid breaking legacy data
                    continue
                
                if score < min_score or score > max_score:
                    return jsonify({
                        'error': f'Scores must be between {min_score} and {max_score}',
                        'error_ar': f'يجب أن تكون الدرجات بين {min_score} و {max_score}'
                    }), 400

        final_detailed_scores = cleaned_scores

    query = """UPDATE students SET 
               full_name = %s, grade = %s, room = %s, 
               detailed_scores = %s, daily_attendance = %s,
               parent_contact = %s, blood_type = %s, chronic_disease = %s,
               updated_at = CURRENT_TIMESTAMP 
               WHERE id = %s"""
               
    params = (
        full_name, 
        grade, 
        room, 
        json.dumps(final_detailed_scores), 
        json.dumps(daily_attendance or {}),
        parent_contact,
        blood_type,
        chronic_disease,
        student_id
    )
    
    student = None
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, params)
        conn.commit()
        cur.execute('SELECT * FROM students WHERE id = %s', (student_id,))
        student = cur.fetchone()
    finally:
        conn.close()
        
    if not student:
        return jsonify({'error': 'Student not found', 'error_ar': 'لم يتم العثور على الطالب'}), 404
        
    return jsonify({
        'success': True,
        'message': 'تم تحديث بيانات الطالب بنجاح',
        'student': dict(student)
    })

@app.route('/api/student/<int:student_id>', methods=['DELETE'])
@roles_required('admin', 'school')
@scoped
def delete_student(student_id):
    """Delete a student and all related records"""
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        
        # Delete related records first (cascade deletion)
        # 1. Delete from student_grades
        cur.execute('DELETE FROM student_grades WHERE student_id = %s', (student_id,))
        grades_deleted = cur.rowcount
        
        # 2. Delete from student_attendance
        cur.execute('DELETE FROM student_attendance WHERE student_id = %s', (student_id,))
        attendance_deleted = cur.rowcount
        
        # 3. Finally delete the student
        cur.execute('DELETE FROM students WHERE id = %s', (student_id,))
        row_count = cur.rowcount
        
        conn.commit()
        
        print(f"Deleted student {student_id}: {grades_deleted} grade records, {attendance_deleted} attendance records")
    finally:
        conn.close()
        
    if row_count == 0:
        return jsonify({'error': 'Student not found', 'error_ar': 'لم يتم العثور على الطالب'}), 404
        
    return jsonify({
        'success': True,
        'message': 'تم حذف الطالب وجميع بياناته المرتبطة بنجاح',
        'deleted': row_count,
        'details': {
            'grade_records_deleted': grades_deleted,
            'attendance_records_deleted': attendance_deleted
        }
    })

@app.route('/api/student/<int:student_id>/detailed', methods=['PUT'])
@roles_required('admin', 'school')
@scoped
def update_student_detailed(student_id):
    data = request.json
    detailed_scores = data.get('detailed_scores')
    daily_attendance = data.get('daily_attendance')
    
    if not detailed_scores and not daily_attendance:
        return jsonify({
            'error': 'Either detailed_scores or daily_attendance must be provided',
            'error_ar': 'يجب تقديم إما الدرجات التفصيلية أو بيانات الحضور'
        }), 400
        
    # Get current student to check grade
    query_select = "SELECT grade FROM students WHERE id = %s"
    student_grade = None
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(query_select, (student_id,))
        row = cur.fetchone()
        if row: student_grade = row[0]
    finally:
        conn.close()
        
    if not student_grade:
        return jsonify({'error': 'Student not found', 'error_ar': 'لم يتم العثور على الطالب'}), 404
        
    final_detailed_scores = detailed_scores
    if detailed_scores:
        cleaned_scores = {}
        for subject, scores in detailed_scores.items():
            if subject == '[object Object]': continue
            if isinstance(subject, str) and len(subject) > 0:
                cleaned_scores[subject] = scores
        
        grade_parts = student_grade.split(' - ')
        if len(grade_parts) >= 2:
            # Use the helper function to check if this is elementary grades 1-4
            is_primary_1_to_4 = is_elementary_grades_1_to_4(student_grade)
            
            for subject, scores in cleaned_scores.items():
                if not isinstance(scores, dict): continue
                for period, score_val in scores.items():
                    try:
                        score = int(score_val)
                        if is_primary_1_to_4:
                            if score < 0 or score > 10:
                                return jsonify({'error': 'For grades 1-4, scores must be between 0 and 10', 'error_ar': 'للصفوف 1-4، يجب أن تكون الدرجات بين 0 و 10'}), 400
                        else:
                            if score < 0 or score > 100:
                                return jsonify({'error': 'Scores must be between 0 and 100', 'error_ar': 'يجب أن تكون الدرجات بين 0 و 100'}), 400
                    except (ValueError, TypeError): pass
        final_detailed_scores = cleaned_scores

    update_fields = []
    params = []
    if detailed_scores is not None:
        update_fields.append("detailed_scores = %s")
        params.append(json.dumps(final_detailed_scores))
    if daily_attendance is not None:
        update_fields.append("daily_attendance = %s")
        params.append(json.dumps(daily_attendance))
    
    params.append(student_id)
    query_update = f"UPDATE students SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
                   
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        cur.execute(query_update, tuple(params))
        conn.commit()
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': 'تم تحديث بيانات الطالب بنجاح'})

# ------ Subjects Routes ------
@app.route('/api/school/<int:school_id>/subjects', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_subjects(school_id):
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error

    query = 'SELECT * FROM subjects WHERE school_id = %s ORDER BY grade_level, name'
    subjects = []
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, (school_id,))
        subjects = cur.fetchall()
    finally:
        conn.close()
    return jsonify({'success': True, 'subjects': subjects})

@app.route('/api/school/<int:school_id>/subject', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def add_subject(school_id):
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error
    data = request.json
    name = data.get('name')
    grade_level = data.get('grade_level')
    
    if not name:
        return jsonify({'error': 'Subject name is required', 'error_ar': 'اسم المادة مطلوب'}), 400
        
    query = "INSERT INTO subjects (school_id, name, grade_level) VALUES (%s, %s, %s)"
    params = (school_id, name, grade_level)
    
    subject = None
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, params)
        last_id = cur.lastrowid
        conn.commit()
        cur.execute('SELECT * FROM subjects WHERE id = %s', (last_id,))
        subject = cur.fetchone()
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': 'تم إضافة المادة بنجاح', 'subject': dict(subject)}), 201

@app.route('/api/subject/<int:subject_id>', methods=['PUT'])
@roles_required('admin', 'school')
@scoped
def update_subject(subject_id):
    data = request.json
    name = data.get('name')
    grade_level = data.get('grade_level')
    
    query = "UPDATE subjects SET name = %s, grade_level = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s"
    params = (name, grade_level, subject_id)
    
    subject = None
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, params)
        conn.commit()
        cur.execute('SELECT * FROM subjects WHERE id = %s', (subject_id,))
        subject = cur.fetchone()
    finally:
        conn.close()
        
    if not subject:
        return jsonify({'error': 'Subject not found', 'error_ar': 'لم يتم العثور على المادة'}), 404
        
    return jsonify({'success': True, 'message': 'تم تحديث المادة بنجاح', 'subject': dict(subject)})

@app.route('/api/subject/<int:subject_id>', methods=['DELETE'])
@roles_required('admin', 'school')
@scoped
def delete_subject(subject_id):
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        cur.execute('DELETE FROM subjects WHERE id = %s', (subject_id,))
        row_count = cur.rowcount
        conn.commit()
    finally:
        conn.close()
        
    if row_count == 0:
        return jsonify({'error': 'Subject not found', 'error_ar': 'لم يتم العثور على المادة'}), 404
        
    return jsonify({'success': True, 'message': 'تم حذف المادة بنجاح', 'deleted': row_count})

# ------ Grade Levels Routes ------
@app.route('/api/school/<int:school_id>/grade-levels', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_grade_levels(school_id):
    """Get all grade levels for a school"""
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error
    query = 'SELECT * FROM grade_levels WHERE school_id = %s ORDER BY display_order, name'
    grade_levels = []
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, (school_id,))
        grade_levels = cur.fetchall()
    finally:
        conn.close()
    return jsonify({'success': True, 'grade_levels': grade_levels})

@app.route('/api/school/<int:school_id>/grade-level', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def add_grade_level(school_id):
    """Add a new grade level for a school"""
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error
    data = request.json
    name = data.get('name')
    display_order = data.get('display_order', 0)
    
    if not name:
        return jsonify({'error': 'Grade level name is required', 'error_ar': 'اسم المستوى الدراسي مطلوب'}), 400
        
    # Check for duplicate
    check_query = 'SELECT id FROM grade_levels WHERE school_id = %s AND name = %s'
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(check_query, (school_id, name))
        if cur.fetchone():
            return jsonify({'error': 'Grade level already exists', 'error_ar': 'هذا المستوى الدراسي موجود بالفعل'}), 400
        
        query = 'INSERT INTO grade_levels (school_id, name, display_order) VALUES (%s, %s, %s)'
        cur.execute(query, (school_id, name, display_order))
        last_id = cur.lastrowid
        conn.commit()
        cur.execute('SELECT * FROM grade_levels WHERE id = %s', (last_id,))
        grade_level = cur.fetchone()
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': 'تم إضافة المستوى الدراسي بنجاح', 'grade_level': dict(grade_level)}), 201

@app.route('/api/grade-level/<int:grade_level_id>', methods=['PUT'])
@roles_required('admin', 'school')
@scoped
def update_grade_level(grade_level_id):
    """Update an existing grade level"""
    data = request.json
    name = data.get('name')
    display_order = data.get('display_order')
    
    if not name:
        return jsonify({'error': 'Grade level name is required', 'error_ar': 'اسم المستوى الدراسي مطلوب'}), 400
    
    query = 'UPDATE grade_levels SET name = %s, display_order = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s'
    params = (name, display_order or 0, grade_level_id)
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, params)
        conn.commit()
        cur.execute('SELECT * FROM grade_levels WHERE id = %s', (grade_level_id,))
        grade_level = cur.fetchone()
    finally:
        conn.close()
        
    if not grade_level:
        return jsonify({'error': 'Grade level not found', 'error_ar': 'لم يتم العثور على المستوى الدراسي'}), 404
        
    return jsonify({'success': True, 'message': 'تم تحديث المستوى الدراسي بنجاح', 'grade_level': dict(grade_level)})

@app.route('/api/grade-level/<int:grade_level_id>', methods=['DELETE'])
@roles_required('admin', 'school')
@scoped
def delete_grade_level(grade_level_id):
    """Delete a grade level"""
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        cur.execute('DELETE FROM grade_levels WHERE id = %s', (grade_level_id,))
        row_count = cur.rowcount
        conn.commit()
    finally:
        conn.close()
        
    if row_count == 0:
        return jsonify({'error': 'Grade level not found', 'error_ar': 'لم يتم العثور على المستوى الدراسي'}), 404
        
    return jsonify({'success': True, 'message': 'تم حذف المستوى الدراسي بنجاح', 'deleted': row_count})

@app.route('/api/school/<int:school_id>/grade-levels/bulk', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def add_bulk_grade_levels(school_id):
    """Add multiple grade levels at once"""
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error
    data = request.json
    grade_levels = data.get('grade_levels', [])
    
    if not grade_levels:
        return jsonify({'error': 'Grade levels list is required', 'error_ar': 'قائمة المستويات الدراسية مطلوبة'}), 400
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    added = []
    try:
        cur = conn.cursor(dictionary=True)
        for i, gl in enumerate(grade_levels):
            name = gl.get('name') if isinstance(gl, dict) else gl
            if not name:
                continue
            display_order = gl.get('display_order', i) if isinstance(gl, dict) else i
            
            # Check for duplicate
            cur.execute('SELECT id FROM grade_levels WHERE school_id = %s AND name = %s', (school_id, name))
            if cur.fetchone():
                continue
            
            cur.execute('INSERT INTO grade_levels (school_id, name, display_order) VALUES (%s, %s, %s)',
                       (school_id, name, display_order))
            last_id = cur.lastrowid
            cur.execute('SELECT * FROM grade_levels WHERE id = %s', (last_id,))
            added.append(dict(cur.fetchone()))
        conn.commit()
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': f'تم إضافة {len(added)} مستوى دراسي', 'grade_levels': added}), 201

# ------ Teachers Routes ------
@app.route('/api/school/<int:school_id>/teachers', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_teachers(school_id):
    """Get all teachers for a school with their subjects and optional search/filter"""
    grade_level = request.args.get('grade_level')
    search_query = request.args.get('search', '').strip()
    
    # Base query - dialect-aware aggregation of subject names/ids
    base_query = f'''SELECT t.*, 
                           COALESCE({group_concat_sql('s.name')}, '') as subject_names,
                           COALESCE({group_concat_sql('ts.subject_id')}, '') as subject_ids
                    FROM teachers t 
                    LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
                    LEFT JOIN subjects s ON ts.subject_id = s.id'''
    
    # Build WHERE clause
    where_conditions = ['t.school_id = %s']
    params = [school_id]
    
    if grade_level:
        where_conditions.append('t.grade_level = %s')
        params.append(grade_level)
    
    if search_query:
        where_conditions.append('(t.full_name LIKE %s OR t.teacher_code LIKE %s OR t.email LIKE %s)')
        search_pattern = f'%{search_query}%'
        params.extend([search_pattern, search_pattern, search_pattern])
    
    query = base_query + ' WHERE ' + ' AND '.join(where_conditions) + ' GROUP BY t.id ORDER BY t.grade_level, t.full_name'
    
    teachers = []
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, tuple(params))
        teachers = cur.fetchall()
        
        # Add detailed subject information for each teacher
        for teacher in teachers:
            teacher['subjects'] = get_teacher_subjects(teacher['id'])
            
    finally:
        conn.close()
    return jsonify({'success': True, 'teachers': teachers})

@app.route('/api/school/<int:school_id>/teacher', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def add_teacher(school_id):
    """Add a new teacher with unique code and multiple subjects"""
    try:
        data = request.json
        print(f"Received teacher creation request for school {school_id}")
        print(f"Request data: {data}")
        
        full_name = data.get('full_name')
        phone = data.get('phone')
        email = data.get('email')
        # Accept both subject_ids (array) and subject_id (single value) for compatibility
        subject_ids = data.get('subject_ids', [])
        if not subject_ids and data.get('subject_id'):
            subject_ids = [data.get('subject_id')]
        free_text_subjects = data.get('free_text_subjects', '')  # Free-text subjects
        grade_level = data.get('grade_level')
        specialization = data.get('specialization')
        
        print(f"Processing teacher: {full_name}, Grade: {grade_level}")
        
        if not full_name:
            error_msg = 'Teacher name is required'
            print(f"Validation error: {error_msg}")
            return jsonify({
                'error': error_msg,
                'error_ar': 'اسم المعلم مطلوب'
            }), 400
        
        if not grade_level:
            error_msg = 'Grade level is required'
            print(f"Validation error: {error_msg}")
            return jsonify({
                'error': error_msg,
                'error_ar': 'المستوى الدراسي مطلوب'
            }), 400
        
        # Generate unique teacher code
        print("Generating unique teacher code...")
        teacher_code = get_unique_teacher_code(school_id)
        print(f"Generated teacher code: {teacher_code}")
        
        # Insert teacher record
        query = '''INSERT INTO teachers (school_id, full_name, teacher_code, phone, email, password_hash, grade_level, specialization, free_text_subjects) 
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)'''
        params = (school_id, full_name, teacher_code, phone, email, None, grade_level, specialization, free_text_subjects)
        
        print("Executing database insert...")
        teacher = None
        pool = get_mysql_pool()
        if not pool:
            error_msg = 'Database connection failed'
            print(f"Database error: {error_msg}")
            return jsonify({'error': error_msg, 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
            
        conn = pool.get_connection()
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(query, params)
            teacher_id = cur.lastrowid
            conn.commit()
            print(f"Teacher inserted with ID: {teacher_id}")
            
            # Assign subjects to teacher
            if subject_ids and isinstance(subject_ids, list):
                print(f"Assigning {len(subject_ids)} subjects to teacher")
                for subject_id in subject_ids:
                    cur.execute('''INSERT INTO teacher_subjects (teacher_id, subject_id) 
                                   VALUES (%s, %s)''', (teacher_id, subject_id))
                conn.commit()
            
            # Fetch the created teacher with subjects
            cur.execute(f'''SELECT t.id, t.school_id, t.full_name, t.teacher_code, t.phone, t.email,
                                  t.grade_level, t.specialization, t.free_text_subjects, t.created_at, t.updated_at,
                                  COALESCE({group_concat_sql('s.name')}, '') as subject_names,
                                  COALESCE({group_concat_sql('ts.subject_id')}, '') as subject_ids
                           FROM teachers t 
                           LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
                           LEFT JOIN subjects s ON ts.subject_id = s.id
                           WHERE t.id = %s
                           GROUP BY t.id, t.school_id, t.full_name, t.teacher_code, t.phone, t.email, 
                                    t.grade_level, t.specialization, t.free_text_subjects, 
                                    t.created_at, t.updated_at''', (teacher_id,))
            teacher = cur.fetchone()
            
            # Also get detailed subject information
            if teacher:
                teacher['subjects'] = get_teacher_subjects(teacher_id)
                print(f"Teacher fetched successfully: {teacher['full_name']}")
                
        finally:
            conn.close()
            
        return jsonify({
            'success': True,
            'message': 'تم إضافة المعلم بنجاح',
            'teacher': dict(teacher),
            'teacher_code': teacher_code
        }), 201
        
    except Exception as e:
        print(f"Unexpected error in add_teacher: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({
            'error': f'Unexpected error occurred: {str(e)}',
            'error_ar': f'حدث خطأ غير متوقع: {str(e)}',
            'error_type': type(e).__name__
        }), 500

@app.route('/api/teacher/<int:teacher_id>', methods=['PUT'])
@roles_required('admin', 'school')
@scoped
def update_teacher(teacher_id):
    """Update a teacher and their subjects"""
    data = request.json
    full_name = data.get('full_name')
    phone = data.get('phone')
    email = data.get('email')
    subject_ids = data.get('subject_ids', [])  # Now accepts array of subject IDs
    grade_level = data.get('grade_level')
    specialization = data.get('specialization')
    
    if not full_name or not grade_level:
        return jsonify({
            'error': 'Teacher name and grade level are required',
            'error_ar': 'اسم المعلم والمستوى الدراسي مطلوبان'
        }), 400
    
    query = '''UPDATE teachers SET full_name = %s, phone = %s, email = %s, password_hash = %s, 
               grade_level = %s, specialization = %s, 
               updated_at = CURRENT_TIMESTAMP WHERE id = %s'''
    params = (full_name, phone, email, None, grade_level, specialization, teacher_id)
    
    teacher = None
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, params)
        conn.commit()
        
        # Update teacher subjects
        # First delete existing subject assignments
        cur.execute('DELETE FROM teacher_subjects WHERE teacher_id = %s', (teacher_id,))
        
        # Then add new subject assignments
        if subject_ids and isinstance(subject_ids, list):
            for subject_id in subject_ids:
                cur.execute('''INSERT INTO teacher_subjects (teacher_id, subject_id) 
                               VALUES (%s, %s)''', (teacher_id, subject_id))
            conn.commit()
        
        # Fetch the updated teacher with subjects
        cur.execute(f'''SELECT t.*,
                              COALESCE({group_concat_sql('s.name')}, '') as subject_names,
                              COALESCE({group_concat_sql('ts.subject_id')}, '') as subject_ids
                       FROM teachers t 
                       LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
                       LEFT JOIN subjects s ON ts.subject_id = s.id
                       WHERE t.id = %s
                       GROUP BY t.id''', (teacher_id,))
        teacher = cur.fetchone()
        
        # Also get detailed subject information
        if teacher:
            teacher['subjects'] = get_teacher_subjects(teacher_id)
            
    finally:
        conn.close()
        
    if not teacher:
        return jsonify({'error': 'Teacher not found', 'error_ar': 'لم يتم العثور على المعلم'}), 404
        
    return jsonify({
        'success': True,
        'message': 'تم تحديث بيانات المعلم بنجاح',
        'teacher': dict(teacher)
    })

@app.route('/api/teacher/<int:teacher_id>/regenerate-code', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def regenerate_teacher_code(teacher_id):
    """Regenerate teacher code for an existing teacher"""
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Get teacher's school_id first
        cur.execute('SELECT school_id FROM teachers WHERE id = %s', (teacher_id,))
        teacher = cur.fetchone()
        
        if not teacher:
            return jsonify({'error': 'Teacher not found', 'error_ar': 'لم يتم العثور على المعلم'}), 404
            
        # Generate new unique code
        new_code = get_unique_teacher_code(teacher['school_id'])
        
        # Update teacher record
        cur.execute('UPDATE teachers SET teacher_code = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s', 
                   (new_code, teacher_id))
        conn.commit()
        
        # Fetch updated teacher
        cur.execute(f'''SELECT t.*,
                              COALESCE({group_concat_sql('s.name')}, '') as subject_names,
                              COALESCE({group_concat_sql('ts.subject_id')}, '') as subject_ids
                       FROM teachers t 
                       LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id
                       LEFT JOIN subjects s ON ts.subject_id = s.id
                       WHERE t.id = %s
                       GROUP BY t.id''', (teacher_id,))
        updated_teacher = cur.fetchone()
        
        if updated_teacher:
            updated_teacher['subjects'] = get_teacher_subjects(teacher_id)
            
    finally:
        conn.close()
        
    return jsonify({
        'success': True,
        'message': 'تم تجديد رمز المعلم بنجاح',
        'teacher': dict(updated_teacher),
        'new_code': new_code
    })

@app.route('/api/teacher/<int:teacher_id>', methods=['DELETE'])
@roles_required('admin', 'school')
@scoped
def delete_teacher(teacher_id):
    """Delete a teacher and all related records"""
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        
        # Delete related records first (cascade deletion)
        # 1. Delete from teacher_subjects
        cur.execute('DELETE FROM teacher_subjects WHERE teacher_id = %s', (teacher_id,))
        subjects_deleted = cur.rowcount
        
        # 2. Delete from teacher_class_assignments
        cur.execute('DELETE FROM teacher_class_assignments WHERE teacher_id = %s', (teacher_id,))
        assignments_deleted = cur.rowcount
        
        # 3. Finally delete the teacher
        cur.execute('DELETE FROM teachers WHERE id = %s', (teacher_id,))
        row_count = cur.rowcount
        
        conn.commit()
        
        print(f"Deleted teacher {teacher_id}: {subjects_deleted} subject assignments, {assignments_deleted} class assignments")
    finally:
        conn.close()
        
    if row_count == 0:
        return jsonify({'error': 'Teacher not found', 'error_ar': 'لم يتم العثور على المعلم'}), 404
        
    return jsonify({
        'success': True, 
        'message': 'تم حذف المعلم وجميع بياناته المرتبطة بنجاح', 
        'deleted': row_count,
        'details': {
            'subject_assignments_deleted': subjects_deleted,
            'class_assignments_deleted': assignments_deleted
        }
    })

# ------ Teacher Authentication Routes ------

@app.route('/api/teacher/login', methods=['POST'])
def teacher_login():
    """Authenticate teacher by teacher code (and password when configured)"""
    data = request.get_json(silent=True) or {}
    teacher_code = str(data.get('teacher_code') or '').strip()

    if not teacher_code:
        return jsonify({
            'error': 'Teacher code is required',
            'error_ar': 'رمز المعلم مطلوب'
        }), 400

    lock_key = f"teacher:{teacher_code}"
    locked = _locked_response(lock_key)
    if locked:
        return locked

    teacher = _fetch_one(
        '''SELECT t.id, t.school_id, t.full_name, t.teacher_code, t.email, t.phone,
                  t.grade_level, t.password_hash, sch.name AS school_name,
                  sch.is_suspended AS school_suspended
           FROM teachers t
           JOIN schools sch ON t.school_id = sch.id
           WHERE t.teacher_code = %s''',
        (teacher_code,)
    )

    if not teacher:
        _record_login_failure(lock_key)
        return _invalid_credentials()

    ok, error = _portal_password_valid(teacher)
    if not ok:
        _record_login_failure(lock_key)
        return error or _invalid_credentials()

    if teacher.get('school_suspended'):
        return jsonify({
            'error': 'School account is suspended',
            'error_ar': 'حساب المدرسة موقوف'
        }), 403

    security_middleware.account_lockout.reset_failed_attempts(lock_key)

    teacher['subjects'] = get_teacher_subjects(teacher['id'])

    token = jwt.encode({
        'id': teacher['id'],
        'teacher_code': teacher['teacher_code'],
        'name': teacher['full_name'],
        'role': 'teacher',
        'school_id': teacher['school_id'],
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=JWT_EXPIRES_HOURS)
    }, JWT_SECRET, algorithm='HS256')

    return jsonify({
        'success': True,
        'token': token,
        'teacher': {
            'id': teacher['id'],
            'school_id': teacher['school_id'],
            'school_name': teacher['school_name'],
            'full_name': teacher['full_name'],
            'teacher_code': teacher['teacher_code'],
            'email': teacher['email'],
            'phone': teacher['phone'],
            'grade_level': teacher['grade_level'],
            'subjects': teacher['subjects'],
        }
    })

@app.route('/api/teacher/<int:teacher_id>/authorized-subjects', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_teacher_authorized_subjects(teacher_id):
    """Get subjects that a teacher is authorized to teach"""
    try:
        # First verify the teacher exists and get their school
        teacher_query = 'SELECT school_id, grade_level FROM teachers WHERE id = %s'
        pool = get_mysql_pool()
        if not pool:
            return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
            
        conn = pool.get_connection()
        try:
            cur = conn.cursor(dictionary=True)
            cur.execute(teacher_query, (teacher_id,))
            teacher = cur.fetchone()
            
            if not teacher:
                return jsonify({'error': 'Teacher not found', 'error_ar': 'لم يتم العثور على المعلم'}), 404
            
            # Get all subjects for the teacher's school and grade level
            subjects_query = '''SELECT s.* FROM subjects s 
                               WHERE s.school_id = %s 
                               AND s.grade_level = %s
                               ORDER BY s.name'''
            
            cur.execute(subjects_query, (teacher['school_id'], teacher['grade_level']))
            authorized_subjects = cur.fetchall()
            
            return jsonify({
                'success': True,
                'subjects': authorized_subjects,
                'count': len(authorized_subjects),
                'teacher_grade_level': teacher['grade_level']
            })
            
        finally:
            conn.close()
            
    except Exception as e:
        print(f"Error getting authorized subjects: {str(e)}")
        return jsonify({
            'error': f'Failed to get authorized subjects: {str(e)}',
            'error_ar': f'فشل في الحصول على المواد المسموحة: {str(e)}'
        }), 500

@app.route('/api/teacher/<int:teacher_id>/subjects', methods=['GET'])
@roles_required('admin', 'school', 'teacher')
@scoped
def get_teacher_subjects_endpoint(teacher_id):
    """Get subjects assigned to a teacher"""
    from flask import g

    current_user = getattr(g, 'current_user', None)
    # Prevent teacher role from الوصول إلى بيانات معلم آخر
    if current_user and current_user.get('role') == 'teacher' and current_user.get('id') != teacher_id:
        return jsonify({'error': 'Access denied', 'error_ar': 'الوصول مرفوض'}), 403

    subjects = get_teacher_subjects(teacher_id)
    return jsonify({'success': True, 'subjects': subjects})

@app.route('/api/teacher/<int:teacher_id>/students', methods=['GET'])
@roles_required('admin', 'school', 'teacher')
@scoped
def get_teacher_students_endpoint(teacher_id):
    """Get students taught by a teacher based on their subjects"""
    from flask import g

    current_user = getattr(g, 'current_user', None)
    if current_user and current_user.get('role') == 'teacher' and current_user.get('id') != teacher_id:
        return jsonify({'error': 'Access denied', 'error_ar': 'الوصول مرفوض'}), 403

    academic_year_id = request.args.get('academic_year_id')
    students = get_teacher_students(teacher_id, academic_year_id)
    return jsonify({'success': True, 'students': students})

# ============================================================================
# TEACHER-CLASS ASSIGNMENT API ENDPOINTS
# ============================================================================

@app.route('/api/school/<int:school_id>/teachers-with-assignments', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_school_teachers_with_assignments_endpoint(school_id):
    """Get all teachers in a school with their class assignments"""
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error

    academic_year_id = request.args.get('academic_year_id')
    teachers = get_school_teachers_with_assignments(school_id, academic_year_id)
    return jsonify({'success': True, 'teachers': teachers})

@app.route('/api/class/<string:class_name>/teachers', methods=['GET'])
@roles_required('admin', 'school', 'teacher')
def get_class_teachers_endpoint(class_name):
    """Get all teachers assigned to a specific class (scoped to the caller's school)"""
    current_user = g.current_user
    academic_year_id = request.args.get('academic_year_id')
    if current_user.get('role') == 'admin':
        school_id = request.args.get('school_id', type=int)
    else:
        school_id = _own_school_id(current_user)
    teachers = get_class_teachers(class_name, academic_year_id, school_id=school_id)
    return jsonify({'success': True, 'teachers': teachers})

@app.route('/api/teacher/<int:teacher_id>/class-assignments', methods=['GET'])
@roles_required('admin', 'school', 'teacher')
@scoped
def get_teacher_class_assignments_endpoint(teacher_id):
    """Get all class assignments for a teacher"""
    from flask import g

    current_user = getattr(g, 'current_user', None)
    if current_user and current_user.get('role') == 'teacher' and current_user.get('id') != teacher_id:
        return jsonify({'error': 'Access denied', 'error_ar': 'الوصول مرفوض'}), 403

    academic_year_id = request.args.get('academic_year_id')
    assignments = get_teacher_class_assignments(teacher_id, academic_year_id)
    return jsonify({'success': True, 'assignments': assignments})

@app.route('/api/school/<int:school_id>/teacher-class-assignments', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_school_all_assignments_endpoint(school_id):
    """Get all teacher-class assignments for a school"""
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error

    academic_year_id = request.args.get('academic_year_id')
    assignments = get_school_teacher_class_assignments(school_id, academic_year_id)
    return jsonify({'success': True, 'assignments': assignments})

@app.route('/api/teacher-class-assignment', methods=['POST'])
@roles_required('admin', 'school')
def assign_teacher_to_class_endpoint():
    """Assign a teacher to teach a specific subject in a class"""
    data = request.json
    teacher_id = data.get('teacher_id')
    class_name = data.get('class_name')
    subject_id = data.get('subject_id')
    academic_year_id = data.get('academic_year_id')
    
    if not all([teacher_id, class_name, subject_id]):
        return jsonify({
            'error': 'Teacher ID, class name, and subject ID are required',
            'error_ar': 'معرف المعلم واسم الصف والمادة مطلوبة'
        }), 400

    # The teacher and the subject must both belong to the caller's school
    for kind, resource_id in (('teacher', teacher_id), ('subject', subject_id)):
        scope_error = ensure_resource_scope(kind, resource_id)
        if scope_error:
            return scope_error

    success = assign_teacher_to_class(teacher_id, class_name, subject_id, academic_year_id)
    
    if success:
        return jsonify({
            'success': True,
            'message': 'تم تعيين المعلم للصف بنجاح',
            'message_en': 'Teacher assigned to class successfully'
        }), 201
    else:
        return jsonify({
            'error': 'Failed to assign teacher to class',
            'error_ar': 'فشل في تعيين المعلم للصف'
        }), 500

@app.route('/api/teacher-class-assignment/<int:assignment_id>', methods=['DELETE'])
@roles_required('admin', 'school')
@scoped
def remove_teacher_from_class_endpoint(assignment_id):
    """Remove a teacher's class assignment"""
    success = remove_teacher_from_class(assignment_id)
    
    if success:
        return jsonify({
            'success': True,
            'message': 'تم إزالة تعيين المعلم من الصف بنجاح',
            'message_en': 'Teacher assignment removed successfully'
        })
    else:
        return jsonify({
            'error': 'Failed to remove teacher assignment',
            'error_ar': 'فشل في إزالة تعيين المعلم'
        }), 500

# ============================================================================
# ENHANCED TEACHER-SUBJECT ASSIGNMENT API ENDPOINTS
# ============================================================================

@app.route('/api/teacher/<int:teacher_id>/subjects/assignments', methods=['GET'])
@roles_required('admin', 'school', 'teacher')
@scoped
def get_teacher_subjects_detailed(teacher_id):
    """Get all subjects assigned to a specific teacher with detailed information"""
    try:
        from database_helpers import get_teacher_subject_assignments, get_teacher_with_subjects
        from flask import g
        
        # For teacher role, verify they can only access their own subjects
        current_user = getattr(g, 'current_user', None)
        
        if current_user and current_user.get('role') == 'teacher':
            # Allow access if teacher is accessing their own data (by ID match)
            if current_user.get('id') == teacher_id:
                # Teacher is accessing their own data by ID - allow
                pass
            else:
                # Verify by teacher_code match
                teacher_data = get_teacher_with_subjects(teacher_id)
                if not teacher_data or teacher_data.get('teacher_code') != current_user.get('teacher_code'):
                    return jsonify({'error': 'Access denied', 'error_ar': 'الوصول مرفوض'}), 403
        
        subjects = get_teacher_subject_assignments(teacher_id)
        
        return jsonify({
            'success': True,
            'teacher_id': teacher_id,
            'subjects': subjects,
            'count': len(subjects)
        })
        
    except Exception as e:
        print(f"Error getting teacher subjects: {e}")
        return jsonify({'error': f'Error fetching subjects: {str(e)}', 'error_ar': f'خطأ في جلب المواد: {str(e)}'}), 500

@app.route('/api/teacher/<int:teacher_id>/subjects/assignments', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def assign_subjects_to_teacher_detailed(teacher_id):
    """Assign subjects to a teacher with comprehensive validation (both predefined and free-text)"""
    try:
        from database_helpers import assign_subjects_to_teacher, get_teacher_with_subjects
        
        data = request.json
        subject_ids = data.get('subject_ids', [])
        free_text_subjects = data.get('free_text_subjects', '')
        
        # Validate free_text_subjects if provided
        if free_text_subjects and isinstance(free_text_subjects, str):
            # Sanitize and validate the free-text subjects
            import re
            # Remove any potentially harmful characters, keeping only letters, numbers, spaces, commas, and Arabic characters
            # Remove HTML tags and potentially dangerous characters
            sanitized_free_text = re.sub(r'<[^>]*>', '', free_text_subjects)  # Remove HTML tags
            sanitized_free_text = re.sub(r'[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF,،\-\.\(\)]', '', sanitized_free_text)  # Keep safe characters
            
            # Limit length to prevent abuse
            if len(sanitized_free_text) > 1000:
                sanitized_free_text = sanitized_free_text[:1000]
        else:
            sanitized_free_text = ''
        
        # Update the teacher's free_text_subjects field
        pool = get_mysql_pool()
        if not pool:
            return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
            
        conn = pool.get_connection()
        try:
            cur = conn.cursor()
            # Update the free_text_subjects field
            update_query = "UPDATE teachers SET free_text_subjects = %s WHERE id = %s"
            cur.execute(update_query, (sanitized_free_text, teacher_id))
            conn.commit()
        finally:
            conn.close()
        
        # If subject_ids are provided, assign them as well
        if subject_ids:
            # Validate subject_ids is a list
            if not isinstance(subject_ids, list):
                return jsonify({
                    'error': 'Subject IDs must be provided as a list',
                    'error_ar': 'يجب تقديم معرفات المواد كقائمة'
                }), 400
                
            result = assign_subjects_to_teacher(teacher_id, subject_ids)
            
            if not result['success']:
                return jsonify({
                    'error': result['error'],
                    'error_ar': result['error']
                }), 400
        
        # Get updated teacher data
        updated_teacher = get_teacher_with_subjects(teacher_id)
        
        return jsonify({
            'success': True,
            'message': 'Subjects assigned successfully',
            'teacher': updated_teacher,
            'assigned_count': len(updated_teacher.get('subjects', []))
        })
        
    except Exception as e:
        print(f"Error assigning subjects to teacher: {e}")
        return jsonify({
            'error': f'Error assigning subjects: {str(e)}',
            'error_ar': f'خطأ في تعيين المواد: {str(e)}'
        }), 500

@app.route('/api/teacher/<int:teacher_id>/subjects/<int:subject_id>', methods=['DELETE'])
@roles_required('admin', 'school')
@scoped
def remove_subject_from_teacher_detailed(teacher_id, subject_id):
    """Remove a specific subject assignment from a teacher"""
    try:
        from database_helpers import remove_subject_from_teacher, get_teacher_with_subjects
        
        result = remove_subject_from_teacher(teacher_id, subject_id)
        
        if not result['success']:
            return jsonify({
                'error': result['error'],
                'error_ar': result['error']
            }), 400
            
        # Get updated teacher data
        updated_teacher = get_teacher_with_subjects(teacher_id)
        
        return jsonify({
            'success': True,
            'message': result['message'],
            'teacher': updated_teacher
        })
        
    except Exception as e:
        print(f"Error removing subject from teacher: {e}")
        return jsonify({
            'error': f'Error removing subject: {str(e)}',
            'error_ar': f'خطأ في إزالة المادة: {str(e)}'
        }), 500

@app.route('/api/school/<int:school_id>/subjects/available', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_available_subjects_detailed(school_id):
    """Get all available subjects for a school with filtering options"""
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error

    try:
        from database_helpers import get_available_subjects_for_school
        
        # Get optional grade_level filter
        grade_level = request.args.get('grade_level')
        
        subjects = get_available_subjects_for_school(school_id, grade_level)
        
        return jsonify({
            'success': True,
            'school_id': school_id,
            'subjects': subjects,
            'count': len(subjects),
            'grade_level_filter': grade_level
        })
        
    except Exception as e:
        print(f"Error getting available subjects: {e}")
        return jsonify({
            'error': f'Error fetching subjects: {str(e)}',
            'error_ar': f'خطأ في جلب المواد: {str(e)}'
        }), 500

@app.route('/api/subject/<int:subject_id>/teachers', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_teachers_by_subject_detailed(subject_id):
    """Get all teachers assigned to a specific subject"""
    try:
        from database_helpers import get_teachers_by_subject
        
        teachers = get_teachers_by_subject(subject_id)
        
        return jsonify({
            'success': True,
            'subject_id': subject_id,
            'teachers': teachers,
            'count': len(teachers)
        })
        
    except Exception as e:
        print(f"Error getting teachers by subject: {e}")
        return jsonify({
            'error': f'Error fetching teachers: {str(e)}',
            'error_ar': f'خطأ في جلب المعلمين: {str(e)}'
        }), 500

# Teacher-specific grade management
@app.route('/api/teacher/grades', methods=['POST'])
@roles_required('teacher')
def teacher_add_grade():
    """Add/update grades for teacher's authorized subjects only"""
    from flask import g
    data = request.json
    student_id = data.get('student_id')
    subject_name = data.get('subject_name')
    academic_year_id = data.get('academic_year_id')
    grades = data.get('grades', {})
    
    if not all([student_id, subject_name, academic_year_id]):
        return jsonify({
            'error': 'Student ID, subject name, and academic year are required',
            'error_ar': 'معرف الطالب واسم المادة والسنة الدراسية مطلوبة'
        }), 400
    
    # Verify teacher has access to this subject
    current_user = getattr(g, 'current_user', None)
    if not current_user:
        return jsonify({'error': 'Authentication required', 'error_ar': 'مصادقة مطلوبة'}), 401
    teacher_id = current_user.get('id')
    teacher_subjects = get_teacher_subjects(teacher_id)
    subject_names = [s['name'] for s in teacher_subjects]
    
    if subject_name not in subject_names:
        return jsonify({
            'error': 'Unauthorized subject',
            'error_ar': 'مادة غير مصرح بها'
        }), 403
    
    # Check if student is in teacher's grade level
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Verify student exists and check if student's grade matches subject's grade level
        # Student grade format: "ابتدائي - الأول الابتدائي"
        # Subject grade_level format: "الأول الابتدائي"
        # We need to match using LIKE or ends-with pattern
        cur.execute('''SELECT s.grade, s.id, s.school_id FROM students s 
                       WHERE s.id = %s''', 
                   (student_id,))
        student = cur.fetchone()
        
        if not student:
            return jsonify({
                'error': 'Student not found',
                'error_ar': 'الطالب غير موجود'
            }), 404

        # Multi-tenant isolation: a teacher may only grade students of their school
        current_school = _own_school_id(current_user)
        if current_school is None or int(student['school_id']) != int(current_school):
            return _scope_denied('لا يمكنك الوصول إلى طالب من مدرسة أخرى')
        
        # Get the subject's grade_level
        cur.execute('''SELECT grade_level FROM subjects 
                       WHERE name = %s AND school_id IN 
                       (SELECT school_id FROM teachers WHERE id = %s)''',
                   (subject_name, teacher_id))
        subject = cur.fetchone()
        
        # Verify the student's grade matches the subject's grade level
        # Student grade could be "ابتدائي - الأول الابتدائي" and subject grade_level is "الأول الابتدائي"
        # Skip grade verification for free-text subjects (subject not found in subjects table)
        if subject and subject.get('grade_level'):
            grade_level = subject['grade_level']
            student_grade = student['grade']
            # Check if student grade ends with the subject's grade level or contains it
            if not (student_grade == grade_level or 
                    student_grade.endswith(' - ' + grade_level) or
                    student_grade.endswith('- ' + grade_level) or
                    grade_level in student_grade):
                return jsonify({
                    'error': 'Student is not in the grade level for this subject',
                    'error_ar': 'الطالب ليس في المستوى الدراسي لهذه المادة'
                }), 403
        # If subject is not found in subjects table (free-text subject),
        # نسمح للمعلم بالحفظ طالما هو مخوّل لهذه المادة

        # Determine grade scale using centralized helper
        scale_info = get_grade_scale(student.get('grade'))
        min_score = scale_info['min_score']
        max_score = scale_info['max_score']

        # Sanitize and validate grades values according to scale
        allowed_keys = ['month1', 'month2', 'midterm', 'month3', 'month4', 'final']
        sanitized_grades = {}
        for key in allowed_keys:
            raw_val = grades.get(key, 0)
            try:
                score = int(raw_val)
            except (TypeError, ValueError):
                return jsonify({
                    'error': 'Invalid score value',
                    'error_ar': 'قيمة درجة غير صحيحة'
                }), 400

            if score < min_score or score > max_score:
                return jsonify({
                    'error': f'Scores must be between {min_score} and {max_score}',
                    'error_ar': f'يجب أن تكون الدرجات بين {min_score} و {max_score}'
                }), 400

            sanitized_grades[key] = score

        # Upsert relies on the unique index on
        # (student_id, academic_year_id, subject_name) created at startup.
        cur.execute('''INSERT INTO student_grades
                       (student_id, academic_year_id, subject_name,
                        month1, month2, midterm, month3, month4, final)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (student_id, academic_year_id, subject_name)
                       DO UPDATE SET month1 = EXCLUDED.month1, month2 = EXCLUDED.month2,
                                     midterm = EXCLUDED.midterm, month3 = EXCLUDED.month3,
                                     month4 = EXCLUDED.month4, final = EXCLUDED.final''',
                   (student_id, academic_year_id, subject_name,
                    sanitized_grades.get('month1', 0), sanitized_grades.get('month2', 0), sanitized_grades.get('midterm', 0),
                    sanitized_grades.get('month3', 0), sanitized_grades.get('month4', 0), sanitized_grades.get('final', 0)))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'تم حفظ الدرجات بنجاح'
        })
        
    finally:
        conn.close()

@app.route('/api/teacher/attendance', methods=['POST'])
@roles_required('teacher')
def teacher_record_attendance():
    """Record attendance for teacher's authorized classes only"""
    from flask import g
    data = request.json
    student_id = data.get('student_id')
    academic_year_id = data.get('academic_year_id')
    attendance_date = data.get('attendance_date')
    status = data.get('status', 'present')
    notes = data.get('notes', '')
    
    if not all([student_id, academic_year_id, attendance_date]):
        return jsonify({
            'error': 'Student ID, academic year, and date are required',
            'error_ar': 'معرف الطالب والسنة الدراسية والتاريخ مطلوبة'
        }), 400
    
    # Verify teacher has access to this student (based on grade level)
    current_user = getattr(g, 'current_user', None)
    if not current_user:
        return jsonify({'error': 'Authentication required', 'error_ar': 'مصادقة مطلوبة'}), 401
    teacher_id = current_user.get('id')
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Verify student exists and is in teacher's grade level
        # First get all subjects taught by this teacher
        cur.execute('''SELECT s.grade_level 
                       FROM teacher_subjects ts
                       JOIN subjects s ON ts.subject_id = s.id
                       WHERE ts.teacher_id = %s AND s.grade_level IS NOT NULL''',
                   (teacher_id,))
        teacher_grade_levels = [row['grade_level'] for row in cur.fetchall()]
        
        if not teacher_grade_levels:
            return jsonify({
                'error': 'Teacher has no assigned subjects',
                'error_ar': 'المعلم لا يملك مواد مسندة'
            }), 403
        
        # Get the student to check their grade
        cur.execute('SELECT grade, school_id FROM students WHERE id = %s', (student_id,))
        student = cur.fetchone()
        
        if not student:
            return jsonify({
                'error': 'Student not found',
                'error_ar': 'الطالب غير موجود'
            }), 404

        # Multi-tenant isolation: a teacher may only record attendance for their school
        current_school = _own_school_id(current_user)
        if current_school is None or int(student['school_id']) != int(current_school):
            return _scope_denied('لا يمكنك الوصول إلى طالب من مدرسة أخرى')
        
        # Check if student's grade matches any of teacher's grade levels
        # Student grade format: "ابتدائي - الأول الابتدائي"
        # Subject grade_level format: "الأول الابتدائي"
        student_grade = student['grade']
        is_authorized = False
        
        for grade_level in teacher_grade_levels:
            # Check exact match or if student grade ends with the subject's grade level
            if (student_grade == grade_level or 
                student_grade.endswith(' - ' + grade_level) or
                student_grade.endswith('- ' + grade_level) or
                grade_level in student_grade):
                is_authorized = True
                break
        
        if not is_authorized:
            return jsonify({
                'error': 'Student not found or unauthorized',
                'error_ar': 'الطالب غير موجود أو غير مصرح به'
            }), 403
        
        # Upsert relies on the unique index on
        # (student_id, academic_year_id, attendance_date) created at startup.
        cur.execute('''INSERT INTO student_attendance
                      (student_id, academic_year_id, attendance_date, status, notes)
                      VALUES (%s, %s, %s, %s, %s)
                      ON CONFLICT (student_id, academic_year_id, attendance_date)
                      DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes''',
                   (student_id, academic_year_id, attendance_date, status, notes))
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'تم تسجيل الحضور بنجاح'
        })
        
    finally:
        conn.close()

# ------ Academic Years Routes ------

def get_current_academic_year_name():
    """Calculate the current academic year based on the current date.
    Academic year starts in September and ends in June.
    For example: If current date is between Sep 2025 - June 2026, the year is 2025/2026
    """
    now = datetime.datetime.now()
    current_month = now.month
    current_year = now.year
    
    # If we're between September and December, the academic year is current_year/next_year
    # If we're between January and August, the academic year is previous_year/current_year
    if current_month >= 9:  # September to December
        start_year = current_year
        end_year = current_year + 1
    else:  # January to August
        start_year = current_year - 1
        end_year = current_year
    
    return f"{start_year}/{end_year}", start_year, end_year

@app.route('/api/academic-year/current', methods=['GET'])
@roles_required('admin', 'school', 'teacher', 'student')
def get_current_academic_year_info():
    """Get the current academic year information - automatically calculated from system date"""
    # Calculate the current academic year based on the current date
    name, start_year, end_year = get_current_academic_year_name()
    
    pool = get_mysql_pool()
    if pool:
        conn = pool.get_connection()
        try:
            cur = conn.cursor(dictionary=True)
            # Try to find the calculated year in the database
            cur.execute('SELECT * FROM system_academic_years WHERE name = %s', (name,))
            current_year = cur.fetchone()
            
            if current_year:
                return jsonify({
                    'success': True,
                    'academic_year_id': current_year['id'],
                    'academic_year_name': current_year['name'],
                    'current_academic_year': current_year
                })
            else:
                # Create the academic year if it doesn't exist
                start_date = f"{start_year}-09-01"
                end_date = f"{end_year}-06-30"
                cur.execute('''INSERT INTO system_academic_years (name, start_year, end_year, start_date, end_date, is_current) 
                               VALUES (%s, %s, %s, %s, %s, 1)''',
                           (name, start_year, end_year, start_date, end_date))
                last_id = cur.lastrowid
                conn.commit()
                
                cur.execute('SELECT * FROM system_academic_years WHERE id = %s', (last_id,))
                current_year = cur.fetchone()
                
                return jsonify({
                    'success': True,
                    'academic_year_id': current_year['id'],
                    'academic_year_name': current_year['name'],
                    'current_academic_year': current_year
                })
        finally:
            conn.close()
    
    # Fall back to calculated year without database
    start_date = f"{start_year}-09-01"
    end_date = f"{end_year}-06-30"
    
    return jsonify({
        'success': True,
        'academic_year_name': name,
        'current_academic_year': {
            'name': name,
            'start_year': start_year,
            'end_year': end_year,
            'start_date': start_date,
            'end_date': end_date
        }
    })

# ============================================================================
# CENTRALIZED SYSTEM-WIDE ACADEMIC YEAR MANAGEMENT (Admin Only)
# ============================================================================

@app.route('/api/system/academic-years', methods=['GET'])
@roles_required('admin')
def get_system_academic_years():
    """Get all system-wide academic years (applies to all schools)
    Automatically marks the current year based on the present date.
    """
    # Calculate the current academic year name based on date
    current_year_name, _, _ = get_current_academic_year_name()
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute('SELECT * FROM system_academic_years ORDER BY start_year DESC')
        academic_years = cur.fetchall()
        
        # Mark the current year based on date calculation (override database is_current)
        for year in academic_years:
            year['is_current'] = 1 if year['name'] == current_year_name else 0
    finally:
        conn.close()
    return jsonify({'success': True, 'academic_years': academic_years, 'current_year_name': current_year_name})

@app.route('/api/system/academic-year', methods=['POST'])
@roles_required('admin')
def add_system_academic_year():
    """Add a new system-wide academic year (admin only - applies to all schools)"""
    data = request.json
    name = data.get('name')
    start_year = data.get('start_year')
    end_year = data.get('end_year')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    is_current = data.get('is_current', False)
    
    if not name or not start_year or not end_year:
        return jsonify({
            'error': 'Name, start_year, and end_year are required',
            'error_ar': 'الاسم وسنة البداية وسنة النهاية مطلوبة'
        }), 400
    
    # Validate that end_year is start_year + 1
    if int(end_year) != int(start_year) + 1:
        return jsonify({
            'error': 'End year must be start year + 1',
            'error_ar': 'سنة النهاية يجب أن تكون سنة البداية + 1'
        }), 400
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Check for duplicate
        cur.execute('SELECT id FROM system_academic_years WHERE name = %s', (name,))
        if cur.fetchone():
            return jsonify({
                'error': 'Academic year already exists',
                'error_ar': 'هذه السنة الدراسية موجودة بالفعل'
            }), 400
        
        # If this year should be current, unset other current years
        if is_current:
            cur.execute('UPDATE system_academic_years SET is_current = 0')
        
        # Set default dates if not provided
        if not start_date:
            start_date = f"{start_year}-09-01"
        if not end_date:
            end_date = f"{end_year}-06-30"
        
        query = '''INSERT INTO system_academic_years (name, start_year, end_year, start_date, end_date, is_current) 
                   VALUES (%s, %s, %s, %s, %s, %s)'''
        cur.execute(query, (name, start_year, end_year, start_date, end_date, 1 if is_current else 0))
        last_id = cur.lastrowid
        conn.commit()
        
        cur.execute('SELECT * FROM system_academic_years WHERE id = %s', (last_id,))
        academic_year = cur.fetchone()
    finally:
        conn.close()
        
    return jsonify({
        'success': True,
        'message': 'تم إضافة السنة الدراسية بنجاح',
        'academic_year': dict(academic_year)
    }), 201

@app.route('/api/system/academic-year/<int:year_id>/set-current', methods=['POST'])
@roles_required('admin')
def set_system_current_academic_year(year_id):
    """Set a system-wide academic year as the current year (admin only)"""
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Check if year exists
        cur.execute('SELECT id FROM system_academic_years WHERE id = %s', (year_id,))
        if not cur.fetchone():
            return jsonify({'error': 'Academic year not found', 'error_ar': 'لم يتم العثور على السنة الدراسية'}), 404
        
        # Unset all current years
        cur.execute('UPDATE system_academic_years SET is_current = 0')
        
        # Set this year as current
        cur.execute('UPDATE system_academic_years SET is_current = 1 WHERE id = %s', (year_id,))
        conn.commit()
        
        cur.execute('SELECT * FROM system_academic_years WHERE id = %s', (year_id,))
        academic_year = cur.fetchone()
    finally:
        conn.close()
        
    return jsonify({
        'success': True,
        'message': 'تم تعيين السنة الدراسية الحالية بنجاح',
        'academic_year': dict(academic_year)
    })

@app.route('/api/system/academic-year/<int:year_id>', methods=['DELETE'])
@roles_required('admin')
def delete_system_academic_year(year_id):
    """Delete a system-wide academic year (admin only)"""
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor()
        # First delete related records in student_grades and student_attendance
        # (These will be automatically deleted via foreign key CASCADE, but we do it explicitly for clarity)
        cur.execute('DELETE FROM student_grades WHERE academic_year_id = %s', (year_id,))
        cur.execute('DELETE FROM student_attendance WHERE academic_year_id = %s', (year_id,))
        
        # Then delete the academic year itself
        cur.execute('DELETE FROM system_academic_years WHERE id = %s', (year_id,))
        row_count = cur.rowcount
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': 'Failed to delete academic year due to related data', 'error_ar': 'فشل حذف السنة الدراسية بسبب وجود بيانات مرتبطة'}), 500
    finally:
        conn.close()
        
    if row_count == 0:
        return jsonify({'error': 'Academic year not found', 'error_ar': 'لم يتم العثور على السنة الدراسية'}), 404
        
    return jsonify({'success': True, 'message': 'تم حذف السنة الدراسية بنجاح', 'deleted': row_count})

@app.route('/api/system/academic-years/generate', methods=['POST'])
@roles_required('admin')
def generate_system_academic_years():
    """Generate upcoming system-wide academic years (admin only)"""
    data = request.json
    count = data.get('count', 5)  # Generate 5 years by default
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    added = []
    try:
        cur = conn.cursor(dictionary=True)
        
        # Get the current academic year info
        _, current_start_year, _ = get_current_academic_year_name()
        
        # Check if any current year is set
        cur.execute('SELECT id FROM system_academic_years WHERE is_current = 1')
        has_current = cur.fetchone() is not None
        
        # Generate academic years starting from current year
        for i in range(count):
            start_year = current_start_year + i
            end_year = start_year + 1
            name = f"{start_year}/{end_year}"
            start_date = f"{start_year}-09-01"
            end_date = f"{end_year}-06-30"
            is_current = 1 if (i == 0 and not has_current) else 0
            
            # Check if already exists
            cur.execute('SELECT id FROM system_academic_years WHERE name = %s', (name,))
            if cur.fetchone():
                continue
            
            cur.execute('''INSERT INTO system_academic_years (name, start_year, end_year, start_date, end_date, is_current) 
                           VALUES (%s, %s, %s, %s, %s, %s)''',
                       (name, start_year, end_year, start_date, end_date, is_current))
            last_id = cur.lastrowid
            cur.execute('SELECT * FROM system_academic_years WHERE id = %s', (last_id,))
            added.append(dict(cur.fetchone()))
        
        conn.commit()
    finally:
        conn.close()
        
    return jsonify({
        'success': True,
        'message': f'تم إنشاء {len(added)} سنوات دراسية',
        'academic_years': added
    })

@app.route('/api/admin/cleanup/orphaned-data', methods=['POST'])
@roles_required('admin')
def cleanup_orphaned_data():
    """Cleanup orphaned data from database (students, teachers, subjects without schools)"""
    data = request.json or {}
    cleanup_type = data.get('type', 'all')  # all, students, teachers, subjects, grade-levels
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
    
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        results = {
            'students_deleted': 0,
            'teachers_deleted': 0,
            'subjects_deleted': 0,
            'grade_levels_deleted': 0,
            'details': []
        }
        
        # Cleanup orphaned students and their records
        if cleanup_type in ['all', 'students']:
            # First cleanup orphaned student grades
            cur.execute('''
                DELETE sg FROM student_grades sg
                LEFT JOIN students s ON sg.student_id = s.id
                WHERE s.id IS NULL
            ''')
            grades_deleted = cur.rowcount
            
            # Cleanup orphaned attendance
            cur.execute('''
                DELETE sa FROM student_attendance sa
                LEFT JOIN students s ON sa.student_id = s.id
                WHERE s.id IS NULL
            ''')
            attendance_deleted = cur.rowcount
            
            # Delete orphaned students
            cur.execute('''
                DELETE s FROM students s
                LEFT JOIN schools sch ON s.school_id = sch.id
                WHERE sch.id IS NULL
            ''')
            results['students_deleted'] = cur.rowcount
            if results['students_deleted'] > 0:
                results['details'].append(f'Deleted {results["students_deleted"]} orphaned students')
            if grades_deleted > 0 or attendance_deleted > 0:
                results['details'].append(f'Cleaned up {grades_deleted} grade records and {attendance_deleted} attendance records')
        
        # Cleanup orphaned teachers and their records
        if cleanup_type in ['all', 'teachers']:
            # First cleanup orphaned teacher subjects
            cur.execute('''
                DELETE ts FROM teacher_subjects ts
                LEFT JOIN teachers t ON ts.teacher_id = t.id
                WHERE t.id IS NULL
            ''')
            subjects_deleted = cur.rowcount
            
            # Cleanup orphaned class assignments
            cur.execute('''
                DELETE tca FROM teacher_class_assignments tca
                LEFT JOIN teachers t ON tca.teacher_id = t.id
                WHERE t.id IS NULL
            ''')
            assignments_deleted = cur.rowcount
            
            # Delete orphaned teachers
            cur.execute('''
                DELETE t FROM teachers t
                LEFT JOIN schools sch ON t.school_id = sch.id
                WHERE sch.id IS NULL
            ''')
            results['teachers_deleted'] = cur.rowcount
            if results['teachers_deleted'] > 0:
                results['details'].append(f'Deleted {results["teachers_deleted"]} orphaned teachers')
            if subjects_deleted > 0 or assignments_deleted > 0:
                results['details'].append(f'Cleaned up {subjects_deleted} subject assignments and {assignments_deleted} class assignments')
        
        # Cleanup orphaned subjects
        if cleanup_type in ['all', 'subjects']:
            cur.execute('''
                DELETE s FROM subjects s
                LEFT JOIN schools sch ON s.school_id = sch.id
                WHERE sch.id IS NULL
            ''')
            results['subjects_deleted'] = cur.rowcount
            if results['subjects_deleted'] > 0:
                results['details'].append(f'Deleted {results["subjects_deleted"]} orphaned subjects')
        
        # Cleanup orphaned grade levels
        if cleanup_type in ['all', 'grade-levels']:
            cur.execute('''
                DELETE g FROM grade_levels g
                LEFT JOIN schools sch ON g.school_id = sch.id
                WHERE sch.id IS NULL
            ''')
            results['grade_levels_deleted'] = cur.rowcount
            if results['grade_levels_deleted'] > 0:
                results['details'].append(f'Deleted {results["grade_levels_deleted"]} orphaned grade levels')
        
        conn.commit()
        
        total_deleted = (
            results['students_deleted'] + 
            results['teachers_deleted'] + 
            results['subjects_deleted'] + 
            results['grade_levels_deleted']
        )
        
        if total_deleted == 0:
            return jsonify({
                'success': True,
                'message': 'لم يتم العثور على بيانات يتيمة للحذف',
                'message_en': 'No orphaned data found',
                'results': results
            })
        
        return jsonify({
            'success': True,
            'message': f'تم تنظيف {total_deleted} سجل يتيم بنجاح',
            'message_en': f'Successfully cleaned up {total_deleted} orphaned records',
            'results': results
        })
        
    except Exception as e:
        print(f"Error during cleanup: {e}")
        return jsonify({'error': 'Cleanup failed', 'error_ar': 'فشل التنظيف', 'details': str(e)}), 500
    finally:
        conn.close()

# ============================================================================
# LEGACY PER-SCHOOL ENDPOINTS (Redirected to System Academic Years)
# These endpoints now read from the centralized system_academic_years table
# ============================================================================

@app.route('/api/school/<int:school_id>/academic-years', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_academic_years(school_id):
    """Get all academic years (now returns system-wide years for all schools)"""
    # Redirect to system-wide academic years
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute('SELECT * FROM system_academic_years ORDER BY start_year DESC')
        academic_years = cur.fetchall()
        
        # Mark current year based on date calculation
        current_year_name, _, _ = get_current_academic_year_name()
        for year in academic_years:
            year['is_current'] = 1 if year['name'] == current_year_name else 0
    finally:
        conn.close()
    return jsonify({'success': True, 'academic_years': academic_years})

@app.route('/api/school/<int:school_id>/academic-year/current', methods=['GET'])
@roles_required('admin', 'school')
@scoped
def get_school_current_academic_year(school_id):
    """Get the current academic year - automatically calculated from system date"""
    # Calculate the current academic year based on the current date
    name, start_year, end_year = get_current_academic_year_name()
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        # Try to find the calculated year in the database
        cur.execute('SELECT * FROM system_academic_years WHERE name = %s', (name,))
        academic_year = cur.fetchone()
        
        # If not found, create it automatically
        if not academic_year:
            start_date = f"{start_year}-09-01"
            end_date = f"{end_year}-06-30"
            
            cur.execute('''INSERT INTO system_academic_years (name, start_year, end_year, start_date, end_date, is_current) 
                           VALUES (%s, %s, %s, %s, %s, 1)''',
                       (name, start_year, end_year, start_date, end_date))
            last_id = cur.lastrowid
            conn.commit()
            
            cur.execute('SELECT * FROM system_academic_years WHERE id = %s', (last_id,))
            academic_year = cur.fetchone()
        
        # Ensure is_current is set correctly
        academic_year['is_current'] = 1
    finally:
        conn.close()
        
    return jsonify({'success': True, 'academic_year': academic_year})

# Legacy endpoint - academic year creation is now admin-only via /api/system/academic-year
# This endpoint is kept for backward compatibility but redirects to error
@app.route('/api/school/<int:school_id>/academic-year', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def add_academic_year(school_id):
    """Legacy endpoint - academic year management is now centralized at system level"""
    return jsonify({
        'error': 'Academic year management is now centralized. Please contact system administrator.',
        'error_ar': 'إدارة السنوات الدراسية أصبحت مركزية. يرجى التواصل مع مدير النظام.'
    }), 403

# Global Error Handlers for JSON Responses
@app.errorhandler(404)
def not_found_error(error):
    if request.path.startswith(('/api/', '/uploads/')):
        return jsonify({'error': 'Not Found', 'error_ar': 'غير موجود'}), 404
    return send_from_directory(app.static_folder, 'index.html')

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal Server Error', 'error_ar': 'خطأ داخلي في الخادم'}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    app.logger.exception('Unhandled exception')
    return jsonify({'error': 'Internal server error', 'error_ar': 'حدث خطأ غير متوقع'}), 500

# Legacy endpoint - generating years is now admin-only via system endpoints
@app.route('/api/academic-year/<int:year_id>', methods=['PUT'])
@roles_required('admin')
def update_academic_year(year_id):
    """Allow updating academic years"""
    return jsonify({
        'message': 'Academic year update endpoint is now available',
        'message_ar': 'نقطة نهاية تحديث السنة الدراسية الآن متوفرة'
    }), 200

@app.route('/api/academic-year/<int:year_id>/set-current', methods=['POST'])
@roles_required('admin')
def set_current_academic_year(year_id):
    """Allow setting current academic year"""
    return jsonify({
        'message': 'Set current academic year endpoint is now available',
        'message_ar': 'نقطة نهاية تعيين السنة الحالية الآن متوفرة'
    }), 200

@app.route('/api/academic-year/<int:year_id>', methods=['DELETE'])
@roles_required('admin')
def delete_academic_year(year_id):
    """Allow deleting academic years"""
    return jsonify({
        'message': 'Academic year deletion endpoint is now available',
        'message_ar': 'نقطة نهاية حذف السنة الدراسية الآن متوفرة'
    }), 200

# Legacy endpoint - generating years is now admin-only via system endpoints
@app.route('/api/school/<int:school_id>/academic-year/generate-upcoming', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def generate_upcoming_academic_years(school_id):
    """Legacy endpoint - academic year management is now centralized at system level"""
    return jsonify({
        'error': 'Academic year management is now centralized. Please contact system administrator.',
        'error_ar': 'إدارة السنوات الدراسية أصبحت مركزية. يرجى التواصل مع مدير النظام.'
    }), 403

@app.route('/api/student/<int:student_id>/grades/<int:academic_year_id>', methods=['GET'])
@roles_required('admin', 'school', 'student', 'teacher')
@scoped
def get_student_grades_by_year(student_id, academic_year_id):
    """Get student grades for a specific academic year"""
    scope_error = ensure_student_scope(student_id)
    if scope_error:
        return scope_error

    query = 'SELECT * FROM student_grades WHERE student_id = %s AND academic_year_id = %s ORDER BY subject_name'
    grades = []
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, (student_id, academic_year_id))
        grades = cur.fetchall()
    finally:
        conn.close()
        
    # Convert to the format expected by the frontend
    grades_dict = {}
    for grade in grades:
        grades_dict[grade['subject_name']] = {
            'month1': grade['month1'],
            'month2': grade['month2'],
            'midterm': grade['midterm'],
            'month3': grade['month3'],
            'month4': grade['month4'],
            'final': grade['final']
        }
    
    return jsonify({'success': True, 'grades': grades_dict, 'raw_grades': grades})

@app.route('/api/student/<int:student_id>/grades/<int:academic_year_id>', methods=['PUT'])
@roles_required('admin', 'school', 'teacher')
@scoped
def update_student_grades_by_year(student_id, academic_year_id):
    """Update student grades for a specific academic year"""
    data = request.json
    grades = data.get('grades', {})
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        for subject_name, subject_grades in grades.items():
            if subject_name == '[object Object]' or not subject_name:
                continue
                
            # Check if grade record exists
            cur.execute('SELECT id FROM student_grades WHERE student_id = %s AND academic_year_id = %s AND subject_name = %s',
                       (student_id, academic_year_id, subject_name))
            existing = cur.fetchone()
            
            month1 = int(subject_grades.get('month1', 0) or 0)
            month2 = int(subject_grades.get('month2', 0) or 0)
            midterm = int(subject_grades.get('midterm', 0) or 0)
            month3 = int(subject_grades.get('month3', 0) or 0)
            month4 = int(subject_grades.get('month4', 0) or 0)
            final = int(subject_grades.get('final', 0) or 0)
            
            if existing:
                cur.execute('''UPDATE student_grades SET 
                               month1 = %s, month2 = %s, midterm = %s, month3 = %s, month4 = %s, final = %s,
                               updated_at = CURRENT_TIMESTAMP
                               WHERE id = %s''',
                           (month1, month2, midterm, month3, month4, final, existing['id']))
            else:
                cur.execute('''INSERT INTO student_grades 
                               (student_id, academic_year_id, subject_name, month1, month2, midterm, month3, month4, final)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                           (student_id, academic_year_id, subject_name, month1, month2, midterm, month3, month4, final))
        
        conn.commit()
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': 'تم حفظ الدرجات بنجاح'})

@app.route('/api/school/<int:school_id>/class-averages', methods=['GET'])
@roles_required('admin', 'school', 'student')
@scoped
def get_class_averages(school_id):
    """Get average grades for all students in the same grade level for comparison"""
    # School role is restricted to its own ID; student role can view any school for now (frontend passes correct ID)
    scope_error = ensure_school_scope(school_id)
    if scope_error:
        return scope_error
    grade = request.args.get('grade', '')
    
    if not grade:
        return jsonify({'success': True, 'averages': {}})
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
    
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Get all students in the same grade level
        cur.execute('SELECT id, detailed_scores FROM students WHERE school_id = %s AND grade = %s', 
                   (school_id, grade))
        students = cur.fetchall()
        
        # Calculate averages per subject
        subject_totals = {}
        subject_counts = {}
        
        for student in students:
            detailed_scores = student.get('detailed_scores', {})
            if isinstance(detailed_scores, str):
                try:
                    detailed_scores = json.loads(detailed_scores)
                except:
                    detailed_scores = {}
            
            for subject, grades in detailed_scores.items():
                if subject == '[object Object]' or not subject:
                    continue
                    
                if subject not in subject_totals:
                    subject_totals[subject] = 0
                    subject_counts[subject] = 0
                
                # Calculate average for this subject for this student
                total = 0
                count = 0
                for period in ['month1', 'month2', 'midterm', 'month3', 'month4', 'final']:
                    grade = grades.get(period, 0)
                    if grade and int(grade) > 0:
                        total += int(grade)
                        count += 1
                
                if count > 0:
                    subject_totals[subject] += total / count
                    subject_counts[subject] += 1
        
        # Calculate final class averages
        averages = {}
        for subject in subject_totals:
            if subject_counts[subject] > 0:
                averages[subject] = subject_totals[subject] / subject_counts[subject]
        
        return jsonify({'success': True, 'averages': averages})
    finally:
        conn.close()

@app.route('/api/student/<int:student_id>/attendance/<int:academic_year_id>', methods=['GET'])
@roles_required('admin', 'school', 'student')
@scoped
def get_student_attendance_by_year(student_id, academic_year_id):
    """Get student attendance for a specific academic year"""
    scope_error = ensure_student_scope(student_id)
    if scope_error:
        return scope_error
    query = 'SELECT * FROM student_attendance WHERE student_id = %s AND academic_year_id = %s ORDER BY attendance_date DESC'
    attendance_records = []
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(query, (student_id, academic_year_id))
        attendance_records = cur.fetchall()
    finally:
        conn.close()
        
    # Convert to the format expected by the frontend
    attendance_dict = {}
    for record in attendance_records:
        date_str = record['attendance_date'].strftime('%Y-%m-%d') if hasattr(record['attendance_date'], 'strftime') else str(record['attendance_date'])
        attendance_dict[date_str] = {
            'status': record['status'],
            'notes': record['notes']
        }
    
    return jsonify({'success': True, 'attendance': attendance_dict, 'raw_attendance': attendance_records})

@app.route('/api/student/<int:student_id>/attendance/<int:academic_year_id>', methods=['PUT'])
@roles_required('admin', 'school')
@scoped
def update_student_attendance_by_year(student_id, academic_year_id):
    """Update student attendance for a specific academic year"""
    data = request.json
    attendance = data.get('attendance', {})
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        for date_str, record in attendance.items():
            status = record.get('status', 'present')
            notes = record.get('notes', '')
            
            # Check if attendance record exists
            cur.execute('SELECT id FROM student_attendance WHERE student_id = %s AND academic_year_id = %s AND attendance_date = %s',
                       (student_id, academic_year_id, date_str))
            existing = cur.fetchone()
            
            if existing:
                cur.execute('UPDATE student_attendance SET status = %s, notes = %s WHERE id = %s',
                           (status, notes, existing['id']))
            else:
                cur.execute('''INSERT INTO student_attendance (student_id, academic_year_id, attendance_date, status, notes)
                               VALUES (%s, %s, %s, %s, %s)''',
                           (student_id, academic_year_id, date_str, status, notes))
        
        conn.commit()
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': 'تم حفظ سجل الحضور بنجاح'})

@app.route('/api/student/<int:student_id>/attendance/<int:academic_year_id>/add', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def add_student_attendance_record(student_id, academic_year_id):
    """Add a single attendance record for a student"""
    data = request.json
    date_str = data.get('date')
    status = data.get('status', 'present')
    notes = data.get('notes', '')
    
    if not date_str:
        return jsonify({'error': 'Date is required', 'error_ar': 'التاريخ مطلوب'}), 400
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
        
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Check if attendance record exists
        cur.execute('SELECT id FROM student_attendance WHERE student_id = %s AND academic_year_id = %s AND attendance_date = %s',
                   (student_id, academic_year_id, date_str))
        existing = cur.fetchone()
        
        if existing:
            cur.execute('UPDATE student_attendance SET status = %s, notes = %s WHERE id = %s',
                       (status, notes, existing['id']))
        else:
            cur.execute('''INSERT INTO student_attendance (student_id, academic_year_id, attendance_date, status, notes)
                           VALUES (%s, %s, %s, %s, %s)''',
                       (student_id, academic_year_id, date_str, status, notes))
        
        conn.commit()
    finally:
        conn.close()
        
    return jsonify({'success': True, 'message': 'تم إضافة سجل الحضور بنجاح'})

# ============================================================================
# STUDENT PROMOTION FUNCTIONALITY
# ============================================================================

@app.route('/api/student/<int:student_id>/promote', methods=['POST'])
@roles_required('admin', 'school')
@scoped
def promote_student(student_id):
    """Promote a student to the next grade level, preserving all historical grades as permanent academic records.
    This endpoint ensures that:
    1. The student's current grade level is updated to the next grade
    2. All historical grades remain intact in the database associated with their original academic year
    3. No grades are transferred, modified, or deleted during promotion
    4. Historical grades are permanently preserved as the student's academic record
    
    When a student is promoted, ONLY their grade level designation changes. All previous grades
    remain in the student_grades table tied to their respective academic years, providing a complete
    permanent academic history.
    """
    data = request.json
    new_grade = data.get('new_grade')
    new_academic_year_id = data.get('new_academic_year_id')
    
    if not new_grade:
        return jsonify({'error': 'New grade is required', 'error_ar': 'المستوى الدراسي الجديد مطلوب'}), 400
    
    # Verify the student exists
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
    
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Get current student data
        cur.execute('SELECT * FROM students WHERE id = %s', (student_id,))
        student = cur.fetchone()
        
        if not student:
            return jsonify({'error': 'Student not found', 'error_ar': 'لم يتم العثور على الطالب'}), 404
        
        # Get current academic year if not provided
        if not new_academic_year_id:
            cur.execute('SELECT id FROM system_academic_years WHERE is_current = 1 ORDER BY start_year DESC LIMIT 1')
            current_year = cur.fetchone()
            if current_year:
                new_academic_year_id = current_year['id']
            else:
                # If no current year is set, get the latest academic year
                cur.execute('SELECT id FROM system_academic_years ORDER BY start_year DESC LIMIT 1')
                year = cur.fetchone()
                if year:
                    new_academic_year_id = year['id']
        
        # Update the student's grade level ONLY
        # Historical grades remain in student_grades table associated with their original academic year
        # No grades are copied, transferred, or modified during promotion
        cur.execute('UPDATE students SET grade = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s', 
                   (new_grade, student_id))
        
        conn.commit()
        
        # Return updated student info
        cur.execute('SELECT * FROM students WHERE id = %s', (student_id,))
        updated_student = cur.fetchone()
        
        # Convert JSON fields back to dict for response
        if isinstance(updated_student.get('detailed_scores'), str):
            try:
                updated_student['detailed_scores'] = json.loads(updated_student['detailed_scores'])
            except:
                updated_student['detailed_scores'] = {}
        
        if isinstance(updated_student.get('daily_attendance'), str):
            try:
                updated_student['daily_attendance'] = json.loads(updated_student['daily_attendance'])
            except:
                updated_student['daily_attendance'] = {}
                
    finally:
        conn.close()
    
    return jsonify({
        'success': True,
        'message': 'تم ترقية الطالب بنجاح',
        'student': updated_student
    })

@app.route('/api/students/promote-many', methods=['POST'])
@roles_required('admin', 'school')
def promote_multiple_students():
    """Promote multiple students to the next grade level at once, preserving all historical grades as permanent academic records.
    
    This endpoint processes bulk promotions efficiently while ensuring that:
    - Each student's grade level is updated to the specified new grade
    - All historical grades remain intact and associated with their original academic years
    - No grades are transferred, modified, or deleted during the promotion process
    - Each student's complete academic history is permanently preserved
    """
    data = request.json
    student_ids = data.get('student_ids', [])
    new_grade = data.get('new_grade')
    new_academic_year_id = data.get('new_academic_year_id')
    
    if not student_ids or not new_grade:
        return jsonify({'error': 'Student IDs and new grade are required', 'error_ar': 'معرّفات الطلاب والمستوى الدراسي الجديد مطلوبة'}), 400
    
    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500

    current_user = g.current_user
    allowed_school = None if current_user.get('role') == 'admin' else _own_school_id(current_user)
    if current_user.get('role') != 'admin' and allowed_school is None:
        return _scope_denied()

    conn = pool.get_connection()
    promoted_count = 0
    failed_promotions = []
    
    try:
        cur = conn.cursor(dictionary=True)
        
        for student_id in student_ids:
            try:
                # Get current student data (FOR UPDATE is not portable to SQLite)
                cur.execute('SELECT * FROM students WHERE id = %s', (student_id,))
                student = cur.fetchone()
                
                if not student:
                    failed_promotions.append({'id': student_id, 'reason': 'Student not found'})
                    continue

                if allowed_school is not None and int(student['school_id']) != int(allowed_school):
                    failed_promotions.append({'id': student_id, 'reason': 'Forbidden'})
                    continue
                
                # Get current academic year if not provided
                current_academic_year_id = new_academic_year_id
                if not current_academic_year_id:
                    cur.execute('SELECT id FROM system_academic_years WHERE is_current = 1 ORDER BY start_year DESC LIMIT 1')
                    current_year = cur.fetchone()
                    if current_year:
                        current_academic_year_id = current_year['id']
                    else:
                        # If no current year is set, get the latest academic year
                        cur.execute('SELECT id FROM system_academic_years ORDER BY start_year DESC LIMIT 1')
                        year = cur.fetchone()
                        if year:
                            current_academic_year_id = year['id']
                
                # Update the student's grade level ONLY
                # Historical grades remain in student_grades table associated with their original academic year
                # No grades are copied, transferred, or modified during promotion
                cur.execute('UPDATE students SET grade = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s', 
                           (new_grade, student_id))
                
                promoted_count += 1
            except Exception as e:
                failed_promotions.append({'id': student_id, 'reason': str(e)})
        
        conn.commit()
        
    finally:
        conn.close()
    
    return jsonify({
        'success': True,
        'message': f'تم ترقية {promoted_count} طلاب بنجاح',
        'promoted_count': promoted_count,
        'failed_count': len(failed_promotions),
        'failed_promotions': failed_promotions
    })

@app.route('/api/student/<int:student_id>/history', methods=['GET'])
@roles_required('admin', 'school', 'student')
@scoped
def get_student_history(student_id):
    """Get complete academic history for a student across all grade levels and academic years"""
    scope_error = ensure_student_scope(student_id)
    if scope_error:
        return scope_error

    pool = get_mysql_pool()
    if not pool:
        return jsonify({'error': 'Database connection failed', 'error_ar': 'فشل الاتصال بقاعدة البيانات'}), 500
    
    conn = pool.get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        
        # Get student basic info
        cur.execute('SELECT * FROM students WHERE id = %s', (student_id,))
        student = cur.fetchone()
        
        if not student:
            return jsonify({'error': 'Student not found', 'error_ar': 'لم يتم العثور على الطالب'}), 404
        
        # Get all grades for this student across all academic years
        cur.execute('''SELECT sg.*, say.name as academic_year_name, say.start_year, say.end_year 
                       FROM student_grades sg 
                       JOIN system_academic_years say ON sg.academic_year_id = say.id 
                       WHERE sg.student_id = %s 
                       ORDER BY say.start_year DESC, sg.subject_name''', (student_id,))
        all_grades = cur.fetchall()
        
        # Group grades by academic year
        grades_by_year = {}
        for grade in all_grades:
            year_name = grade['academic_year_name']
            if year_name not in grades_by_year:
                grades_by_year[year_name] = {
                    'year_info': {
                        'id': grade['academic_year_id'],
                        'name': grade['academic_year_name'],
                        'start_year': grade['start_year'],
                        'end_year': grade['end_year']
                    },
                    'subjects': {}
                }
            
            grades_by_year[year_name]['subjects'][grade['subject_name']] = {
                'month1': grade['month1'],
                'month2': grade['month2'],
                'midterm': grade['midterm'],
                'month3': grade['month3'],
                'month4': grade['month4'],
                'final': grade['final']
            }
        
        # Get all attendance for this student across all academic years
        cur.execute('''SELECT sa.*, say.name as academic_year_name, say.start_year, say.end_year 
                       FROM student_attendance sa 
                       JOIN system_academic_years say ON sa.academic_year_id = say.id 
                       WHERE sa.student_id = %s 
                       ORDER BY sa.attendance_date DESC''', (student_id,))
        all_attendance = cur.fetchall()
        
        # Group attendance by academic year
        attendance_by_year = {}
        for record in all_attendance:
            year_name = record['academic_year_name']
            date_str = record['attendance_date'].strftime('%Y-%m-%d') if hasattr(record['attendance_date'], 'strftime') else str(record['attendance_date'])
            
            if year_name not in attendance_by_year:
                attendance_by_year[year_name] = {}
            
            attendance_by_year[year_name][date_str] = {
                'status': record['status'],
                'notes': record['notes']
            }
        
        # Convert JSON fields if needed
        if isinstance(student.get('detailed_scores'), str):
            try:
                student['detailed_scores'] = json.loads(student['detailed_scores'])
            except:
                student['detailed_scores'] = {}
        
        if isinstance(student.get('daily_attendance'), str):
            try:
                student['daily_attendance'] = json.loads(student['daily_attendance'])
            except:
                student['daily_attendance'] = {}
                
    finally:
        conn.close()
    
    return jsonify({
        'success': True,
        'student': student,
        'academic_history': {
            'grades': grades_by_year,
            'attendance': attendance_by_year
        }
    })

# Serve Static Files & Catch-all for SPA
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static(path):
    if path.startswith('api/'):
        return jsonify({'error': 'API endpoint not found', 'error_ar': 'نقطة نهاية API غير موجودة'}), 404
        
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/optimized/schools', methods=['GET'])
@roles_required('admin')
@field_selection(['id', 'name', 'code', 'study_type', 'stage', 'gender_type'])
@pagination(default_per_page=20)
def get_schools_optimized():
    """Get all schools with field selection and pagination"""
    try:
        schools = school_service.get_all_schools()
        return schools
    except Exception as e:
        app.logger.exception('optimized/schools failed')
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/optimized/students', methods=['GET'])
@roles_required('admin', 'school')
@field_selection(['id', 'name', 'code', 'grade_level', 'classroom', 'parent_phone'])
@pagination(default_per_page=30)
def get_students_optimized():
    """Get students with field selection and pagination"""
    try:
        school_id = request.args.get('school_id', type=int)
        if not school_id:
            return jsonify({'error': 'school_id parameter required'}), 400
        scope_error = ensure_school_scope(school_id)
        if scope_error:
            return scope_error

        students = student_service.get_students_by_school(school_id)
        return students
    except Exception as e:
        app.logger.exception('optimized/students failed')
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/optimized/teachers', methods=['GET'])
@roles_required('admin', 'school')
@field_selection(['id', 'name', 'code', 'grade_level', 'email', 'phone'])
@pagination(default_per_page=25)
def get_teachers_optimized():
    """Get teachers with field selection and pagination"""
    try:
        school_id = request.args.get('school_id', type=int)
        if not school_id:
            return jsonify({'error': 'school_id parameter required'}), 400
        scope_error = ensure_school_scope(school_id)
        if scope_error:
            return scope_error

        teachers = teacher_service.get_teachers_by_school(school_id)
        return teachers
    except Exception as e:
        app.logger.exception('optimized/teachers failed')
        return jsonify({'error': 'Internal server error'}), 500

# Recommendation Endpoints
@app.route('/api/recommendations/teacher', methods=['GET'])
@roles_required('admin', 'school', 'teacher')
def get_teacher_recommendations():
    """Get recommendations for teachers showing student weaknesses and class insights"""
    try:
        # Get teacher_id from query params or token
        teacher_id = request.args.get('teacher_id', type=int) or g.current_user.get('id')

        if not teacher_id:
            return jsonify({
                'error': 'Teacher ID is required',
                'error_ar': 'معرف المعلم مطلوب'
            }), 400

        scope_error = ensure_resource_scope('teacher', teacher_id)
        if scope_error:
            return scope_error

        result = recommendation_service.get_teacher_recommendations(teacher_id)
        return jsonify(result)
    except Exception as e:
        app.logger.exception('recommendations/teacher failed')
        return jsonify({'error': 'Internal server error', 'error_ar': 'حدث خطأ'}), 500

@app.route('/api/recommendations/student/<int:student_id>', methods=['GET'])
@roles_required('admin', 'school', 'student', 'teacher')
@scoped
def get_student_recommendations(student_id):
    """Get personalized recommendations for students"""
    try:
        scope_error = ensure_student_scope(student_id)
        if scope_error:
            return scope_error
        result = recommendation_service.get_student_recommendations(student_id)
        return jsonify(result)
    except Exception as e:
        app.logger.exception('recommendations/student failed')
        return jsonify({'error': 'Internal server error', 'error_ar': 'حدث خطأ'}), 500

@app.route('/api/analytics/class-insights/<int:teacher_id>', methods=['GET'])
@roles_required('admin', 'school', 'teacher')
@scoped
def get_class_insights(teacher_id):
    """Get class-wide performance insights for a teacher"""
    try:
        recommendations = recommendation_service.get_teacher_recommendations(teacher_id)
        if recommendations.get('success'):
            return jsonify({
                'success': True,
                'class_insights': recommendations.get('class_insights', {}),
                'strategies': recommendations.get('strategies', []),
                'at_risk_students': recommendations.get('at_risk_students', [])
            })
        else:
            return jsonify({
                'success': False,
                'error': recommendations.get('error', 'Failed to get class insights')
            }), 400
    except Exception as e:
        app.logger.exception('class-insights failed')
        return jsonify({'error': 'Internal server error', 'error_ar': 'حدث خطأ'}), 500

@app.route('/uploads/<path:filename>')
@authenticate_token
def serve_upload(filename):
    """Serve uploaded files to authenticated users only."""
    return send_from_directory(UPLOADS_DIR, filename)

if __name__ == '__main__':
    # Development entrypoint only. Production uses gunicorn/wsgi (see Dockerfile).
    print(f"[INFO] Server starting on http://localhost:{PORT}")
    app.run(host='127.0.0.1', port=PORT,
            debug=(NODE_ENV != 'production' and os.getenv('FLASK_DEBUG', '0') == '1'))
