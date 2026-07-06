from django.urls import path

from apps.analytics.api.views import AnalyticsViewSet, DashboardViewSet

analytics_summary = AnalyticsViewSet.as_view({"get": "summary"})
analytics_list = AnalyticsViewSet.as_view({"get": "list"})
dashboard_summary = DashboardViewSet.as_view({"get": "summary"})

urlpatterns = [
    path("analytics/summary", analytics_summary, name="analytics-summary"),
    path("analytics", analytics_list, name="analytics-list"),
    path("dashboard/summary", dashboard_summary, name="dashboard-summary"),
]
