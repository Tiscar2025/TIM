"""Add UserLoginCode

Revision ID: 417094192806
Revises: 6d83c36a6658
Create Date: 2024-02-13 09:40:18.724940

"""

# revision identifiers, used by Alembic.
revision = "417094192806"
down_revision = "6d83c36a6658"

from alembic import op
import sqlalchemy as sa


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "userlogincode",
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("active_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active_to", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("session_code", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["useraccount.id"],
        ),
        sa.PrimaryKeyConstraint("code"),
    )
    with op.batch_alter_table("userlogincode", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_userlogincode_session_code"), ["session_code"], unique=True
        )

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table("userlogincode", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_userlogincode_session_code"))

    op.drop_table("userlogincode")
    # ### end Alembic commands ###
