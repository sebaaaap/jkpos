from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_tenant_session, check_roles
from app.db.tenant_session import TenantSession
from app.models.base import Supplier, Purchase
from app.schemas.suppliers import SupplierCreate, SupplierUpdate, SupplierResponse
from typing import List, Optional

router = APIRouter()

def _log(db, company_id, user, action, desc, entity_id=None, metadata=None):
    """Audit log que nunca rompe el flujo de negocio."""
    try:
        from app.services.activity_service import log_activity
        log_activity(db._db, company_id, user, action, desc,
                     entity_type="supplier", entity_id=entity_id, metadata=metadata)
        db._db.commit()
    except Exception:
        pass

@router.post("/", response_model=SupplierResponse)
def create_supplier(
    data: SupplierCreate,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"]))
):
    # RUT/tax_id único por empresa si viene
    if data.tax_id:
        dup = db.tenant_query(Supplier).filter(Supplier.tax_id == data.tax_id).first()
        if dup:
            raise HTTPException(
                status_code=400,
                detail=f"Ya existe un proveedor con RUT {data.tax_id}: {dup.name}"
            )
    db_obj = Supplier(**data.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    _log(db, db_obj.company_id, current_user, "supplier.created",
         f"Creó el proveedor '{db_obj.name}'" + (f" (RUT {db_obj.tax_id})" if db_obj.tax_id else ""),
         entity_id=db_obj.id)
    return db_obj

@router.get("/", response_model=List[SupplierResponse])
def list_suppliers(
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario", "vendedor"]))
):
    return db.tenant_query(Supplier).order_by(Supplier.name.asc()).all()

@router.get("/{id}", response_model=SupplierResponse)
def get_supplier(
    id: UUID,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario", "vendedor"]))
):
    obj = db.tenant_query(Supplier).filter(Supplier.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return obj

@router.put("/{id}", response_model=SupplierResponse)
def update_supplier(
    id: UUID,
    data: SupplierUpdate,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"]))
):
    obj = db.tenant_query(Supplier).filter(Supplier.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    update_data = data.model_dump(exclude_unset=True)

    # RUT duplicado dentro de la empresa (excluyéndose a sí mismo)
    if update_data.get("tax_id") and update_data["tax_id"] != obj.tax_id:
        dup = db.tenant_query(Supplier).filter(
            Supplier.tax_id == update_data["tax_id"],
            Supplier.id != id
        ).first()
        if dup:
            raise HTTPException(
                status_code=400,
                detail=f"El RUT {update_data['tax_id']} ya pertenece a otro proveedor: {dup.name}"
            )

    for key, value in update_data.items():
        setattr(obj, key, value)

    db.commit()
    db.refresh(obj)
    _log(db, obj.company_id, current_user, "supplier.updated",
         f"Editó el proveedor '{obj.name}'", entity_id=obj.id,
         metadata={"campos": list(update_data.keys())})
    return obj

@router.delete("/{id}")
def delete_supplier(
    id: UUID,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin"]))
):
    obj = db.tenant_query(Supplier).filter(Supplier.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    name = obj.name
    company_id = obj.company_id
    purchases_count = db.tenant_query(Purchase).filter(Purchase.supplier_id == id).count()

    # Desvincular compras históricas (Purchase.supplier_id es nullable → "N/A")
    db.tenant_query(Purchase).filter(Purchase.supplier_id == id).update(
        {Purchase.supplier_id: None}, synchronize_session=False
    )
    # ProductSupplier tiene cascade="all, delete-orphan" → se borra con el proveedor
    db.delete(obj)
    db.commit()
    _log(db, company_id, current_user, "supplier.deleted",
         f"Eliminó el proveedor '{name}' ({purchases_count} compras quedaron sin proveedor asignado)",
         entity_id=id, metadata={"purchases_desvinculadas": purchases_count})
    return {"status": "ok", "detail": f"Proveedor '{name}' eliminado. {purchases_count} compra(s) históricas quedaron sin proveedor (se preservan en el historial)."}
