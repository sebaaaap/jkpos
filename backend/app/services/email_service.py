"""
Email Service — Reportes automáticos por correo usando Resend.
Requiere: RESEND_API_KEY en variables de entorno.
"""
import os
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.base import (
    Ticket, SaleItem, Payment, SaleState, Product, ProductType,
    Expense, ExpenseCategory, CashSession, User, UserRole,
    StorageLocation, Branch
)


def _fmt_money(amount) -> str:
    """Formatea un número como moneda chilena."""
    return f"${float(amount or 0):,.0f}".replace(",", ".")


def _get_sales_data(db: Session, company_id, start_dt, end_dt) -> dict:
    """Resumen de ventas del período."""
    VALID_STATES = [SaleState.VALIDATED, SaleState.PAID]

    tickets = db.query(Ticket).filter(
        Ticket.company_id == company_id,
        Ticket.date_created >= start_dt,
        Ticket.date_created <= end_dt,
        Ticket.state.in_(VALID_STATES),
        Ticket.is_refunded == False
    ).all()

    gross = sum((t.total_amount or 0) for t in tickets)
    total_count = len(tickets)
    avg_ticket = gross / total_count if total_count else Decimal('0')

    # Breakdown por método de pago
    pay_totals = {}
    for t in tickets:
        for p in t.payments:
            pm = str(p.payment_method).lower()
            if hasattr(p.payment_method, 'value'):
                pm = p.payment_method.value
            pay_totals[pm] = pay_totals.get(pm, Decimal('0')) + (p.amount or Decimal('0'))

    return {
        "gross_sales": gross,
        "ticket_count": total_count,
        "avg_ticket": avg_ticket,
        "payment_breakdown": pay_totals,
    }


def _get_inventory_data(db: Session, company_id) -> dict:
    """Estado del inventario + alertas de bajo stock."""
    products = db.query(Product).filter(
        Product.company_id == company_id,
        Product.is_active == True,
        Product.product_type != ProductType.SERVICE
    ).all()

    total_valuation = sum(
        (p.stock_quantity or 0) * (p.cost or 0) for p in products
    )
    low_stock = [
        {"name": p.name, "stock": p.stock_quantity, "min": p.min_stock}
        for p in products
        if (p.stock_quantity or 0) <= (p.min_stock or 0)
    ]

    return {
        "total_products": len(products),
        "total_valuation": total_valuation,
        "low_stock_alerts": low_stock,
    }


def _get_expenses_data(db: Session, company_id, start_dt, end_dt) -> dict:
    """Resumen de gastos del período."""
    expenses = db.query(Expense).filter(
        Expense.company_id == company_id,
        Expense.date_created >= start_dt,
        Expense.date_created <= end_dt
    ).all()

    total = sum(Decimal(str(e.amount or 0)) for e in expenses)

    # Breakdown por categoría
    cat_map = {
        c.id: c.name for c in db.query(ExpenseCategory).filter(
            ExpenseCategory.company_id == company_id
        ).all()
    }

    cat_totals = {}
    for e in expenses:
        cat_name = cat_map.get(e.category_id, "Sin categoría")
        cat_totals[cat_name] = cat_totals.get(cat_name, Decimal('0')) + Decimal(str(e.amount or 0))

    return {
        "total_expenses": total,
        "count": len(expenses),
        "category_breakdown": cat_totals,
    }


def build_report_html(
    db: Session,
    company_id,
    company_name: str,
    period_label: str,
    start_dt: datetime,
    end_dt: datetime,
    logo_url: str = None
) -> str:
    """
    Construye el HTML del reporte con todas las secciones:
    Ventas, Inventario, Gastos, Alertas.
    """
    sales = _get_sales_data(db, company_id, start_dt, end_dt)
    inventory = _get_inventory_data(db, company_id)
    expenses = _get_expenses_data(db, company_id, start_dt, end_dt)

    net = sales["gross_sales"] - expenses["total_expenses"]

    # ── Métodos de pago ──────────────────────────────────────────────
    pm_rows = ""
    for method, amount in sorted(sales["payment_breakdown"].items(), key=lambda x: -x[1]):
        pm_rows += f"""
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">{method.capitalize()}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">{_fmt_money(amount)}</td>
        </tr>"""

    # ── Alertas de bajo stock ────────────────────────────────────────
    low_stock_count = len(inventory["low_stock_alerts"])
    if low_stock_count > 0:
        stock_rows = ""
        for item in inventory["low_stock_alerts"][:10]:  # Top 10
            stock_rows += f"""
            <tr>
                <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">{item['name']}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#dc2626;font-weight:600;">{item['stock']}</td>
                <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#94a3b8;">{item['min']}</td>
            </tr>"""
        stock_section = f"""
        <div style="margin-top:24px;">
            <h3 style="color:#dc2626;margin-bottom:8px;">⚠️ Alertas de Bajo Stock ({low_stock_count} productos)</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="background:#fef2f2;">
                        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fecaca;">Producto</th>
                        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #fecaca;">Stock Actual</th>
                        <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #fecaca;">Stock Mín</th>
                    </tr>
                </thead>
                <tbody>{stock_rows}</tbody>
            </table>
        </div>"""
    else:
        stock_section = '<div style="margin-top:24px;"><h3 style="color:#16a34a;">✅ Sin alertas de bajo stock</h3></div>'

    # ── Gastos por categoría ─────────────────────────────────────────
    exp_rows = ""
    for cat, amount in sorted(expenses["category_breakdown"].items(), key=lambda x: -x[1]):
        exp_rows += f"""
        <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">{cat}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;">{_fmt_money(amount)}</td>
        </tr>"""

    # ── HTML final ───────────────────────────────────────────────────
    html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

            <!-- Header -->
            <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:28px 24px;text-align:center;">
                {f'<img src="{logo_url}" alt="{company_name}" style="max-height:56px;max-width:200px;margin:0 auto 8px auto;display:block;object-fit:contain;"/>' if logo_url else ''}
                <h1 style="color:#ffffff;margin:0 0 4px 0;font-size:22px;font-weight:700;">{company_name}</h1>
                <p style="color:#94a3b8;margin:0;font-size:13px;">Reporte {period_label}</p>
                <p style="color:#64748b;margin:4px 0 0 0;font-size:11px;">
                    {start_dt.strftime('%d/%m/%Y')} — {end_dt.strftime('%d/%m/%Y')}
                </p>
            </div>

            <!-- KPIs principales -->
            <div style="padding:24px;">
                <div style="display:flex;gap:12px;margin-bottom:20px;">
                    <div style="flex:1;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
                        <p style="color:#16a34a;font-size:11px;margin:0 0 4px 0;text-transform:uppercase;font-weight:600;">Ventas</p>
                        <p style="color:#15803d;font-size:22px;font-weight:700;margin:0;">{_fmt_money(sales['gross_sales'])}</p>
                    </div>
                    <div style="flex:1;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;">
                        <p style="color:#dc2626;font-size:11px;margin:0 0 4px 0;text-transform:uppercase;font-weight:600;">Gastos</p>
                        <p style="color:#b91c1c;font-size:22px;font-weight:700;margin:0;">{_fmt_money(expenses['total_expenses'])}</p>
                    </div>
                </div>

                <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
                    <p style="color:#c7d2fe;font-size:11px;margin:0 0 4px 0;text-transform:uppercase;font-weight:600;">Balance Neto</p>
                    <p style="color:#ffffff;font-size:26px;font-weight:700;margin:0;">{_fmt_money(net)}</p>
                </div>

                <!-- Detalle ventas -->
                <h3 style="color:#1e293b;margin-bottom:8px;">📊 Detalle de Ventas</h3>
                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px;">
                    <tr><td style="padding:6px 0;color:#64748b;">N° Transacciones</td><td style="padding:6px 0;text-align:right;font-weight:600;">{sales['ticket_count']}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b;">Ticket Promedio</td><td style="padding:6px 0;text-align:right;font-weight:600;">{_fmt_money(sales['avg_ticket'])}</td></tr>
                </table>

                <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
                    <thead><tr style="background:#f8fafc;">
                        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Método de Pago</th>
                        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0;">Total</th>
                    </tr></thead>
                    <tbody>{pm_rows}</tbody>
                </table>

                <!-- Gastos -->
                <h3 style="color:#1e293b;margin:24px 0 8px 0;">💸 Gastos por Categoría</h3>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead><tr style="background:#f8fafc;">
                        <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Categoría</th>
                        <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0;">Total</th>
                    </tr></thead>
                    <tbody>{exp_rows if exp_rows else '<tr><td colspan="2" style="padding:12px;text-align:center;color:#94a3b8;">Sin gastos en el período</td></tr>'}</tbody>
                </table>

                <!-- Inventario -->
                <h3 style="color:#1e293b;margin:24px 0 8px 0;">📦 Inventario</h3>
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <tr><td style="padding:6px 0;color:#64748b;">Total Productos</td><td style="padding:6px 0;text-align:right;font-weight:600;">{inventory['total_products']}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b;">Valoración Total</td><td style="padding:6px 0;text-align:right;font-weight:600;">{_fmt_money(inventory['total_valuation'])}</td></tr>
                </table>

                {stock_section}

            </div>

            <!-- Footer -->
            <div style="background:#f8fafc;padding:16px 24px;text-align:center;">
                <p style="color:#94a3b8;font-size:11px;margin:0;">
                    Reporte generado automáticamente • {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} UTC
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


def get_period_dates(period: str) -> tuple[datetime, datetime, str]:
    """Calcula start/end según el período solicitado."""
    now = datetime.utcnow()
    if period == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
        end = start.replace(hour=23, minute=59, second=59) + timedelta(days=1)
        label = "Diario"
    elif period == "weekly":
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = end - timedelta(days=7)
        label = "Semanal"
    elif period == "monthly":
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = (end - timedelta(days=30)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        label = "Mensual"
    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = now
        label = "Hoy"
    return start, end, label


def send_report_email(
    db: Session,
    company_id,
    company_name: str,
    period: str,
    recipient_emails: list[str]
) -> dict:
    """
    Genera y envía el reporte por correo a los destinatarios indicados.
    Requiere RESEND_API_KEY.
    """
    import requests

    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="RESEND_API_KEY no configurada")

    start_dt, end_dt, label = get_period_dates(period)

    # Obtener logo de la empresa
    from app.models.base import Company
    company = db.query(Company).filter(Company.id == company_id).first()
    logo_url = company.logo_url if company else None

    html = build_report_html(db, company_id, company_name, label, start_dt, end_dt, logo_url)

    # Enviar via Resend API
    resp = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": "jkpos <onboarding@resend.dev>",
            "to": recipient_emails,
            "subject": f"📊 Reporte {label} — {company_name} ({start_dt.strftime('%d/%m')})",
            "html": html,
        },
        timeout=30,
    )

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=500,
            detail=f"Error enviando correo: {resp.text}"
        )

    # Email ID de Resend para rastrear entrega en resend.com/emails
    try:
        resend_data = resp.json()
    except Exception:
        resend_data = {}
    email_id = resend_data.get("id")
    print(f"[EMAIL] Resend accepted — id={email_id} to={recipient_emails}", flush=True)

    # ── Activity log: correo enviado ──
    try:
        from app.services.activity_service import log_activity, Actions
        log_activity(db, company_id, None,
                     Actions.EMAIL_REPORT_SENT,
                     f"Reporte {label} enviado por correo a {len(recipient_emails)} destinatario(s)",
                     entity_type="email",
                     metadata={"period": label, "recipients": recipient_emails, "resend_id": email_id},
                     auto_commit=True)
    except Exception:
        pass

    return {
        "status": "ok",
        "period": label,
        "recipients": recipient_emails,
        "company": company_name,
        "resend_email_id": email_id,
    }
