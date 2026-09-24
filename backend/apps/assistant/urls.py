from django.urls import path

from apps.assistant.api.views import (
    AssistantAccessView,
    AssistantProposedActionCancelView,
    AssistantProposedActionConfirmView,
    AssistantThreadDetailView,
    AssistantThreadListCreateView,
    AssistantThreadMessageView,
    AssistantUsageView,
    AssistantWalletHistoryView,
    AssistantWalletTopUpView,
    AssistantWalletView,
)

urlpatterns = [
    path("assistant/access", AssistantAccessView.as_view(), name="assistant-access"),
    path("assistant/usage", AssistantUsageView.as_view(), name="assistant-usage"),
    path("assistant/wallet", AssistantWalletView.as_view(), name="assistant-wallet"),
    path("assistant/wallet/top-up", AssistantWalletTopUpView.as_view(), name="assistant-wallet-top-up"),
    path(
        "assistant/wallet/history",
        AssistantWalletHistoryView.as_view(),
        name="assistant-wallet-history",
    ),
    path("assistant/threads", AssistantThreadListCreateView.as_view(), name="assistant-threads"),
    path(
        "assistant/threads/<uuid:thread_id>",
        AssistantThreadDetailView.as_view(),
        name="assistant-thread-detail",
    ),
    path(
        "assistant/threads/<uuid:thread_id>/messages",
        AssistantThreadMessageView.as_view(),
        name="assistant-thread-messages",
    ),
    path(
        "assistant/proposed-actions/<uuid:action_id>/confirm",
        AssistantProposedActionConfirmView.as_view(),
        name="assistant-action-confirm",
    ),
    path(
        "assistant/proposed-actions/<uuid:action_id>/cancel",
        AssistantProposedActionCancelView.as_view(),
        name="assistant-action-cancel",
    ),
]
