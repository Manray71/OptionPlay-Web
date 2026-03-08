"""Test health endpoint."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))


def test_health_returns_200(client):
    response = client.get("/health")
    assert response.status_code == 200
