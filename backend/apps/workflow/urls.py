from django.urls import path

from apps.workflow.api.views import (
    WorkflowAccessView,
    WorkflowActivateDraftView,
    WorkflowActivateView,
    WorkflowDefinitionDetailView,
    WorkflowDefinitionListCreateView,
    WorkflowDraftFromPromptView,
    WorkflowPauseView,
    WorkflowPreviewView,
    WorkflowRunListView,
)

urlpatterns = [
    path("workflow/access", WorkflowAccessView.as_view(), name="workflow-access"),
    path("workflow/definitions", WorkflowDefinitionListCreateView.as_view(), name="workflow-definitions"),
    path(
        "workflow/definitions/<uuid:definition_id>",
        WorkflowDefinitionDetailView.as_view(),
        name="workflow-definition-detail",
    ),
    path(
        "workflow/definitions/<uuid:definition_id>/activate",
        WorkflowActivateView.as_view(),
        name="workflow-activate",
    ),
    path(
        "workflow/definitions/<uuid:definition_id>/pause",
        WorkflowPauseView.as_view(),
        name="workflow-pause",
    ),
    path(
        "workflow/draft-from-prompt",
        WorkflowDraftFromPromptView.as_view(),
        name="workflow-draft-from-prompt",
    ),
    path(
        "workflow/activate-draft",
        WorkflowActivateDraftView.as_view(),
        name="workflow-activate-draft",
    ),
    path("workflow/preview", WorkflowPreviewView.as_view(), name="workflow-preview"),
    path("workflow/runs", WorkflowRunListView.as_view(), name="workflow-runs"),
]
