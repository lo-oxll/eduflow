# EduFlow — School Management System

Flask + PostgreSQL (Supabase) school management with Arabic RTL portals for admin, school, teacher and student.

## Run locally
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python scripts/create_admin_user.py                  # prints a one-time admin password
python server.py                                     # http://localhost:8000 (SQLite)
```

## Deploy: GitHub + Supabase + Render
1. **GitHub** — create a repository and push this folder (`.gitignore` already excludes `.env`, `*.db`, sessions).
2. **Supabase** — Project Settings → Database → Connection string → **Session pooler** (IPv4). Append `?sslmode=require`.
3. **GitHub secrets** (Settings → Secrets → Actions): `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`.
4. Actions → **Initialize Supabase Schema** → Run workflow with *create_admin* ticked. It creates all tables and enables RLS (`supabase/enable_rls.sql`) so the public Supabase REST API cannot read your data.
5. **Render** — New → Blueprint → select the repo (`render.yaml`). Set `DATABASE_URL` and `CORS_ORIGINS`; `JWT_SECRET` is generated.
6. Provision portal passwords once, then keep `REQUIRE_PORTAL_PASSWORDS` at its production default (true):
   ```bash
   DATABASE_URL=... python scripts/set_portal_passwords.py --output passwords.csv
   ```
   Hand out `passwords.csv` and delete it; never commit it.

## Tests
```bash
pip install -r requirements-testing.txt
pytest
```

## Notes
- `UPLOADS_DIR` defaults to `/tmp/uploads` in production (ephemeral on free hosts). Use a persistent disk or Supabase Storage for permanent files.
- API reference: `docs/api/API_DOCUMENTATION.md`.
