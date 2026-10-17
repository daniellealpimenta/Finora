"""sync fields and category keys

Revision ID: e55d4eac40d2
Revises: eab6fc5056d1
Create Date: 2026-10-17 02:31:48.365676

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e55d4eac40d2'
down_revision: Union[str, Sequence[str], None] = 'eab6fc5056d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("categories", schema=None) as batch_op:
        batch_op.add_column(sa.Column("key", sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint("uq_categories_key", ["key"])

    # A tabela connections ainda não tinha dados (o sync não existia), então a troca
    # de external_id_enc por external_id não perde nada.
    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.add_column(sa.Column("external_id", sa.String(length=64), nullable=False))
        batch_op.add_column(sa.Column("institution_logo_url", sa.String(length=512), nullable=True))
        batch_op.add_column(sa.Column("last_sync_error", sa.String(length=1024), nullable=True))
        batch_op.create_unique_constraint("uq_connections_external_id", ["external_id"])
        batch_op.drop_column("external_id_enc")

    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("provider_category_id", sa.String(length=16), nullable=True))
        batch_op.add_column(
            sa.Column(
                "status",
                sa.Enum("POSTED", "PENDING", name="transactionstatus", native_enum=False, length=16),
                nullable=False,
                server_default="POSTED",
            )
        )
        batch_op.add_column(
            sa.Column("user_categorized", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("transactions", schema=None) as batch_op:
        batch_op.drop_column("user_categorized")
        batch_op.drop_column("status")
        batch_op.drop_column("provider_category_id")

    with op.batch_alter_table("connections", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("external_id_enc", sa.VARCHAR(length=512), nullable=False, server_default="")
        )
        batch_op.drop_constraint("uq_connections_external_id", type_="unique")
        batch_op.drop_column("last_sync_error")
        batch_op.drop_column("institution_logo_url")
        batch_op.drop_column("external_id")

    with op.batch_alter_table("categories", schema=None) as batch_op:
        batch_op.drop_constraint("uq_categories_key", type_="unique")
        batch_op.drop_column("key")
