from __future__ import annotations

import pytest
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.mark.django_db
def test_contact_form_sends_email(api_client: APIClient) -> None:
    response = api_client.post(
        reverse("contact-form"),
        {
            "name": "Asha Patel",
            "email": "asha@example.com",
            "message": "I'd like a demo of IE Orbit for my grooming salon.",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["data"]["submitted"] is True
    assert len(mail.outbox) == 1
    message = mail.outbox[0]
    assert message.subject == "IE Orbit contact form: Asha Patel"
    assert "asha@example.com" in message.body
    assert "grooming salon" in message.body
    assert message.reply_to == ["asha@example.com"]


@pytest.mark.django_db
def test_contact_form_honeypot_is_silent(api_client: APIClient) -> None:
    response = api_client.post(
        reverse("contact-form"),
        {
            "name": "Bot",
            "email": "bot@example.com",
            "message": "Spam",
            "website": "https://spam.example",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["data"]["submitted"] is True
    assert len(mail.outbox) == 0


@pytest.mark.django_db
def test_contact_form_requires_fields(api_client: APIClient) -> None:
    response = api_client.post(reverse("contact-form"), {}, format="json")

    assert response.status_code == 422
