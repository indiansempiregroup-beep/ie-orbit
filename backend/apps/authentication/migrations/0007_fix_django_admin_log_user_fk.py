from __future__ import annotations

from django.db import migrations


class Migration(migrations.Migration):
    """Align django_admin_log.user_id with the UUID users PK.

    Older environments created django_admin_log against Django's default
    integer auth_user table. AUTH_USER_MODEL is now authentication.User
    (UUID PK on table ``users``), which breaks /admin/ recent-actions joins.
    """

    dependencies = [
        ("admin", "0003_logentry_add_action_flag_choices"),
        ("authentication", "0006_align_manager_staff_permissions"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                TRUNCATE TABLE django_admin_log;
                ALTER TABLE django_admin_log
                    DROP CONSTRAINT IF EXISTS django_admin_log_user_id_c564eba6_fk_auth_user_id;
                ALTER TABLE django_admin_log
                    ALTER COLUMN user_id TYPE uuid
                    USING NULL::uuid;
                ALTER TABLE django_admin_log
                    ADD CONSTRAINT django_admin_log_user_id_fk_users
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
