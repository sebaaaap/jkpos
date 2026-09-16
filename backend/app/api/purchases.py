from uuid import UUID
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, Query, UploadFile, File, Header, HTTPException

from app.api.deps import get_tenant_session
from app.db.tenant_session import TenantSession
from app.schemas.purchases import PurchaseCreate, PurchaseResponse, PurchaseUpdate, PurchaseItemResponse
from app.services.purchase_service import PurchaseService
from app.api.deps import check_roles
from typing import List, Optional

router = APIRouter()

@router.post("/", response_model=PurchaseResponse)
def create_purchase(
    data: PurchaseCreate, 
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"])),
    branch_id: Optional[UUID] = Header(None, alias="X-Branch-ID")
):
    """
    Crea una nueva compra en estado BORRADOR.
    No afecta el stock hasta que se confirme.
    """
    service = PurchaseService(db)
    purchase = service.create_purchase(data)

    # Asignar la sucursal activa a la compra recién creada
    if branch_id:
        purchase.branch_id = branch_id
        db.commit()

    # ── Activity log ──
    try:
        from app.services.activity_service import log_activity, Actions
        log_activity(db._db, purchase.company_id, current_user,
                     Actions.PURCHASE_CREATED,
                     f"Creó compra borrador {purchase.invoice_number or ''} ({len(purchase.items)} ítems)",
                     entity_type="purchase", entity_id=purchase.id,
                     metadata={"total": float(purchase.total_cost or 0), "state": "DRAFT"})
        db._db.commit()
    except Exception:
        pass

    items_response = [
        PurchaseItemResponse(
            id=item.id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            subtotal=item.quantity * item.unit_cost
        )
        for item in purchase.items
    ]

    return PurchaseResponse(
        id=purchase.id,
        date_created=purchase.date_created,
        supplier_id=purchase.supplier_id,
        invoice_number=purchase.invoice_number,
        subtotal_net=purchase.subtotal_net,
        tax_amount=purchase.tax_amount,
        total_cost=purchase.total_cost,
        state=purchase.state.name,
        notes=purchase.notes,
        items=items_response
    )

@router.post("/upload-sii")
async def upload_sii_excel(
    file: UploadFile = File(...),
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"])),
    branch_id: Optional[UUID] = Header(None, alias="X-Branch-ID")
):
    """
    Parsea el Excel de Libro de Compras SII.
    - Auto-crea proveedores por RUT si no existen (sin duplicados)
    - Detecta facturas ya importadas por folio + supplier_id
    - Retorna cada factura con su supplier_id y flag already_imported
    """
    import pandas as pd
    import io
    from app.models.base import Supplier, Purchase
    from fastapi import HTTPException

    content = await file.read()

    try:
        df = pd.read_excel(io.BytesIO(content), header=None)
    except Exception:
        raise HTTPException(status_code=400, detail="Archivo Excel inválido o corrupto")

    # ── 1. Parsear el Excel ──────────────────────────────────────────────────
    invoices = []
    current_invoice = None
    parsing_items = False
    item_keys = []

    for idx, row in df.iterrows():
        col0 = str(row[0]).strip() if pd.notnull(row[0]) else ""

        if col0 == "TipoDTE":
            header_keys = row.tolist()
            val_row = df.iloc[idx + 1].tolist()
            invoice_data = {
                str(k).strip(): v
                for k, v in zip(header_keys, val_row)
                if pd.notnull(k) and str(k).strip()
            }
            current_invoice = {
                "supplier_rut": str(invoice_data.get("RutEmisor", "")).strip(),
                "supplier_name": str(invoice_data.get("RazonSocialEmisor", "")).strip(),
                "invoice_number": str(invoice_data.get("Folio", "")).strip(),
                "date_created": invoice_data.get("FechaEmision"),
                "total_neto": invoice_data.get("Total-Neto"),
                "total_iva": invoice_data.get("Total-IVA"),
                "total_monto": invoice_data.get("Total-MontoTotal"),
                "items": [],
            }
            invoices.append(current_invoice)
            parsing_items = False

        elif col0 == "DETALLE":
            item_keys = row.tolist()
            parsing_items = True

        elif parsing_items:
            if pd.isnull(row[1]) and pd.isnull(row[2]) and pd.isnull(row[3]):
                parsing_items = False
                continue

            if pd.notnull(row[1]):
                def _cv(val):
                    return None if (val is None or (isinstance(val, float) and pd.isnull(val))) else val

                item_data = {
                    str(k).strip(): v
                    for k, v in zip(item_keys, row.tolist())
                    if pd.notnull(k) and str(k).strip()
                }
                if "Codigo" in item_data and pd.notnull(item_data["Codigo"]):
                    current_invoice["items"].append({
                        "code":            str(item_data["Codigo"]).strip(),
                        "name":            str(item_data.get("Descripcion", "")),
                        "quantity":        _cv(item_data.get("Cantidad")),
                        "price":           _cv(item_data.get("Precio")),
                        "discount_pct":    _cv(item_data.get("Descuento %")),
                        "discount_amount": _cv(item_data.get("Descuento $")),
                        "final_price":     _cv(item_data.get("Monto-Item")),
                    })

    # ── 2. Auto-crear proveedores por RUT (upsert) ───────────────────────────
    supplier_id_by_rut: dict[str, str] = {}

    for inv in invoices:
        rut = inv["supplier_rut"]
        if not rut or rut == "nan" or rut in supplier_id_by_rut:
            continue

        existing = db.tenant_query(Supplier).filter(Supplier.tax_id == rut).first()
        if existing:
            supplier_id_by_rut[rut] = str(existing.id)
        else:
            new_sup = Supplier(
                name=inv["supplier_name"],
                tax_id=rut,
            )
            db.add(new_sup)
            db.flush()
            supplier_id_by_rut[rut] = str(new_sup.id)

    db.commit()

    # ── 3. Detectar folios ya importados (ignorando los cancelados) ───────────
    from app.models.base import PurchaseState
    # Recopilar todos los folios que vienen en el archivo
    all_folios = [inv["invoice_number"] for inv in invoices if inv["invoice_number"] not in ("", "nan")]

    existing_purchases_q = (
        db.tenant_query(Purchase.invoice_number)
        .filter(Purchase.invoice_number.in_(all_folios))
        .filter(Purchase.state != PurchaseState.CANCELLED)
    )
    if branch_id:
        existing_purchases_q = existing_purchases_q.filter(Purchase.branch_id == branch_id)
    existing_purchases = existing_purchases_q.all()
    already_imported_folios = {row[0] for row in existing_purchases}

    # ── 4. Agrupar por proveedor y anotar estado ─────────────────────────────
    suppliers_map: dict = {}

    for inv in invoices:
        rut = inv["supplier_rut"]
        if not rut or rut == "nan":
            continue

        # Normalizar fecha
        date_val = inv["date_created"]
        inv["date_created"] = str(date_val) if pd.notnull(date_val) else None

        # Anotar supplier_id y estado de duplicado
        inv["supplier_id"] = supplier_id_by_rut.get(rut)
        inv["already_imported"] = inv["invoice_number"] in already_imported_folios

        if rut not in suppliers_map:
            suppliers_map[rut] = {
                "rut": rut,
                "name": inv["supplier_name"],
                "supplier_id": inv["supplier_id"],
                "invoices": [],
            }
        suppliers_map[rut]["invoices"].append(inv)

    # Añadir branch_id a cada factura para que el front lo incluya al confirmar
    for inv in invoices:
        inv["branch_id"] = str(branch_id) if branch_id else None

    return {"suppliers": list(suppliers_map.values())}


@router.get("/", response_model=List[PurchaseResponse])
def list_purchases(
    state: Optional[str] = Query(None, description="Filtrar por estado: DRAFT, CONFIRMED, CANCELLED"),
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"])),
    branch_id: Optional[UUID] = Header(None, alias="X-Branch-ID")
):
    """
    Lista compras de la sucursal activa, opcionalmente filtradas por estado.
    """
    service = PurchaseService(db)
    purchases = service.list_purchases(state=state, branch_id=branch_id)

    return [
        PurchaseResponse(
            id=p.id,
            date_created=p.date_created,
            supplier_id=p.supplier_id,
            invoice_number=p.invoice_number,
            subtotal_net=p.subtotal_net,
            tax_amount=p.tax_amount,
            total_cost=p.total_cost,
            state=p.state.name,
            notes=p.notes,
            items=[
                PurchaseItemResponse(
                    id=item.id,
                    product_id=item.product_id,
                    quantity=item.quantity,
                    unit_cost=item.unit_cost,
                    subtotal=item.quantity * item.unit_cost
                )
                for item in p.items
            ]
        )
        for p in purchases
    ]

@router.get("/{purchase_id}", response_model=PurchaseResponse)
def get_purchase(
    purchase_id: UUID,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"])),
    branch_id: Optional[UUID] = Header(None, alias="X-Branch-ID")
):
    """
    Obtiene los detalles de una compra de la sucursal activa.
    """
    service = PurchaseService(db)
    purchase = service.get_purchase(purchase_id, branch_id=branch_id)

    return PurchaseResponse(
        id=purchase.id,
        date_created=purchase.date_created,
        supplier_id=purchase.supplier_id,
        invoice_number=purchase.invoice_number,
        subtotal_net=purchase.subtotal_net,
        tax_amount=purchase.tax_amount,
        total_cost=purchase.total_cost,
        state=purchase.state.name,
        notes=purchase.notes,
        items=[
            PurchaseItemResponse(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                subtotal=item.quantity * item.unit_cost
            )
            for item in purchase.items
        ]
    )

@router.post("/{purchase_id}/confirm", response_model=PurchaseResponse)
def confirm_purchase(
    purchase_id: UUID,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin"]))
):
    """
    Confirma una compra: cambia estado, actualiza costos, genera movimiento e incrementa stock.
    La sucursal se toma directamente de la compra (ya fue asignada al crearla).
    """
    service = PurchaseService(db)
    purchase = service.confirm_purchase(purchase_id)

    # ── Activity log ──
    try:
        from app.services.activity_service import log_activity, Actions
        log_activity(db._db, purchase.company_id, current_user,
                     Actions.PURCHASE_CONFIRMED,
                     f"Aprobó compra {purchase.invoice_number or ''} — stock actualizado",
                     entity_type="purchase", entity_id=purchase.id,
                     metadata={"total": float(purchase.total_cost or 0), "items": len(purchase.items)})
        db._db.commit()
    except Exception:
        pass

    return PurchaseResponse(
        id=purchase.id,
        date_created=purchase.date_created,
        supplier_id=purchase.supplier_id,
        invoice_number=purchase.invoice_number,
        subtotal_net=purchase.subtotal_net,
        tax_amount=purchase.tax_amount,
        total_cost=purchase.total_cost,
        state=purchase.state.name,
        notes=purchase.notes,
        items=[
            PurchaseItemResponse(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                subtotal=item.quantity * item.unit_cost
            )
            for item in purchase.items
        ]
    )

@router.post("/{purchase_id}/cancel", response_model=PurchaseResponse)
def cancel_purchase(
    purchase_id: UUID,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin"]))
):
    """
    Cancela una compra (solo si está en borrador).
    """
    service = PurchaseService(db)
    purchase = service.cancel_purchase(purchase_id)

    # ── Activity log ──
    try:
        from app.services.activity_service import log_activity, Actions
        from app.models.base import ActivityLog
        log_activity(db._db, purchase.company_id, current_user,
                     Actions.PURCHASE_CANCELLED,
                     f"Canceló compra {purchase.invoice_number or ''}",
                     entity_type="purchase", entity_id=purchase.id,
                     severity=ActivityLog.Severity.WARNING)
        db._db.commit()
    except Exception:
        pass

    return PurchaseResponse(
        id=purchase.id,
        date_created=purchase.date_created,
        supplier_id=purchase.supplier_id,
        invoice_number=purchase.invoice_number,
        subtotal_net=purchase.subtotal_net,
        tax_amount=purchase.tax_amount,
        total_cost=purchase.total_cost,
        state=purchase.state.name,
        notes=purchase.notes,
        items=[
            PurchaseItemResponse(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                subtotal=item.quantity * item.unit_cost
            )
            for item in purchase.items
        ]
    )

@router.patch("/{purchase_id}", response_model=PurchaseResponse)
def update_purchase(
    purchase_id: UUID,
    data: PurchaseUpdate,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"]))
):
    """
    Actualiza una compra (solo si está en borrador).
    """
    service = PurchaseService(db)
    purchase = service.update_purchase(purchase_id, data)

    # ── Activity log ──
    try:
        from app.services.activity_service import log_activity, Actions
        log_activity(db._db, purchase.company_id, current_user,
                     Actions.PURCHASE_UPDATED,
                     f"Editó compra borrador {purchase.invoice_number or purchase.id}",
                     entity_type="purchase", entity_id=purchase.id,
                     metadata={"invoice_number": purchase.invoice_number, "notes": purchase.notes})
        db._db.commit()
    except Exception:
        pass

    return PurchaseResponse(
        id=purchase.id,
        date_created=purchase.date_created,
        supplier_id=purchase.supplier_id,
        invoice_number=purchase.invoice_number,
        subtotal_net=purchase.subtotal_net,
        tax_amount=purchase.tax_amount,
        total_cost=purchase.total_cost,
        state=purchase.state.name,
        notes=purchase.notes,
        items=[
            PurchaseItemResponse(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                subtotal=item.quantity * item.unit_cost
            )
            for item in purchase.items
        ]
    )

@router.delete("/{purchase_id}")
def delete_purchase(
    purchase_id: UUID,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin"])),
    branch_id: Optional[UUID] = Header(None, alias="X-Branch-ID")
):
    """
    Elimina una compra de cualquier estado (borrador, confirmada o cancelada).
    - Borrador/Cancelada: borrado físico directo.
    - Confirmada: revierte el stock que ingresó (movimiento OUT_ADJUSTMENT
      trazable) y luego borra.
    Registra la acción en el audit log con el usuario responsable.
    """
    from app.models.base import Purchase, PurchaseState

    # Validar scope de sucursal: la compra debe pertenecer a la sucursal activa
    q = db.tenant_query(Purchase).filter(Purchase.id == purchase_id)
    if branch_id:
        q = q.filter(Purchase.branch_id == branch_id)
    purchase = q.first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Compra no encontrada en esta sucursal")

    service = PurchaseService(db)
    summary = service.delete_purchase(purchase_id)

    # ── Activity log ──
    try:
        from app.services.activity_service import log_activity, Actions
        from app.models.base import ActivityLog
        state = summary.get("state", "?")
        desc = f"Eliminó compra {purchase.invoice_number or purchase.id} ({state})"
        if summary.get("stock_reverted"):
            desc += f" — stock revertido: {summary['stock_reverted']} u."
        log_activity(db._db, purchase.company_id, current_user,
                     Actions.PURCHASE_DELETED, desc,
                     entity_type="purchase", entity_id=purchase.id,
                     severity=ActivityLog.Severity.WARNING,
                     metadata={
                         "state": state,
                         "total": float(purchase.total_cost or 0),
                         "stock_reverted": summary.get("stock_reverted", 0),
                         "items": summary.get("items", []),
                     })
        db._db.commit()
    except Exception:
        pass

    return {
        "status": "ok",
        "detail": f"Compra {purchase.invoice_number or purchase.id} eliminada"
                  + (f". Se revirtió {summary.get('stock_reverted', 0)} unidades de stock." if summary.get("stock_reverted") else "."),
    }


# ── SINGLE-SCAN INVOICE INTAKE (PISTOLA LECTORA) ──────────────────────────────

from pydantic import BaseModel, Field

class FastScanItem(BaseModel):
    product_id: Optional[UUID] = None
    product_name: str
    quantity: float = 1.0
    unit_cost: float = 0.0
    barcode: Optional[str] = None

class FastScanConfirmRequest(BaseModel):
    supplier_id: Optional[UUID] = None
    supplier_rut: Optional[str] = None
    supplier_name: Optional[str] = None
    invoice_number: str
    items: List[FastScanItem]
    notes: Optional[str] = None

class ParseScanRequest(BaseModel):
    scan_payload: str


@router.post("/parse-scanned-invoice")
def parse_scanned_invoice(
    data: ParseScanRequest,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"])),
    branch_id: Optional[UUID] = Header(None, alias="X-Branch-ID")
):
    """
    Parsea la ráfaga de la pistola lectora sobre el timbre/código de la factura impresa (TED / DTE / QR).
    Extrae RUT Emisor, Folio, Razón Social, Monto e Ítems.
    Garantiza company_id y branch_id multitenant.
    """
    import re
    from app.models.base import Supplier, Product

    raw = data.scan_payload.strip()

    supplier_rut = None
    supplier_name = None
    folio = None
    total_amount = None
    date_str = None
    items_raw = []

    # 1. Parsear TED (Timbre Electrónico DTE Chile en XML)
    rut_match = re.search(r"<RE>(.*?)</RE>", raw, re.IGNORECASE)
    if rut_match:
        supplier_rut = rut_match.group(1).strip()

    rso_match = re.search(r"<RSO>(.*?)</RSO>", raw, re.IGNORECASE)
    if rso_match:
        supplier_name = rso_match.group(1).strip()

    folio_match = re.search(r"<F>(.*?)</F>", raw, re.IGNORECASE)
    if folio_match:
        folio = folio_match.group(1).strip()

    date_match = re.search(r"<FE>(.*?)</FE>", raw, re.IGNORECASE)
    if date_match:
        date_str = date_match.group(1).strip()

    mnt_match = re.search(r"<MNT>(.*?)</MNT>", raw, re.IGNORECASE)
    if mnt_match:
        try:
            total_amount = float(mnt_match.group(1).strip())
        except ValueError:
            pass

    # Extraer ítems IT1, IT2, NmbItem del XML
    items_matches = re.findall(r"<(?:IT\d+|NmbItem)>(.*?)</(?:IT\d+|NmbItem)>", raw, re.IGNORECASE)
    for it in items_matches:
        if it.strip():
            items_raw.append(it.strip())

    # 2. Fallbacks de expresiones regulares si no es un XML TED completo
    if not supplier_rut:
        rut_fallback = re.search(r"\b(\d{1,8}-[\dkK])\b", raw)
        if rut_fallback:
            supplier_rut = rut_fallback.group(1)

    if not folio:
        folio_fallback = re.search(r"(?:folio|factura|nro|num)[:\s]*(\d+)", raw, re.IGNORECASE)
        if folio_fallback:
            folio = folio_fallback.group(1)

    if not total_amount:
        total_fallback = re.search(r"(?:total|monto)[:\s]*(\d+(?:\.\d+)?)", raw, re.IGNORECASE)
        if total_fallback:
            try:
                total_amount = float(total_fallback.group(1))
            except ValueError:
                pass

    if not folio:
        folio = f"SCAN-{int(datetime.utcnow().timestamp())}"

    # 3. Vincular o Auto-crear Proveedor respetando tenant company_id
    supplier_obj = None
    if supplier_rut:
        supplier_obj = db.tenant_query(Supplier).filter(Supplier.tax_id == supplier_rut).first()
        if not supplier_obj:
            supplier_obj = Supplier(
                name=supplier_name or f"Proveedor {supplier_rut}",
                tax_id=supplier_rut,
                company_id=db.company_id
            )
            db.add(supplier_obj)
            db.commit()
            db.refresh(supplier_obj)

    # 4. Mapear ítems con catálogo de productos por código o nombre
    mapped_items = []
    all_products = db.tenant_query(Product).filter(Product.is_active == True).all()
    prod_map_by_barcode = {p.barcode: p for p in all_products if p.barcode}
    prod_map_by_name = {p.name.upper(): p for p in all_products if p.name}

    if items_raw:
        for raw_item in items_raw:
            matched = prod_map_by_name.get(raw_item.upper()) or prod_map_by_barcode.get(raw_item)
            mapped_items.append({
                "product_id": str(matched.id) if matched else None,
                "product_name": matched.name if matched else raw_item,
                "quantity": 1.0,
                "unit_cost": float(matched.cost) if matched else 0.0,
                "barcode": matched.barcode if matched else None,
                "is_matched": matched is not None
            })
    else:
        # Si la factura escaneada no lista nombres de ítems individuales, retornar plantilla inicial
        mapped_items.append({
            "product_id": None,
            "product_name": "Mercancía Factura " + str(folio),
            "quantity": 1.0,
            "unit_cost": total_amount or 0.0,
            "barcode": None,
            "is_matched": False
        })

    return {
        "supplier_id": str(supplier_obj.id) if supplier_obj else None,
        "supplier_rut": supplier_rut or (supplier_obj.tax_id if supplier_obj else ""),
        "supplier_name": supplier_obj.name if supplier_obj else (supplier_name or "Proveedor Desconocido"),
        "invoice_number": folio,
        "date_created": date_str or datetime.utcnow().strftime("%Y-%m-%d"),
        "total_amount": total_amount or 0.0,
        "items": mapped_items
    }


@router.post("/fast-confirm-scanned", response_model=PurchaseResponse)
def fast_confirm_scanned_purchase(
    data: FastScanConfirmRequest,
    db: TenantSession = Depends(get_tenant_session),
    current_user = Depends(check_roles(["admin", "inventario"])),
    branch_id: Optional[UUID] = Header(None, alias="X-Branch-ID")
):
    """
    Confirma de un solo golpe la compra escaneada e incrementa el stock de inventario.
    Garantiza estricto aislamiento por company_id y branch_id.
    """
    from app.models.base import Supplier, Product, StorageLocation, Purchase, PurchaseItem, PurchaseState

    if not data.items or len(data.items) == 0:
        raise HTTPException(status_code=400, detail="La compra debe incluir al menos un ítem")

    # 1. Obtener o crear proveedor asignando company_id
    supplier_id = data.supplier_id
    if not supplier_id and data.supplier_rut:
        existing_sup = db.tenant_query(Supplier).filter(Supplier.tax_id == data.supplier_rut).first()
        if existing_sup:
            supplier_id = existing_sup.id
        else:
            new_sup = Supplier(
                name=data.supplier_name or f"Proveedor {data.supplier_rut}",
                tax_id=data.supplier_rut,
                company_id=db.company_id
            )
            db.add(new_sup)
            db.flush()
            supplier_id = new_sup.id

    # 2. Ubicación por defecto de la sucursal
    default_loc = db.tenant_query(StorageLocation).filter(StorageLocation.name != "Pasillo Mermas")
    if branch_id:
        default_loc = default_loc.filter(StorageLocation.branch_id == branch_id)
    first_loc = default_loc.first()
    loc_id = first_loc.id if first_loc else None

    # 3. Procesar o auto-crear productos
    purchase_items_payload = []
    for item in data.items:
        prod_id = item.product_id
        if not prod_id:
            # Buscar si ya existe por nombre o código de barras
            q = db.tenant_query(Product).filter(Product.is_active == True)
            if item.barcode:
                existing_p = q.filter(Product.barcode == item.barcode).first()
            else:
                existing_p = q.filter(Product.name == item.product_name).first()

            if existing_p:
                prod_id = existing_p.id
            else:
                # Crear producto con company_id y branch_id explícitos
                new_prod = Product(
                    name=item.product_name,
                    barcode=item.barcode or f"BC-{int(datetime.utcnow().timestamp() * 1000)}",
                    cost=Decimal(str(item.unit_cost or 0)),
                    price=Decimal(str((item.unit_cost or 0) * 1.3)),
                    stock_quantity=0,
                    location_id=loc_id,
                    company_id=db.company_id,
                    branch_id=branch_id,
                    is_active=True
                )
                db.add(new_prod)
                db.flush()
                prod_id = new_prod.id

        purchase_items_payload.append({
            "product_id": prod_id,
            "quantity": item.quantity,
            "unit_cost": item.unit_cost
        })

    # 4. Crear Compra con la estructura requerida por PurchaseService
    from app.schemas.purchases import PurchaseCreate, PurchaseItemCreate
    purchase_create_data = PurchaseCreate(
        supplier_id=supplier_id,
        invoice_number=data.invoice_number,
        purchase_category="MERCADERÍA",
        notes=data.notes or "Ingreso por Pinchazo Único de Factura (Pistola Lectora)",
        items=[
            PurchaseItemCreate(
                product_id=it["product_id"],
                quantity=it["quantity"],
                unit_cost=it["unit_cost"]
            )
            for it in purchase_items_payload
        ]
    )

    service = PurchaseService(db)
    purchase = service.create_purchase(purchase_create_data)

    if branch_id:
        purchase.branch_id = branch_id
        db.commit()

    # 5. Confirmar inmediatamente la compra para incrementar el stock en inventario
    confirmed_purchase = service.confirm_purchase(purchase.id)

    # ── Activity log: factura escaneada con pistola ──
    try:
        from app.services.activity_service import log_activity, Actions
        log_activity(db._db, confirmed_purchase.company_id, current_user,
                     Actions.PURCHASE_CONFIRMED,
                     f"Ingresó factura por pistola: folio {confirmed_purchase.invoice_number or ''} ({len(confirmed_purchase.items)} ítems) — stock actualizado",
                     entity_type="purchase", entity_id=confirmed_purchase.id,
                     metadata={
                         "total": float(confirmed_purchase.total_cost or 0),
                         "method": "barcode_scan",
                         "supplier": data.supplier_name,
                     })
        db._db.commit()
    except Exception:
        pass

    return PurchaseResponse(
        id=confirmed_purchase.id,
        date_created=confirmed_purchase.date_created,
        supplier_id=confirmed_purchase.supplier_id,
        invoice_number=confirmed_purchase.invoice_number,
        subtotal_net=confirmed_purchase.subtotal_net,
        tax_amount=confirmed_purchase.tax_amount,
        total_cost=confirmed_purchase.total_cost,
        state=confirmed_purchase.state.name,
        notes=confirmed_purchase.notes,
        items=[
            PurchaseItemResponse(
                id=item.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                subtotal=item.quantity * item.unit_cost
            )
            for item in confirmed_purchase.items
        ]
    )
