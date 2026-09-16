"""
Activity Log Service — Audit trail del sistema.
Registra quién hizo qué, para las notificaciones (campanita) y el feed estilo git-log.
Retención: 6 meses (180 días), cleanup automático.
"""
from datetime import datetime, timedelta
from uuid import UUID, uuid4
from typing import Optional

from sqlalchemy.orm import Session

from app.models.base import ActivityLog


# Acciones canónicas (para consistencia)
class Actions:
    # Products
    PRODUCT_CREATED = "product.created"
    PRODUCT_UPDATED = "product.updated"
    PRODUCT_DELETED = "product.deleted"
    PRODUCT_IMPORTED = "product.imported"       # import Excel
    # Users
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DELETED = "user.deleted"
    USER_LOGIN = "user.login"
    # Locations
    LOCATION_CREATED = "location.created"
    LOCATION_DELETED = "location.deleted"
    PRODUCT_MOVED = "product.moved"             # A → B
    # Inventory
    INVENTORY_ADJUSTED = "inventory.adjusted"
    INVENTORY_MERMA = "inventory.merma"
    STOCK_LOW = "stock.low"                     # 🔴 alerta
    # Cash
    CASH_OPENED = "cash.opened"
    CASH_CLOSED = "cash.closed"
    # Purchases
    PURCHASE_CREATED = "purchase.created"
    PURCHASE_CONFIRMED = "purchase.confirmed"
    PURCHASE_CANCELLED = "purchase.cancelled"
    PURCHASE_DELETED = "purchase.deleted"
    PURCHASE_UPDATED = "purchase.updated"
    # Suppliers
    SUPPLIER_CREATED = "supplier.created"
    SUPPLIER_UPDATED = "supplier.updated"
    SUPPLIER_DELETED = "supplier.deleted"
    # Email
    EMAIL_REPORT_SENT = "email.report_sent"
    # Depuración
    PURGE_EXECUTED = "purge.executed"


def log_activity(
    db: Session,
    company_id,
    user,  # User object o None (sistema)
    action: str,
    description: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[UUID] = None,
    severity: ActivityLog.Severity = ActivityLog.Severity.ACTION,
    metadata: Optional[dict] = None,
    auto_commit: bool = False,
) -> ActivityLog:
    """
    Registra una actividad en el audit log.
    Diseñado para nunca romper el flujo principal: si falla, solo loggea.

    Uso:
        log_activity(db, company_id, current_user, Actions.PRODUCT_CREATED,
                     f"Creó el producto '{p.name}'", "product", p.id)
    """
    try:
        entry = ActivityLog(
            id=uuid4(),
            company_id=company_id,
            user_id=user.username if user else "sistema",
            user_name=user.full_name or user.username if user else "Sistema",
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            description=description,
            severity=severity,
            is_read=False,
            metadata_json=metadata,
        )
        db.add(entry)
        if auto_commit:
            db.commit()
        return entry
    except Exception as e:
        # El audit log NUNCA debe romper la operación de negocio
        print(f"[activity_log] WARN: no se pudo registrar actividad: {e}")
        return None


def get_recent_logs(
    db: Session,
    company_id,
    days: int = 7,
    limit: int = 50,
    only_unread: bool = False,
) -> list[ActivityLog]:
    """Logs recientes para la campanita / feed."""
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(ActivityLog).filter(
        ActivityLog.company_id == company_id,
        ActivityLog.created_at >= since,
    )
    if only_unread:
        q = q.filter(ActivityLog.is_read == False)
    return q.order_by(ActivityLog.created_at.desc()).limit(limit).all()


def count_unread(db: Session, company_id) -> int:
    """Contador para el badge de la campanita."""
    return db.query(ActivityLog).filter(
        ActivityLog.company_id == company_id,
        ActivityLog.is_read == False,
        ActivityLog.created_at >= datetime.utcnow() - timedelta(days=7),
    ).count()


def mark_all_read(db: Session, company_id) -> int:
    """Marca todos los logs de la empresa como leídos (últimos 7 días)."""
    since = datetime.utcnow() - timedelta(days=7)
    updated = db.query(ActivityLog).filter(
        ActivityLog.company_id == company_id,
        ActivityLog.is_read == False,
        ActivityLog.created_at >= since,
    ).update({ActivityLog.is_read: True})
    db.commit()
    return updated


def mark_read(db: Session, company_id, log_id: UUID) -> bool:
    """Marca un log específico como leído."""
    entry = db.query(ActivityLog).filter(
        ActivityLog.id == log_id,
        ActivityLog.company_id == company_id,
    ).first()
    if not entry:
        return False
    entry.is_read = True
    db.commit()
    return True


def cleanup_old_logs(db: Session, days: int = 180) -> int:
    """Borra logs más viejos que `days`. Llamar periódicamente (cron/startup)."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    deleted = db.query(ActivityLog).filter(
        ActivityLog.created_at < cutoff
    ).delete()
    db.commit()
    return deleted


def check_low_stock(
    db: Session,
    company_id,
    product,
    auto_commit: bool = True,
) -> Optional[ActivityLog]:
    """
    Verifica si un producto quedó bajo el mínimo y registra la alerta.
    Llamar después de ventas, ajustes, mermas.
    """
    if product.product_type and str(product.product_type) == "SERVICE":
        return None
    if product.is_scrap:
        return None

    stock = float(product.stock_quantity or 0)
    min_stock = float(product.min_stock or 0)
    if min_stock <= 0 or stock > min_stock:
        return None

    # Evitar spam: no repetir la misma alerta si ya hay una igual no leída en 24h
    from datetime import timedelta
    recent = db.query(ActivityLog).filter(
        ActivityLog.company_id == company_id,
        ActivityLog.action == Actions.STOCK_LOW,
        ActivityLog.entity_id == product.id,
        ActivityLog.created_at >= datetime.utcnow() - timedelta(hours=24),
    ).first()
    if recent:
        return None

    return log_activity(
        db, company_id, None,  # alerta del sistema, no de un usuario
        Actions.STOCK_LOW,
        f"Stock bajo: '{product.name}' quedan {stock:g} (mínimo {min_stock:g})",
        entity_type="product",
        entity_id=product.id,
        severity=ActivityLog.Severity.CRITICAL,
        metadata={"stock": stock, "min_stock": min_stock, "barcode": product.barcode},
        auto_commit=auto_commit,
    )
