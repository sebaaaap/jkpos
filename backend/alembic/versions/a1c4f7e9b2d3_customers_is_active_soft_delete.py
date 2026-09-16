"""customers is_active + unique por (company_id, rut) / (company_id, plate) — blindada

Revision ID: a1c4f7e9b2d3
Revises: 9acf389999c7
Create Date: 2026-08-20

Idempotente e introspectiva (no rompe producción):
- add_column solo si la columna no existe.
- Drop de índices únicos globales solo si existen, detectándolos por
  definición (columna exacta + unique), independiente del nombre.
- Antes de crear cada unique compuesto, deduplica RUT/patentes repetidos
  dentro de una misma company (sufijo -DUP{n}, conserva el más antiguo).
- create_unique_constraint solo si no existe ya una igual.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4f7e9b2d3'
down_revision: Union[str, Sequence[str], None] = '9acf389999c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _unique_single_col_indexes(insp, table, col):
    """Nombres de índices UNIQUE que cubren exactamente `col` (cualquier nombre)."""
    return {
        ix["name"]
        for ix in insp.get_indexes(table)
        if ix.get("unique") and ix["column_names"] == [col] and ix["name"]
    }

def _unique_constraints(insp, table):
    """Set de tuplas de columnas de las UNIQUE constraints existentes."""
    return {tuple(uq["column_names"]) for uq in insp.get_unique_constraints(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # ── 1. customers.is_active (soft delete) ─────────────────────────────────
    if "is_active" not in {c["name"] for c in insp.get_columns("customers")}:
        op.add_column('customers', sa.Column('is_active', sa.Boolean(), nullable=True, server_default=sa.text('true')))

    # ── 2. Deduplicar por empresa ANTES de las constraints ───────────────────
    # El más antiguo conserva el valor original; los repetidos llevan -DUP{n}.
    bind.execute(sa.text("""
        UPDATE customers c SET rut = CONCAT(rut, '-DUP', n.n)
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY company_id, rut ORDER BY date_created ASC, id ASC
            ) AS n
            FROM customers
        ) n
        WHERE c.id = n.id AND n.n > 1
    """))
    bind.execute(sa.text("""
        UPDATE vehicles v SET license_plate = CONCAT(license_plate, '-DUP', n.n)
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY company_id, license_plate ORDER BY date_created ASC, id ASC
            ) AS n
            FROM vehicles
        ) n
        WHERE v.id = n.id AND n.n > 1
    """))

    # ── 3. Dropear índices únicos globales (si existen) ──────────────────────
    for table, col in (("customers", "rut"), ("vehicles", "license_plate")):
        for name in _unique_single_col_indexes(insp, table, col):
            op.drop_index(name, table_name=table)
        insp = sa.inspect(bind)  # refrescar tras drops

    # ── 4. Uniques compuestos por empresa (solo si no existen) ───────────────
    if ("company_id", "rut") not in _unique_constraints(insp, "customers"):
        op.create_unique_constraint('uix_customer_company_rut', 'customers', ['company_id', 'rut'])
    if ("company_id", "license_plate") not in _unique_constraints(insp, "vehicles"):
        op.create_unique_constraint('uix_vehicle_company_plate', 'vehicles', ['company_id', 'license_plate'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if ("company_id", "license_plate") in _unique_constraints(insp, "vehicles"):
        op.drop_constraint('uix_vehicle_company_plate', 'vehicles', type_='unique')
    if ("company_id", "rut") in _unique_constraints(insp, "customers"):
        op.drop_constraint('uix_customer_company_rut', 'customers', type_='unique')

    if not _unique_single_col_indexes(insp, "vehicles", "license_plate"):
        op.create_index('ix_vehicles_license_plate', 'vehicles', ['license_plate'], unique=True)
    if not _unique_single_col_indexes(insp, "customers", "rut"):
        op.create_index('ix_customers_rut', 'customers', ['rut'], unique=True)

    if "is_active" in {c["name"] for c in insp.get_columns("customers")}:
        op.drop_column('customers', 'is_active')
