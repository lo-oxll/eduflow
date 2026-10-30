"""Production WSGI entrypoint (gunicorn: `gunicorn wsgi:app`)."""
from server import app  # noqa: F401  (re-exported for the WSGI server)
