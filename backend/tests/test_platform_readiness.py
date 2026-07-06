from __future__ import annotations

import pytest
from django.test import Client


@pytest.mark.django_db
def test_liveness_readiness_and_security_headers() -> None:
    client = Client()

    liveness_response = client.get("/api/v1/liveness/")
    assert liveness_response.status_code == 200
    assert liveness_response.json()["data"]["status"] == "ok"

    readiness_response = client.get("/api/v1/readiness/")
    assert readiness_response.status_code == 200
    assert readiness_response.json()["data"]["status"] in {"ok", "degraded"}

    assert readiness_response["X-Content-Type-Options"] == "nosniff"
    assert readiness_response["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert readiness_response["Permissions-Policy"] == "geolocation=(), microphone=(), camera=()"
