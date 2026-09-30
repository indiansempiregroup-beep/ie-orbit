from django.apps import AppConfig


class WorkflowConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.workflow"
    verbose_name = "Automations"

    def ready(self) -> None:
        # Register built-in handlers.
        from apps.workflow.services import handlers  # noqa: F401
