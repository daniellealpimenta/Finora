"""credit card details and closed bills

Revision ID: b3c9d1e2f4a5
Revises: a72e86347bd8
Create Date: 2026-10-17 23:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c9d1e2f4a5'
down_revision: Union[str, Sequence[str], None] = 'a72e86347bd8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.add_column(sa.Column("card_brand", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("card_level", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("card_number", sa.String(length=8), nullable=True))
        batch_op.add_column(
            sa.Column("available_credit_limit", sa.Numeric(precision=14, scale=2), nullable=True)
        )
        batch_op.add_column(
            sa.Column("installments_limit_used", sa.Numeric(precision=14, scale=2), nullable=True)
        )
    op.create_table(
        "card_bills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("minimum_payment", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
    )
    with op.batch_alter_table("card_bills", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_card_bills_account_id"), ["account_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("card_bills", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_card_bills_account_id"))
    op.drop_table("card_bills")
    with op.batch_alter_table("accounts", schema=None) as batch_op:
        batch_op.drop_column("installments_limit_used")
        batch_op.drop_column("available_credit_limit")
        batch_op.drop_column("card_number")
        batch_op.drop_column("card_level")
        batch_op.drop_column("card_brand")
