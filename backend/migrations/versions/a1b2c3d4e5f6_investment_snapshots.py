"""investment daily snapshots

Revision ID: a1b2c3d4e5f6
Revises: f6a2b4c8d1e3
Create Date: 2026-10-23 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f6a2b4c8d1e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "investment_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("investment_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("balance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("amount_original", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.ForeignKeyConstraint(["investment_id"], ["investments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("investment_id", "day"),
    )
    op.create_index(
        op.f("ix_investment_snapshots_investment_id"),
        "investment_snapshots",
        ["investment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_investment_snapshots_investment_id"), table_name="investment_snapshots")
    op.drop_table("investment_snapshots")
