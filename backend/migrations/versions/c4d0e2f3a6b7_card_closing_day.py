"""closing day chosen by the user for each card

Revision ID: c4d0e2f3a6b7
Revises: b3c9d1e2f4a5
Create Date: 2026-10-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d0e2f3a6b7'
down_revision: Union[str, Sequence[str], None] = 'b3c9d1e2f4a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("closing_day", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.drop_column("closing_day")
