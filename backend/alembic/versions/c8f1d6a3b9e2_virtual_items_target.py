"""quote/wo/sale items: soporte de items virtuales (target)

Revision ID: c8f1d6a3b9e2
Revises: b7e5a2f8c4d1
Create Date: 2026-08-21

Permite cotizar productos que no están en inventario ("targets"):
- quote_items / work_order_items / sale_items: product_id pasa a NULLABLE,
  se agregan virtual_name y is_virtual.
Idempotente: cada paso introspecta el schema antes de aplicarse.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8f1d6a3b9e2'
down_revision: Union[str, Sequence[str], None] = 'b7e5a2f8c4d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(insp, table):
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    for table in ("quote_items", "work_order_items", "sale_items"):
        # nuevas columnas
        if "virtual_name" not in _cols(insp, table):
            op.add_column(table, sa.Column('virtual_name', sa.String(), nullable=True))
        if "is_virtual" not in _cols(insp, table):
            op.add_column(table, sa.Column('is_virtual', sa.Boolean(), nullable=False, server_default=sa.text('false')))
        insp = sa.inspect(bind)

        # product_id → nullable (solo si hoy es NOT NULL)
        col = next(c for c in insp.get_columns(table) if c["name"] == "product_id")
        if not col.get("nullable", True):
            op.alter_column(table, 'product_id',
                             existing_type=sa.UUID(as_uuid=True),
                             nullable=True)
            insp = sa.inspect(bind)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Antes de re-endurecer NOT NULL, virtualizar cualquier fila huerfana:
    # los items con product_id NULL se eliminan (no debieran existir si el
    # downgrade es intencional) para no violar la constraint.
    for table in ("quote_items", "work_order_items", "sale_items"):
        bind.execute(sa.text(f"DELETE FROM {table} WHERE product_id IS NULL"))

    for table in ("quote_items", "work_order_items", "sale_items"):
        col = next(c for c in insp.get_columns(table) if c["name"] == "product_id")
        if col.get("nullable", True):
            op.alter_column(table, 'product_id',
                             existing_type=sa.UUID(as_uuid=True),
                             nullable=False)
        if "is_virtual" in _cols(insp, table):
            op.drop_column(table, 'is_virtual')
        if "virtual_name" in _cols(insp, table):
            op.drop_column(table, 'virtual_name')
        insp = sa.inspect(bind)
