"""savings pots and investment details

Revision ID: a72e86347bd8
Revises: 266eea7a9f25
Create Date: 2026-10-17 18:42:22.712498

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a72e86347bd8'
down_revision: Union[str, Sequence[str], None] = '266eea7a9f25'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "savings_pots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("goal_amount", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("auto_key", sa.String(length=160), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("auto_key", name="uq_savings_pots_auto_key"),
    )
    with op.batch_alter_table("investments", schema=None) as batch_op:
        batch_op.add_column(sa.Column("rate", sa.Numeric(precision=9, scale=4), nullable=True))
        batch_op.add_column(sa.Column("rate_type", sa.String(length=16), nullable=True))
        batch_op.add_column(
            sa.Column("amount_original", sa.Numeric(precision=14, scale=2), nullable=True)
        )
        batch_op.add_column(sa.Column("purchase_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("due_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("pot_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_investments_pot_id", ["pot_id"])
        batch_op.create_foreign_key(
            "fk_investments_pot_id", "savings_pots", ["pot_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    with op.batch_alter_table("investments", schema=None) as batch_op:
        batch_op.drop_constraint("fk_investments_pot_id", type_="foreignkey")
        batch_op.drop_index("ix_investments_pot_id")
        batch_op.drop_column("pot_id")
        batch_op.drop_column("due_date")
        batch_op.drop_column("purchase_date")
        batch_op.drop_column("amount_original")
        batch_op.drop_column("rate_type")
        batch_op.drop_column("rate")
    op.drop_table("savings_pots")
