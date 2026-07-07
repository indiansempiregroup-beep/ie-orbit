from django.urls import path

from apps.analytics.api.views import AnalyticsViewSet, BIViewSet, DashboardViewSet

analytics_summary = AnalyticsViewSet.as_view({"get": "summary"})
analytics_list = AnalyticsViewSet.as_view({"get": "list"})
dashboard_summary = DashboardViewSet.as_view({"get": "summary"})
bi_overview = BIViewSet.as_view({"get": "overview"})
bi_revenue = BIViewSet.as_view({"get": "revenue"})
bi_trends = BIViewSet.as_view({"get": "trends"})
bi_forecast = BIViewSet.as_view({"get": "forecast"})
bi_reports = BIViewSet.as_view({"get": "reports"})

urlpatterns = [
    path("analytics/summary", analytics_summary, name="analytics-summary"),
    path("analytics", analytics_list, name="analytics-list"),
    path("dashboard/summary", dashboard_summary, name="dashboard-summary"),
    path("bi/overview", bi_overview, name="bi-overview"),
    path("bi/revenue", bi_revenue, name="bi-revenue"),
    path("bi/trends", bi_trends, name="bi-trends"),
    path("bi/forecast", bi_forecast, name="bi-forecast"),
    path("bi/reports", bi_reports, name="bi-reports"),
]
