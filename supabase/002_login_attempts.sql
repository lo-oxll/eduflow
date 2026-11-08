create table if not exists login_attempts (
  id bigserial primary key,
  lock_key varchar(255) not null,
  ip_address varchar(64) not null default '',
  attempted_at timestamptz not null default now()
);

create index if not exists idx_login_attempts_key_time on login_attempts(lock_key, attempted_at desc);

alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;
revoke all on sequence public.login_attempts_id_seq from anon, authenticated;
