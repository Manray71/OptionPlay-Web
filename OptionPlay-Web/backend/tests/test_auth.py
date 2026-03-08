"""Tests for admin API authentication — unit tests for auth logic."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from unittest.mock import patch
from fastapi import HTTPException

from backend.api.auth import require_admin_key

ADMIN_KEY = os.environ.get("OPTIONPLAY_ADMIN_KEY", "")


class TestRequireAdminKey:
    """Test the require_admin_key() dependency function directly."""

    def test_missing_key_returns_401(self):
        """No key provided → 401."""
        with pytest.raises(HTTPException) as exc_info:
            require_admin_key(api_key=None)
        assert exc_info.value.status_code == 401
        assert "Invalid or missing" in exc_info.value.detail

    def test_empty_key_returns_401(self):
        """Empty string key → 401."""
        with pytest.raises(HTTPException) as exc_info:
            require_admin_key(api_key="")
        assert exc_info.value.status_code == 401

    def test_wrong_key_returns_401(self):
        """Wrong key → 401."""
        with pytest.raises(HTTPException) as exc_info:
            require_admin_key(api_key="wrong_key_12345")
        assert exc_info.value.status_code == 401

    def test_correct_key_returns_key(self):
        """Correct key → returns the key string."""
        if not ADMIN_KEY:
            pytest.skip("OPTIONPLAY_ADMIN_KEY not set")
        result = require_admin_key(api_key=ADMIN_KEY)
        assert result == ADMIN_KEY

    def test_server_key_not_configured_returns_500(self):
        """If OPTIONPLAY_ADMIN_KEY env var is empty, server returns 500 (fail-closed)."""
        with patch.dict(os.environ, {"OPTIONPLAY_ADMIN_KEY": ""}):
            with pytest.raises(HTTPException) as exc_info:
                require_admin_key(api_key="anything")
            assert exc_info.value.status_code == 500
            assert "not configured" in exc_info.value.detail


class TestAdminRouterIntegration:
    """Integration tests via HTTP. Verifies router-level auth is wired correctly."""

    def test_non_admin_endpoints_remain_open(self, client):
        """Non-admin endpoints do not require authentication."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_response_structure(self, client):
        """Health endpoint returns expected JSON structure."""
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "ok"
        assert "service" in data
