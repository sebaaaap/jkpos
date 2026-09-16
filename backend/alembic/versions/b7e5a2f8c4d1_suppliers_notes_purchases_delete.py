"""suppliers notes — blindada

Revision ID: b7e5a2f8c4d1
Revises: a1c4f7e9b2d3
Create Date: 2026-08-20

Idempotente: agrega suppliers.notes solo si no existe.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e5a2f8c4d1'
down_revision: Union[str, Sequence[str], None] = 'a1c4f7e9b2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "notes" not in {c["name"] for c in insp.get_columns("suppliers")}:
        op.add_column('suppliers', sa.Column('notes', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "notes" in {c["name"] for c in insp.get_columns("suppliers")}:
        op.drop_column('suppliers', 'notes')
