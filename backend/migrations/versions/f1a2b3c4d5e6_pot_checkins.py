"""pot checkins and investment balance date

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-11-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("investments") as batch:
        batch.add_column(sa.Column("balance_date", sa.Date(), nullable=True))
    op.create_table(
        "pot_checkins",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pot_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("dismissed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["pot_id"], ["savings_pots.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pot_checkins_pot_id", "pot_checkins", ["pot_id"])


def downgrade() -> None:
    op.drop_index("ix_pot_checkins_pot_id", table_name="pot_checkins")
    op.drop_table("pot_checkins")
    with op.batch_alter_table("investments") as batch:
        batch.drop_column("balance_date")
