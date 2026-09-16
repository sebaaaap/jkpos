"""
Inventory Purge API — Depuración de inventario estilo Odoo/SAP.
Aislado por company_id (TenantSession). Solo rol admin.

Flujo:
1. GET /purge/preview?days=30 → muestra qué se eliminaría (dry-run, sin tocar nada)
2. POST /purge/execute {confirm_company_name: "jkpos"} → ejecuta,
   con confirmación tipo GitHub (escribir el nombre exacto de la empresa).
   Registra snapshot de lo borrado en activity_logs (metadata) para auditoría.
"""
from datetime import datetime, timedelta
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import get_tenant_session, check_roles
from app.db.tenant_session import TenantSession
from app.models.base import (
    Product, InventoryMovementItem, SaleItem, StorageLocation,
    ProductCategory, ProductBOM, ProductSupplier,
)
from sqlalchemy import func

router = APIRouter()


class PurgeExecuteRequest(BaseModel):
    confirm_company_name: str          # debe coincidir EXACTAMENTE con el nombre de la empresa
    days_unused: int = 30              # sin movimientos hace N días
    include_zero_stock: bool = True    # productos con stock 0
    include_never_sold: bool = True    # productos sin venta histórica
    include_orphan_locations: bool = False  # ubicaciones sin productos
    created_after: Optional[str] = None  # modo rollback importación (YYYY-MM-DD)


def _get_last_activity_map(db: TenantSession, company_id) -> dict:
    """product_id → fecha del último movimiento de inventario (por empresa)."""
    from app.models.base import InventoryMovement, TenantModel
    from sqlalchemy import and_
    from sqlalchemy.orm import with_loader_criteria

    rows = (
        db._db.query(
            InventoryMovementItem.product_id,
            func.max(InventoryMovementItem.created_at),
        )
        .join(InventoryMovement, InventoryMovement.id == InventoryMovementItem.movement_id)
        .filter(InventoryMovement.company_id == company_id)
        .group_by(InventoryMovementItem.product_id)
        .all()
    )
    return {r[0]: r[1] for r in rows}


def _as_naive(dt):
    """Normaliza a datetime naive (UTC) para comparaciones seguras."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


@router.get("/purge/preview")
def purge_preview(
    days_unused: int = 30,
    created_after: Optional[str] = None,  # ISO date "2026-08-14" → modo rollback importación
    db: TenantSession = Depends(get_tenant_session),
    current_user=Depends(check_roles(["admin"])),
):
    """
    DRY-RUN: muestra exactamente qué se eliminaría. No modifica nada.

    Modos:
    - Normal: stock 0 Y (nunca vendido O sin movimiento en days_unused)
    - Rollback (created_after): productos CREADOS después de esa fecha y NUNCA vendidos,
      aunque tengan stock. Ideal para deshacer una importación mala de Excel.
    """
    cutoff = datetime.utcnow() - timedelta(days=days_unused)
    rollback_mode = bool(created_after)
    rollback_dt = None
    if rollback_mode:
        try:
            rollback_dt = datetime.fromisoformat(created_after)
        except ValueError:
            raise HTTPException(status_code=400, detail="Fecha inválida. Usa formato YYYY-MM-DD")

    company_id = current_user.company_id
    if not company_id:
        # Superadmin: usar la última empresa (misma lógica que email reports)
        from app.models.base import Company
        company = db._db.query(Company).order_by(Company.created_at.desc()).first()
        if not company:
            raise HTTPException(status_code=400, detail="No hay empresas")
        company_id = company.id

    last_activity = _get_last_activity_map(db, company_id)

    products = db.tenant_query(Product).filter(Product.is_active == True).all()
    # Asegurar scope de empresa si el TenantSession viene sin company (superadmin)
    if not db.company_id:
        products = [p for p in products if p.company_id == company_id]

    # Ventas históricas por producto (filtrado por empresa)
    from app.models.base import Ticket
    sold_product_ids = {
        r[0] for r in (
            db._db.query(SaleItem.product_id)
            .join(Ticket, Ticket.id == SaleItem.ticket_id)
            .filter(Ticket.company_id == company_id)
            .distinct().all()
        )
    }

    to_delete = []
    reasons_count = {"zero_stock": 0, "never_sold": 0, "unused": 0, "rollback_import": 0}

    for p in products:
        if p.is_scrap:
            continue
        last_mov = _as_naive(last_activity.get(p.id))
        p_created = _as_naive(p.created_at)
        reasons = []

        if rollback_mode:
            # Modo rollback importación: creado después de la fecha Y nunca vendido
            if not (p_created and p_created >= rollback_dt):
                continue  # creado antes de la fecha → no es parte de la importación
            if p.id in sold_product_ids:
                continue  # ya se vendió → NO borrar
            reasons.append("rollback_import")
            reasons.append("never_sold")
        else:
            # Modo normal: stock 0 Y (nunca vendido O sin movimientos)
            if float(p.stock_quantity or 0) == 0:
                reasons.append("zero_stock")
            if p.id not in sold_product_ids:
                reasons.append("never_sold")
            if last_mov and last_mov < cutoff:
                reasons.append("unused")
            elif not last_mov and p_created and p_created < cutoff:
                reasons.append("unused")

            if "zero_stock" not in reasons or ("never_sold" not in reasons and "unused" not in reasons):
                continue

        to_delete.append({
            "id": str(p.id),
            "name": p.name,
            "barcode": p.barcode,
            "stock": float(p.stock_quantity or 0),
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "reasons": reasons,
        })
        for r in reasons:
            if r in reasons_count:
                reasons_count[r] += 1

    # Ubicaciones huérfanas (sin NINGÚN producto activo asignado).
    # La asignación (location_id) es lo que ocupa una ubicación, no el stock:
    # una ubicación con un SKU asignado en stock 0 NO es huérfana.
    orphan_locations = []
    locs = db.tenant_query(StorageLocation).all()
    occupied_loc_ids = {
        p.location_id for p in products
        if p.location_id
    }
    for loc in locs:
        if loc.name == "Pasillo Mermas":
            continue
        if loc.id not in occupied_loc_ids:
            orphan_locations.append({
                "id": str(loc.id),
                "name": loc.name,
                "path": loc.path,
            })

    return {
        "company_id": str(current_user.company_id) if current_user.company_id else None,
        "products_to_delete": to_delete,
        "total_products": len(products),
        "total_to_delete": len(to_delete),
        "reasons_summary": reasons_count,
        "orphan_locations": orphan_locations,
        "dry_run": True,
        "warning": f"Se eliminarían {len(to_delete)} productos. Esta acción NO se puede deshacer.",
    }


@router.post("/purge/execute")
def purge_execute(
    data: PurgeExecuteRequest,
    db: TenantSession = Depends(get_tenant_session),
    current_user=Depends(check_roles(["admin"])),
):
    """
    Ejecuta la depuración. Requiere escribir el nombre EXACTO de la empresa
    (confirmación estilo GitHub). Guarda snapshot de lo borrado en activity_logs.
    """
    from app.models.base import Company, ActivityLog
    from app.services.activity_service import Actions

    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuario sin empresa asignada")

    company = db._db.query(Company).filter(
        Company.id == current_user.company_id
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # ── Confirmación tipo GitHub ──
    if data.confirm_company_name.strip() != company.name.strip():
        raise HTTPException(
            status_code=400,
            detail=f"El nombre no coincide. Escribe exactamente: '{company.name}'"
        )

    # ── Re-calcular qué borrar (mismo criterio del preview) ──
    preview = purge_preview(
        days_unused=data.days_unused,
        created_after=data.created_after,
        db=db, current_user=current_user,
    )
    product_ids = [UUID(p["id"]) for p in preview["products_to_delete"]]

    if not product_ids and not data.include_orphan_locations:
        return {"status": "ok", "deleted_products": 0, "deleted_locations": 0, "message": "Nada que depurar"}

    # ── Snapshot para auditoría (ANTES de borrar) ──
    snapshot = {
        "products": preview["products_to_delete"],
        "locations": preview["orphan_locations"] if data.include_orphan_locations else [],
        "executed_by": current_user.username,
        "executed_at": datetime.utcnow().isoformat(),
        "criteria": {
            "days_unused": data.days_unused,
            "include_zero_stock": data.include_zero_stock,
            "include_never_sold": data.include_never_sold,
        },
    }

    deleted_products = 0
    deleted_locations = 0

    try:
        # Borrado físico de productos (y sus relaciones)
        from app.models.base import QuoteItem, WorkOrderItem, PurchaseItem

        for pid in product_ids:
            # Limpiar TODAS las tablas que referencian productos (orden: hijos primero)
            db._db.query(QuoteItem).filter(QuoteItem.product_id == pid).delete()
            db._db.query(WorkOrderItem).filter(WorkOrderItem.product_id == pid).delete()
            db._db.query(PurchaseItem).filter(PurchaseItem.product_id == pid).delete()
            db._db.query(SaleItem).filter(SaleItem.product_id == pid).delete()
            db._db.query(InventoryMovementItem).filter(
                InventoryMovementItem.product_id == pid
            ).delete()
            db._db.query(ProductSupplier).filter(ProductSupplier.product_id == pid).delete()
            db._db.query(ProductBOM).filter(
                (ProductBOM.product_id == pid) | (ProductBOM.component_id == pid)
            ).delete()
            db._db.query(Product).filter(Product.id == pid).delete()
            deleted_products += 1

        # Ubicaciones huérfanas (opcional)
        if data.include_orphan_locations:
            for loc in preview["orphan_locations"]:
                loc_uuid = UUID(loc["id"])
                # Desvincular productos (stock 0) que aún referencian la ubicación
                db._db.query(Product).filter(
                    Product.location_id == loc_uuid
                ).update({Product.location_id: None})
                db._db.query(StorageLocation).filter(
                    StorageLocation.id == loc_uuid
                ).delete()
                deleted_locations += 1

        # ── Log de auditoría con snapshot completo ──
        entry = ActivityLog(
            company_id=current_user.company_id,
            user_id=current_user.username,
            user_name=current_user.full_name or current_user.username,
            action=Actions.PURGE_EXECUTED,
            entity_type="inventory",
            description=f"Ejecutó depuración: {deleted_products} productos y {deleted_locations} ubicaciones eliminados",
            severity=ActivityLog.Severity.CRITICAL,
            metadata_json={"snapshot": snapshot},
        )
        db._db.add(entry)

        db._db.commit()
    except Exception as e:
        db._db.rollback()
        raise HTTPException(status_code=500, detail=f"Error en depuración: {str(e)}")

    return {
        "status": "ok",
        "deleted_products": deleted_products,
        "deleted_locations": deleted_locations,
        "audit_log_id": str(entry.id),
        "message": f"Depuración completada: {deleted_products} productos eliminados. Snapshot guardado en audit log para auditoría."
    }
