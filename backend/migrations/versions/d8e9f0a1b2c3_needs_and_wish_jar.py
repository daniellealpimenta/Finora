"""need/want flag on transactions and the wish jar

Revision ID: d8e9f0a1b2c3
Revises: c3d4e5f6a7b8
Create Date: 2026-10-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("need", sa.Boolean(), nullable=True))
    with op.batch_alter_table("wish_items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("saved", sa.Numeric(14, 2), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("wish_items", schema=None) as batch_op:
        batch_op.drop_column("saved")
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.drop_column("need")
