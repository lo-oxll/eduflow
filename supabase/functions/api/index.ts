import { Hono, type Context } from "hono";
import postgres from "postgres";
import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import bcrypt from "bcryptjs";

// ---------- الإعدادات ----------
const DB_URL = Deno.env.get("SUPABASE_DB_URL");
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET");
if (!DB_URL) throw new Error("SUPABASE_DB_URL is not available");
if (!JWT_SECRET_RAW || JWT_SECRET_RAW.length < 32) {
  throw new Error("JWT_SECRET must be set (at least 32 characters): supabase secrets set JWT_SECRET=...");
}
const JWT_KEY = new TextEncoder().encode(JWT_SECRET_RAW);
const JWT_EXPIRES_HOURS = Number(Deno.env.get("JWT_EXPIRES_HOURS") ?? "8");
const REQUIRE_PORTAL_PASSWORDS =
  (Deno.env.get("REQUIRE_PORTAL_PASSWORDS") ?? "true").toLowerCase() !== "false";
const LOCK_THRESHOLD = Number(Deno.env.get("ACCOUNT_LOCKOUT_THRESHOLD") ?? "5");
const LOCK_MINUTES = Number(Deno.env.get("ACCOUNT_LOCKOUT_DURATION_MINUTES") ?? "15");
const CORS_ORIGINS = (Deno.env.get("CORS_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const sql = postgres(DB_URL, { max: 3, idle_timeout: 20, connect_timeout: 15, prepare: false });

// ---------- أدوات ----------
type Role = "admin" | "school" | "teacher" | "student";
type Principal = { id: number; role: Role; [k: string]: unknown };
type Env = { Variables: { user: Principal } };

const SENSITIVE_RESPONSE_KEYS = new Set(["password_hash", "two_factor_secret", "token_hash"]);
const SENSITIVE_INPUT_KEYS = new Set([
  "password", "current_password", "new_password", "confirm_password",
  "token", "refresh_token", "access_token", "secret", "otp", "totp",
]);

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !SENSITIVE_RESPONSE_KEYS.has(k))
        .map(([k, v]) => [k, scrub(v)]),
    );
  }
  return value;
}

// إزالة المحارف التحكمية (يُبقي \n \r \t) كما يفعل InputSanitizer في النسخة الأصلية
function cleanString(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}
function cleanInput(value: unknown): unknown {
  if (typeof value === "string") return cleanString(value);
  if (Array.isArray(value)) return value.map(cleanInput);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        SENSITIVE_INPUT_KEYS.has(k.toLowerCase()) ? [k, v] : [k, cleanInput(v)]
      ),
    );
  }
  return value;
}

async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    const raw = await c.req.json();
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (cleanInput(raw) as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function err(c: Context, status: number, error: string, error_ar: string) {
  return c.json({ error, error_ar }, status as 400);
}
const invalidCredentials = (c: Context) =>
  err(c, 401, "Invalid credentials", "بيانات دخول غير صحيحة");
const forbidden = (c: Context) =>
  err(c, 403, "Forbidden", "ليست لديك صلاحية للوصول إلى هذا المورد");

async function passwordMatches(provided: string, stored: string | null): Promise<boolean> {
  if (!stored || !provided) return false;
  try {
    return await bcrypt.compare(provided, stored);
  } catch {
    return false;
  }
}
const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

async function signToken(claims: Record<string, unknown>): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.round(JWT_EXPIRES_HOURS * 3600)}s`)
    .sign(JWT_KEY);
}

// ---------- قفل الحسابات (مخزّن في قاعدة البيانات فيصلح مع أي عدد من النسخ) ----------
function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  return (xff ? xff.split(",")[0].trim() : "").slice(0, 64);
}

async function lockedResponse(c: Context, lockKey: string) {
  const rows = await sql<{ n: number; last: Date | null }[]>`
    select count(*)::int as n, max(attempted_at) as last
    from login_attempts
    where lock_key = ${lockKey}
      and attempted_at > now() - make_interval(mins => ${LOCK_MINUTES})`;
  const { n, last } = rows[0];
  if (n < LOCK_THRESHOLD || !last) return null;
  const remainingMs = last.getTime() + LOCK_MINUTES * 60_000 - Date.now();
  if (remainingMs <= 0) return null;
  const minutes = Math.max(1, Math.floor(remainingMs / 60_000) + 1);
  return c.json({
    error: "Account temporarily locked",
    error_ar: `تم قفل الحساب مؤقتاً بسبب محاولات فاشلة. حاول بعد ${minutes} دقيقة`,
  }, 429);
}

async function recordFailure(c: Context, lockKey: string) {
  await sql`insert into login_attempts (lock_key, ip_address) values (${lockKey}, ${clientIp(c)})`;
  if (Math.random() < 0.02) {
    await sql`delete from login_attempts where attempted_at < now() - interval '2 days'`;
  }
}
const resetFailures = (lockKey: string) => sql`delete from login_attempts where lock_key = ${lockKey}`;

// ---------- التطبيق ----------
const app = new Hono<Env>();

app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = origin && CORS_ORIGINS.includes(origin);
  if (c.req.method === "OPTIONS") {
    if (!allowed) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin",
      },
    });
  }
  await next();
  if (allowed) c.res.headers.set("Access-Control-Allow-Origin", origin);
  c.res.headers.append("Vary", "Origin");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  c.res.headers.set("Cache-Control", "no-store");
});

app.onError((e, c) => {
  console.error("unhandled", e);
  return err(c, 500, "Internal server error", "حدث خطأ غير متوقع");
});
app.notFound((c) => err(c, 404, "API endpoint not found", "نقطة نهاية API غير موجودة"));

function rolesRequired(...roles: Role[]) {
  return async (c: Context<Env>, next: () => Promise<void>) => {
    const auth = c.req.header("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return err(c, 401, "Authentication required", "مصادقة مطلوبة");
    }
    try {
      const { payload } = await jwtVerify(auth.slice(7), JWT_KEY, { algorithms: ["HS256"] });
      const user = payload as unknown as Principal;
      if (roles.length && !roles.includes(user.role)) return forbidden(c);
      c.set("user", user);
    } catch (e) {
      if (e instanceof joseErrors.JWTExpired) {
        return err(c, 401, "Token expired", "انتهت صلاحية الجلسة");
      }
      return err(c, 401, "Invalid token", "رمز غير صالح");
    }
    await next();
  };
}

const idParam = (c: Context): number | null => {
  const n = Number(c.req.param("id"));
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ----- الصحة -----
app.get("/health", async (c) => {
  try {
    await sql`select 1`;
    return c.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "postgresql",
      configuration: { requirePortalPasswords: REQUIRE_PORTAL_PASSWORDS },
    });
  } catch {
    return c.json({ status: "degraded", database: "unreachable" }, 503);
  }
});

// ----- المدير -----
app.post("/api/admin/login", async (c) => {
  const data = await body(c);
  const username = str(data.username).trim();
  const password = str(data.password);
  if (!username || !password) {
    return err(c, 400, "Username and password required", "اسم المستخدم وكلمة المرور مطلوبان");
  }
  const lockKey = `admin:${username}`;
  const locked = await lockedResponse(c, lockKey);
  if (locked) return locked;

  const rows = await sql`
    select id, username, password_hash, role, must_change_password
    from users where username = ${username} and role = 'admin'`;
  const user = rows[0];
  if (!user || !(await passwordMatches(password, user.password_hash))) {
    await recordFailure(c, lockKey);
    return invalidCredentials(c);
  }
  await resetFailures(lockKey);
  const token = await signToken({ id: user.id, username: user.username, role: user.role });
  return c.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      must_change_password: Boolean(user.must_change_password),
    },
  });
});

app.post("/api/admin/change-password", rolesRequired("admin"), async (c) => {
  const data = await body(c);
  const current = str(data.current_password);
  const next = str(data.new_password);
  if (next.length < 8) {
    return err(c, 400, "Password must be at least 8 characters", "كلمة المرور يجب أن تكون 8 أحرف على الأقل");
  }
  const userId = c.get("user").id;
  const rows = await sql`select id, password_hash from users where id = ${userId}`;
  if (!rows[0]) return err(c, 404, "User not found", "المستخدم غير موجود");
  if (!(await passwordMatches(current, rows[0].password_hash))) return invalidCredentials(c);
  await sql`update users set password_hash = ${await hashPassword(next)}, must_change_password = false where id = ${userId}`;
  return c.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
});

app.post("/api/admin/portal-password", rolesRequired("admin"), async (c) => {
  const data = await body(c);
  const entity = str(data.entity);
  const entityId = Number(data.id);
  const password = str(data.password);
  if (!["school", "teacher", "student"].includes(entity) || !Number.isInteger(entityId) || entityId <= 0) {
    return err(c, 400, "entity must be school, teacher or student and id is required", "نوع الحساب ومعرفه مطلوبان");
  }
  if (password.length < 8) {
    return err(c, 400, "Password must be at least 8 characters", "كلمة المرور يجب أن تكون 8 أحرف على الأقل");
  }
  const hash = await hashPassword(password);
  const result = entity === "school"
    ? await sql`update schools set password_hash = ${hash} where id = ${entityId}`
    : entity === "teacher"
    ? await sql`update teachers set password_hash = ${hash} where id = ${entityId}`
    : await sql`update students set password_hash = ${hash} where id = ${entityId}`;
  if (!result.count) return err(c, 404, "Account not found", "الحساب غير موجود");
  return c.json({ success: true, message: "تم تعيين كلمة المرور" });
});

// ----- دخول البوابات -----
async function portalPasswordOk(
  c: Context,
  provided: string,
  stored: string | null,
): Promise<{ ok: boolean; response?: Response }> {
  if (stored) return { ok: await passwordMatches(provided, stored) };
  if (REQUIRE_PORTAL_PASSWORDS) {
    return {
      ok: false,
      response: err(c, 403, "Password not configured for this account", "لم يتم تعيين كلمة مرور لهذا الحساب. تواصل مع إدارة المدرسة"),
    };
  }
  return { ok: true };
}

app.post("/api/school/login", async (c) => {
  const data = await body(c);
  const code = str(data.code).trim().toUpperCase();
  if (!code) return err(c, 400, "School code is required", "رمز المدرسة مطلوب");
  const lockKey = `school:${code}`;
  const locked = await lockedResponse(c, lockKey);
  if (locked) return locked;

  const rows = await sql`
    select id, code, name, study_type, level, gender_type, is_suspended, suspended_reason, password_hash
    from schools where code = ${code}`;
  const school = rows[0];
  if (!school) {
    await recordFailure(c, lockKey);
    return invalidCredentials(c);
  }
  const check = await portalPasswordOk(c, str(data.password), school.password_hash);
  if (!check.ok) {
    await recordFailure(c, lockKey);
    return check.response ?? invalidCredentials(c);
  }
  if (school.is_suspended) {
    return err(c, 403, "School account is suspended", "حساب المدرسة موقوف. " + (school.suspended_reason ?? ""));
  }
  await resetFailures(lockKey);
  const token = await signToken({ id: school.id, code: school.code, name: school.name, role: "school" });
  return c.json({
    success: true,
    token,
    school: {
      id: school.id, code: school.code, name: school.name,
      study_type: school.study_type, level: school.level, gender_type: school.gender_type,
    },
  });
});

app.post("/api/student/login", async (c) => {
  const data = await body(c);
  const code = str(data.code).trim();
  if (!code) return err(c, 400, "Student code is required", "رمز الطالب مطلوب");
  const lockKey = `student:${code}`;
  const locked = await lockedResponse(c, lockKey);
  if (locked) return locked;

  const rows = await sql`
    select s.id, s.school_id, s.full_name, s.student_code, s.grade, s.branch, s.room,
           s.password_hash, sch.name as school_name, sch.is_suspended as school_suspended
    from students s join schools sch on s.school_id = sch.id
    where s.student_code = ${code}`;
  const student = rows[0];
  if (!student) {
    await recordFailure(c, lockKey);
    return invalidCredentials(c);
  }
  const check = await portalPasswordOk(c, str(data.password), student.password_hash);
  if (!check.ok) {
    await recordFailure(c, lockKey);
    return check.response ?? invalidCredentials(c);
  }
  if (student.school_suspended) return err(c, 403, "School account is suspended", "حساب المدرسة موقوف");
  await resetFailures(lockKey);
  const token = await signToken({ id: student.id, code: student.student_code, name: student.full_name, role: "student" });
  return c.json({
    success: true,
    token,
    student: {
      id: student.id, school_id: student.school_id, school_name: student.school_name,
      full_name: student.full_name, student_code: student.student_code,
      grade: student.grade, branch: student.branch, room: student.room,
    },
  });
});

async function teacherSubjects(teacherId: number) {
  const predefined = await sql`
    select s.id, s.name, s.grade_level
    from teacher_subjects ts join subjects s on ts.subject_id = s.id
    where ts.teacher_id = ${teacherId} order by s.name`;
  const rows = await sql`select free_text_subjects from teachers where id = ${teacherId}`;
  const free = str(rows[0]?.free_text_subjects)
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map((name) => ({ id: null, name, grade_level: "free_text" }));
  return [...predefined, ...free];
}

app.post("/api/teacher/login", async (c) => {
  const data = await body(c);
  const code = str(data.teacher_code).trim();
  if (!code) return err(c, 400, "Teacher code is required", "رمز المعلم مطلوب");
  const lockKey = `teacher:${code}`;
  const locked = await lockedResponse(c, lockKey);
  if (locked) return locked;

  const rows = await sql`
    select t.id, t.school_id, t.full_name, t.teacher_code, t.email, t.phone, t.grade_level,
           t.password_hash, sch.name as school_name, sch.is_suspended as school_suspended
    from teachers t join schools sch on t.school_id = sch.id
    where t.teacher_code = ${code}`;
  const teacher = rows[0];
  if (!teacher) {
    await recordFailure(c, lockKey);
    return invalidCredentials(c);
  }
  const check = await portalPasswordOk(c, str(data.password), teacher.password_hash);
  if (!check.ok) {
    await recordFailure(c, lockKey);
    return check.response ?? invalidCredentials(c);
  }
  if (teacher.school_suspended) return err(c, 403, "School account is suspended", "حساب المدرسة موقوف");
  await resetFailures(lockKey);
  const subjects = await teacherSubjects(teacher.id);
  const token = await signToken({
    id: teacher.id, teacher_code: teacher.teacher_code, name: teacher.full_name,
    role: "teacher", school_id: teacher.school_id,
  });
  return c.json({
    success: true,
    token,
    teacher: {
      id: teacher.id, school_id: teacher.school_id, school_name: teacher.school_name,
      full_name: teacher.full_name, teacher_code: teacher.teacher_code,
      email: teacher.email, phone: teacher.phone, grade_level: teacher.grade_level, subjects,
    },
  });
});

// ----- المدارس (المدير فقط) -----
const STAGE_TO_LEVEL: Record<string, string> = {
  "ابتدائي": "ابتدائي", "متوسط": "متوسطة", "ثانوي": "ثانوية", "إعدادي": "إعدادية",
};
const normalizeLevel = (level: string) =>
  Object.values(STAGE_TO_LEVEL).includes(level) ? level : (STAGE_TO_LEVEL[level] ?? level);

function newSchoolCode(): string {
  const ts = String(Date.now()).slice(-6);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rnd = crypto.getRandomValues(new Uint8Array(3));
  return `SCH-${ts}-${Array.from(rnd, (b) => alphabet[b % alphabet.length]).join("")}`;
}

app.get("/api/schools", rolesRequired("admin"), async (c) => {
  const schools = await sql`select * from schools order by created_at desc`;
  return c.json(scrub({ success: true, schools }) as object);
});

app.post("/api/schools", rolesRequired("admin"), async (c) => {
  const data = await body(c);
  const name = str(data.name).trim();
  const studyType = str(data.study_type).trim();
  const level = normalizeLevel(str(data.level).trim());
  const genderType = str(data.gender_type).trim();
  if (!name || !studyType || !level || !genderType) {
    return err(c, 400, "All fields are required", "جميع الحقول مطلوبة");
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const rows = await sql`
        insert into schools (name, code, study_type, level, gender_type)
        values (${name}, ${newSchoolCode()}, ${studyType}, ${level}, ${genderType})
        returning *`;
      return c.json(scrub({ success: true, message: "تم إضافة المدرسة بنجاح", school: rows[0] }) as object, 201);
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
  return err(c, 500, "Could not generate a unique school code", "تعذر إنشاء رمز فريد للمدرسة");
});

app.put("/api/schools/:id", rolesRequired("admin"), async (c) => {
  const id = idParam(c);
  if (!id) return err(c, 400, "Invalid id", "معرّف غير صالح");
  const data = await body(c);
  const name = str(data.name).trim();
  const studyType = str(data.study_type).trim();
  const level = normalizeLevel(str(data.level).trim());
  const genderType = str(data.gender_type).trim();
  if (!name || !studyType || !level || !genderType) {
    return err(c, 400, "All fields are required", "جميع الحقول مطلوبة");
  }
  const rows = await sql`
    update schools set name = ${name}, study_type = ${studyType}, level = ${level},
      gender_type = ${genderType}, updated_at = now()
    where id = ${id} returning *`;
  if (!rows[0]) return err(c, 404, "School not found", "لم يتم العثور على المدرسة");
  return c.json(scrub({ success: true, message: "تم تحديث المدرسة بنجاح", school: rows[0] }) as object);
});

app.delete("/api/schools/:id", rolesRequired("admin"), async (c) => {
  const id = idParam(c);
  if (!id) return err(c, 400, "Invalid id", "معرّف غير صالح");
  const result = await sql.begin(async (tx) => {
    const ts = await tx`delete from teacher_subjects where teacher_id in (select id from teachers where school_id = ${id})`;
    const tca = await tx`delete from teacher_class_assignments where teacher_id in (select id from teachers where school_id = ${id})`;
    const sg = await tx`delete from student_grades where student_id in (select id from students where school_id = ${id})`;
    const sa = await tx`delete from student_attendance where student_id in (select id from students where school_id = ${id})`;
    const teachers = await tx`delete from teachers where school_id = ${id}`;
    const students = await tx`delete from students where school_id = ${id}`;
    const subjects = await tx`delete from subjects where school_id = ${id}`;
    const gradeLevels = await tx`delete from grade_levels where school_id = ${id}`;
    const school = await tx`delete from schools where id = ${id}`;
    return {
      deleted: school.count,
      details: {
        teachers_deleted: teachers.count,
        students_deleted: students.count,
        subjects_deleted: subjects.count,
        grade_levels_deleted: gradeLevels.count,
        teacher_subject_assignments_deleted: ts.count,
        teacher_class_assignments_deleted: tca.count,
        student_grades_deleted: sg.count,
        student_attendance_deleted: sa.count,
      },
    };
  });
  if (!result.deleted) return err(c, 404, "School not found", "لم يتم العثور على المدرسة");
  return c.json({
    success: true,
    message: "تم حذف المدرسة وجميع بياناتها المرتبطة بنجاح",
    deleted: result.deleted,
    details: result.details,
  });
});

// ---------- نقطة الدخول ----------
// يعمل سواء أبقى مسار Supabase اسم الدالة (/api/api/...) أم حذفه (/api/...)
const PATH_RE = /^(?:\/functions\/v1)?(?:\/api)?(\/api\/.*|\/health)$/;

Deno.serve((req) => {
  const url = new URL(req.url);
  const m = PATH_RE.exec(url.pathname);
  if (m) url.pathname = m[1];
  return app.fetch(new Request(url, req));
});
