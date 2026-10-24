"""wishlist (groups, items, price history)

Revision ID: f6a2b4c8d1e3
Revises: d5e1f3a4b8c9
Create Date: 2026-10-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6a2b4c8d1e3'
down_revision: Union[str, Sequence[str], None] = 'd5e1f3a4b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "wish_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("pot_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["pot_id"], ["savings_pots.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "wish_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=True),
        sa.Column("price", sa.Numeric(14, 2), nullable=False),
        sa.Column("store", sa.String(length=100), nullable=True),
        sa.Column("image_url", sa.String(length=2048), nullable=True),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("target_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("bought_at", sa.Date(), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["group_id"], ["wish_groups.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wish_items_group_id", "wish_items", ["group_id"])
    op.create_table(
        "wish_prices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(14, 2), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["wish_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wish_prices_item_id", "wish_prices", ["item_id"])


def downgrade() -> None:
    op.drop_index("ix_wish_prices_item_id", table_name="wish_prices")
    op.drop_table("wish_prices")
    op.drop_index("ix_wish_items_group_id", table_name="wish_items")
    op.drop_table("wish_items")
    op.drop_table("wish_groups")
