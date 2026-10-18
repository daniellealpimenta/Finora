"""investments and card bill dates

Revision ID: 266eea7a9f25
Revises: e55d4eac40d2
Create Date: 2026-10-17 18:06:24.541773

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "266eea7a9f25"
down_revision: Union[str, Sequence[str], None] = "e55d4eac40d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "investments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("connection_id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("subtype", sa.String(length=64), nullable=True),
        sa.Column("balance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=True),
        sa.Column("goal_amount", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["connection_id"], ["connections.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id", name="uq_investments_external_id"),
    )
    op.create_index("ix_investments_connection_id", "investments", ["connection_id"])

    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("bill_due_date", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("bill_close_date", sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.drop_column("bill_close_date")
        batch_op.drop_column("bill_due_date")
    op.drop_index("ix_investments_connection_id", table_name="investments")
    op.drop_table("investments")
