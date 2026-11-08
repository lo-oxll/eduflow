-- ينشئ مدير النظام الأول بكلمة مرور عشوائية تظهر مرة واحدة في نتيجة الاستعلام.
-- لا يفعل شيئاً إن كان هناك مدير موجود. انسخ كلمة المرور فوراً؛ سيُطلب تغييرها عند أول دخول.
create extension if not exists pgcrypto with schema extensions;

with pw as (
  select encode(extensions.gen_random_bytes(12), 'hex') as p
),
ins as (
  insert into public.users (username, password_hash, role, must_change_password)
  select 'admin', extensions.crypt(p, extensions.gen_salt('bf', 12)), 'admin', true
  from pw
  where not exists (select 1 from public.users where role = 'admin')
  returning 1
)
select 'admin' as username, p as password
from pw
where exists (select 1 from ins);
