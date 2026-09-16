"""
Email Scheduler — envío automático de reportes por correo.
Corre dentro del backend (startup de FastAPI), sin servicios externos.

Horario: 23:50 UTC (19:50 Chile) — el reporte diario cierra el día.
- Diario: todos los días 23:50 UTC
- Semanal: domingos 23:50 UTC
- Mensual: día 1 de cada mes 23:50 UTC

Envía a todos los admins de cada empresa que tengan email configurado.
Requiere RESEND_API_KEY.
"""
import os
import threading
import time
from datetime import datetime, timedelta

# Intervalo de check: cada 10 minutos
CHECK_INTERVAL_SECONDS = 600
# Hora de envío (UTC)
SEND_HOUR_UTC = 23
SEND_MINUTE_UTC = 50

_started = False
_lock = threading.Lock()
_last_sent = {}  # "daily:2026-08-14" -> timestamp


def _should_send(period: str, now: datetime) -> bool:
    """Determina si toca enviar este período hoy (y no se envió ya)."""
    key = f"{period}:{now.strftime('%Y-%m-%d')}"
    if key in _last_sent:
        return False  # ya enviado hoy

    if now.hour != SEND_HOUR_UTC or now.minute < SEND_MINUTE_UTC:
        return False

    if period == "daily":
        return True
    elif period == "weekly":
        return now.weekday() == 6  # domingo
    elif period == "monthly":
        return now.day == 1
    return False


def _send_for_all_companies(period: str):
    """Itera todas las empresas activas y envía el reporte a sus admins."""
    from app.database import SessionLocal
    from app.models.base import Company, User, UserRole
    from app.services.email_service import send_report_email

    db = SessionLocal()
    sent, failed = 0, 0
    try:
        companies = db.query(Company).filter(Company.is_active == True).all()
        for company in companies:
            # Buscar admins con email
            admins = db.query(User).filter(
                User.company_id == company.id,
                User.is_active == True,
                User.role.in_([UserRole.admin, UserRole.superadmin]),
                User.email.isnot(None),
            ).all()
            recipients = [a.email for a in admins if a.email]
            if not recipients:
                continue

            try:
                result = send_report_email(
                    db=db,
                    company_id=company.id,
                    company_name=company.name,
                    period=period,
                    recipient_emails=recipients,
                )
                sent += 1
                print(f"[email_scheduler] ✅ {period} → {company.name}: {len(recipients)} destinatarios")
            except Exception as e:
                failed += 1
                print(f"[email_scheduler] ❌ {period} → {company.name}: {e}")
    finally:
        db.close()

    return sent, failed


def _scheduler_loop():
    """Loop principal del scheduler (daemon thread)."""
    print(f"[email_scheduler] iniciado — check cada {CHECK_INTERVAL_SECONDS}s, envío {SEND_HOUR_UTC:02d}:{SEND_MINUTE_UTC:02d} UTC")
    while True:
        try:
            now = datetime.utcnow()
            for period in ("daily", "weekly", "monthly"):
                if _should_send(period, now):
                    key = f"{period}:{now.strftime('%Y-%m-%d')}"
                    print(f"[email_scheduler] disparando {key}...")
                    sent, failed = _send_for_all_companies(period)
                    _last_sent[key] = time.time()
                    print(f"[email_scheduler] {key} completado: {sent} ok, {failed} fallos")
        except Exception as e:
            print(f"[email_scheduler] error en loop: {e}")

        time.sleep(CHECK_INTERVAL_SECONDS)


def start_email_scheduler():
    """Arranca el scheduler una sola vez (idempotente)."""
    global _started
    if not os.getenv("RESEND_API_KEY"):
        print("[email_scheduler] RESEND_API_KEY no configurada — scheduler desactivado")
        return
    with _lock:
        if _started:
            return
        _started = True
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="email-scheduler")
    t.start()
