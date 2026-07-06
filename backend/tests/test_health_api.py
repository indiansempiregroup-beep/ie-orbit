import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_health_endpoint_returns_api_envelope(client):
    response = client.get(reverse("health"))

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["service"] == "ie-platform-api"
    assert payload["data"]["version"] == "v1"
    assert "components" in payload["data"]
    assert "timestamp" in payload["meta"]
