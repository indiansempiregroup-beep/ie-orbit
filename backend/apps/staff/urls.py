from django.urls import path

from apps.staff.api.views import StaffServiceAssignmentViewSet, StaffSkillViewSet, StaffViewSet

staff_list = StaffViewSet.as_view({"get": "list", "post": "create"})
staff_detail = StaffViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
skill_list = StaffSkillViewSet.as_view({"get": "list", "post": "create"})
assignment_list = StaffServiceAssignmentViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    path("staff", staff_list, name="staff-list-create"),
    path("staff/skills", skill_list, name="staff-skill-list-create"),
    path("staff/assignments", assignment_list, name="staff-assignment-list-create"),
    path("staff/<uuid:pk>", staff_detail, name="staff-detail"),
]
