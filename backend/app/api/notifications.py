"""
Notifications API — feed de activity logs para la campanita.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from app.api.deps import get_current_user
from app.db.tenant_session import TenantSession
from app.api.deps import get_tenant_session
from app.models.base import User
from app.services import activity_service

router = APIRouter()


@router.get("")
def get_notifications(
    days: int = 7,
    limit: int = 50,
    only_unread: bool = False,
    db: TenantSession = Depends(get_tenant_session),
    current_user: User = Depends(get_current_user),
):
    """
    Feed de notificaciones (activity logs) de la empresa.
    El superadmin ve logs de TODAS las empresas (modo auditoría) con el nombre de cada una.
    """
    user_role = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)

    from app.models.base import ActivityLog, Company
    from datetime import datetime, timedelta
    from sqlalchemy import or_

    since = datetime.utcnow() - timedelta(days=days)
    base_q = db._db.query(ActivityLog).filter(ActivityLog.created_at >= since)

    if user_role == "superadmin" and not current_user.company_id:
        # Superadmin: todas las empresas
        q = base_q
        companies_map = {c.id: c.name for c in db._db.query(Company).all()}
    else:
        company_id = current_user.company_id
        if not company_id:
            return {"notifications": [], "unread_count": 0}
        q = base_q.filter(ActivityLog.company_id == company_id)
        companies_map = {}

    if only_unread:
        q = q.filter(ActivityLog.is_read == False)

    # Contar no leídas ANTES del limit
    unread_count = q.filter(ActivityLog.is_read == False).count()

    logs = q.order_by(ActivityLog.created_at.desc()).limit(limit).all()

    return {
        "notifications": [
            {
                "id": str(l.id),
                "user_id": l.user_id,
                "user_name": l.user_name,
                "action": l.action,
                "entity_type": l.entity_type,
                "company_name": companies_map.get(l.company_id),
                "description": l.description,
                "severity": l.severity.value if hasattr(l.severity, "value") else str(l.severity),
                "is_read": l.is_read,
                "created_at": l.created_at.isoformat(),
                "metadata": l.metadata_json,
            }
            for l in logs
        ],
        "unread_count": unread_count,
    }


@router.post("/read-all")
def mark_all_read(
    db: TenantSession = Depends(get_tenant_session),
    current_user: User = Depends(get_current_user),
):
    """Marca todas las notificaciones como leídas."""
    company_id = current_user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Usuario sin empresa")
    count = activity_service.mark_all_read(db._db, company_id)
    return {"marked_read": count}


@router.post("/{log_id}/read")
def mark_one_read(
    log_id: UUID,
    db: TenantSession = Depends(get_tenant_session),
    current_user: User = Depends(get_current_user),
):
    """Marca una notificación específica como leída."""
    company_id = current_user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Usuario sin empresa")
    ok = activity_service.mark_read(db._db, company_id, log_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {"status": "ok"}


@router.get("/email-status")
def email_report_status(
    db: TenantSession = Depends(get_tenant_session),
    current_user: User = Depends(get_current_user),
):
    """
    Estado del último reporte por correo enviado a esta empresa.
    Para mostrar "Estimado X, revisa el reporte en tu correo ✓".
    """
    company_id = current_user.company_id
    if not company_id:
        return {"last_email": None}

    from app.models.base import ActivityLog
    last = db._db.query(ActivityLog).filter(
        ActivityLog.company_id == company_id,
        ActivityLog.action == activity_service.Actions.EMAIL_REPORT_SENT,
    ).order_by(ActivityLog.created_at.desc()).first()

    if not last:
        return {"last_email": None}

    return {
        "last_email": {
            "sent_at": last.created_at.isoformat(),
            "period": (last.metadata_json or {}).get("period"),
            "recipients": (last.metadata_json or {}).get("recipients", []),
            "description": last.description,
        }
    }
