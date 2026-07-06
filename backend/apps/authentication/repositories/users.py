from __future__ import annotations

from apps.authentication.models import User


class UserRepository:
    def get_by_email(self, email: str) -> User | None:
        normalized_email = User.objects.normalize_email(email).lower()
        return User.all_objects.filter(email=normalized_email).first()

    def get_active_by_email(self, email: str) -> User | None:
        normalized_email = User.objects.normalize_email(email).lower()
        return User.objects.filter(email=normalized_email).first()
