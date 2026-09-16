from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.api import (
    auth, pos, inventory, purchases, customers,
    sessions, products, locations, suppliers,
    categories, reports, users, quotes, reception,
    printing, branches, expenses, payment_methods,
    superadmin, companies, notifications, inventory_purge
)
import os, traceback

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Sistema POS Híbrido - Local y Web"
)

# CORS — merge env origins + always-required origins
ALWAYS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://jkpos-lime.vercel.app",
    "https://jkpos-e06dex3x3-jkvulcanizacion.vercel.app",
]

env_origins = [str(o) for o in settings.CORS_ORIGINS] if settings.CORS_ORIGINS else []

# Siempre usar orígenes específicos (el wildcard * no funciona con allow_credentials=True)
if env_origins and "*" not in env_origins:
    clean_origins = list(set(env_origins + ALWAYS_ALLOWED_ORIGINS))
else:
    # Si env tiene * o está vacío, usar solo los hardcodeados
    clean_origins = ALWAYS_ALLOWED_ORIGINS

# Regex para aceptar cualquier deployment de Vercel automáticamente
allow_origin_regex = r"https://.*\.vercel\.app"

print(f"[CORS] Allowed origins: {clean_origins}")
print(f"[CORS] Allowed origin regex: {allow_origin_regex}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=clean_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Servir archivos estáticos (imágenes de productos)
UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Registrar Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(pos.router, prefix="/api/v1/pos", tags=["Point of Sale"])
app.include_router(inventory.router, prefix="/api/v1/inventory", tags=["Inventory"])
app.include_router(purchases.router, prefix="/api/v1/purchases", tags=["Purchases"])
app.include_router(customers.router, prefix="/api/v1/customers", tags=["Customers"])
app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["Cash Sessions"])
app.include_router(products.router, prefix="/api/v1/products", tags=["Products"])
app.include_router(locations.router, prefix="/api/v1/locations", tags=["Locations"])
app.include_router(suppliers.router, prefix="/api/v1/suppliers", tags=["Suppliers"])
app.include_router(categories.router, prefix="/api/v1/categories", tags=["Categories"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(quotes.router, prefix="/api/v1", tags=["Quotes"])
app.include_router(reception.router, prefix="/api/v1/ot", tags=["Reception"])
app.include_router(printing.router, prefix="/api/v1/printing", tags=["Printing"])
app.include_router(branches.router, prefix="/api/v1/branches", tags=["Branches"])
app.include_router(companies.router, prefix="/api/v1/companies", tags=["Companies"])
app.include_router(expenses.router, prefix="/api/v1/expenses", tags=["Expenses"])
app.include_router(payment_methods.router, prefix="/api/v1/payment-methods", tags=["Payment Methods"])
app.include_router(superadmin.router, prefix="/api/v1/superadmin", tags=["Super Admin"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(inventory_purge.router, prefix="/api/v1/inventory", tags=["Inventory Purge"])

@app.get("/")
def root():
    return {
        "status": "online",
        "mode": settings.DEPLOYMENT_MODE,
        "database": "SQLite (Local)" if "sqlite" in settings.DATABASE_URL else "PostgreSQL (VPS)"
    }

from app.database import engine
from sqlalchemy import text
import time

@app.on_event("startup")
def startup_event():
    retries = 3
    while retries > 0:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                try:
                    conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url VARCHAR;"))
                    conn.commit()
                except Exception as col_err:
                    print(f"[DB] Note on column check: {col_err}")

            from app.models.base import Base
            Base.metadata.create_all(bind=engine)
            print("Database connected and all tables ensured successfully!")
            break
        except Exception as e:
            retries -= 1
            print(f"Database connection failed. Retries left: {retries}. Error: {e}")
            if retries == 0:
                print("WARNING: Could not connect to database. Server will start anyway.")
                break
            time.sleep(2)

    # Cleanup de activity logs > 6 meses (best-effort, no rompe el startup)
    try:
        from app.database import SessionLocal
        from app.services.activity_service import cleanup_old_logs
        db = SessionLocal()
        deleted = cleanup_old_logs(db, days=180)
        if deleted:
            print(f"[activity_log] cleanup: {deleted} logs viejos eliminados")
        db.close()
    except Exception as e:
        print(f"[activity_log] cleanup skipped: {e}")

    # Scheduler de correos automáticos (diario/semanal/mensual)
    try:
        from app.services.email_scheduler import start_email_scheduler
        start_email_scheduler()
    except Exception as e:
        print(f"[email_scheduler] no se pudo iniciar: {e}")

# ─── Debug: catch all 500s and return the real error ───────────────────────
@app.exception_handler(Exception)
async def debug_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[500 ERROR] {request.method} {request.url.path} → {exc}")
    print(tb)
    return JSONResponse(
        status_code=500,
        content={
            "detail": str(exc),
            "type": type(exc).__name__,
            "path": str(request.url.path),
            "traceback": tb.split("\n")[-5:],  # last 5 lines
        },
    )

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
