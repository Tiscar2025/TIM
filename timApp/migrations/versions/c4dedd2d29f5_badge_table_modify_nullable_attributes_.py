"""Badge table: modify nullable attributes, add relationship to group and add columns restored_by and restored

Revision ID: c4dedd2d29f5
Revises: 04901bdb0c13
Create Date: 2025-03-04 15:01:02.854369

"""

# revision identifiers, used by Alembic.
revision = 'c4dedd2d29f5'
down_revision = '04901bdb0c13'

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('badge', schema=None) as batch_op:
        batch_op.add_column(sa.Column('restored_by', sa.Integer(), nullable=False))
        batch_op.add_column(sa.Column('restored', sa.Boolean(), nullable=True))
        batch_op.alter_column('modified',
               existing_type=postgresql.TIMESTAMP(),
               nullable=True)
        batch_op.alter_column('deleted',
               existing_type=sa.BOOLEAN(),
               nullable=True)
        batch_op.create_foreign_key(None, 'usergroup', ['restored_by'], ['id'])

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('badge', schema=None) as batch_op:
        batch_op.drop_constraint(None, type_='foreignkey')
        batch_op.alter_column('deleted',
               existing_type=sa.BOOLEAN(),
               nullable=False)
        batch_op.alter_column('modified',
               existing_type=postgresql.TIMESTAMP(),
               nullable=False)
        batch_op.drop_column('restored')
        batch_op.drop_column('restored_by')

    # ### end Alembic commands ###
