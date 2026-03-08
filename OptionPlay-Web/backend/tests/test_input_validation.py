"""Tests for input validation (symbol regex, Pydantic validators)."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from fastapi import HTTPException

from backend.api.auth import validate_symbol


# ── validate_symbol() unit tests ──


class TestValidateSymbol:
    """Test the validate_symbol() function directly."""

    def test_valid_simple_symbols(self):
        assert validate_symbol("AAPL") == "AAPL"
        assert validate_symbol("MSFT") == "MSFT"
        assert validate_symbol("A") == "A"
        assert validate_symbol("GOOGL") == "GOOGL"

    def test_valid_with_dot(self):
        assert validate_symbol("BRK.B") == "BRK.B"
        assert validate_symbol("BF.A") == "BF.A"

    def test_valid_with_dash(self):
        assert validate_symbol("BRK-B") == "BRK-B"

    def test_normalizes_lowercase(self):
        assert validate_symbol("aapl") == "AAPL"
        assert validate_symbol("msft") == "MSFT"

    def test_strips_whitespace(self):
        assert validate_symbol("  AAPL  ") == "AAPL"

    def test_rejects_empty(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_symbol("")
        assert exc_info.value.status_code == 400

    def test_rejects_none(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_symbol(None)
        assert exc_info.value.status_code == 400

    def test_rejects_too_long(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_symbol("ABCDEFGHIJKLM")
        assert exc_info.value.status_code == 400

    def test_rejects_sql_injection(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_symbol("'; DROP TABLE")
        assert exc_info.value.status_code == 400

    def test_rejects_code_injection(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_symbol("__import__('os').system('rm -rf /')")
        assert exc_info.value.status_code == 400

    def test_rejects_path_traversal(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_symbol("../../../etc/passwd")
        assert exc_info.value.status_code == 400

    def test_rejects_numbers_only(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_symbol("12345")
        assert exc_info.value.status_code == 400

    def test_rejects_special_chars(self):
        for char in ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", " ", "/"]:
            with pytest.raises(HTTPException):
                validate_symbol(f"AA{char}PL")

    def test_rejects_unicode(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_symbol("AAPL\u0000")
        assert exc_info.value.status_code == 400


# ── Pydantic model validation ──


class TestQuotesRequestValidation:
    """Test QuotesRequest Pydantic validator."""

    def test_valid_symbols_list(self):
        from backend.api.json_routes import QuotesRequest

        req = QuotesRequest(symbols=["AAPL", "msft", "GOOGL"])
        assert req.symbols == ["AAPL", "MSFT", "GOOGL"]

    def test_rejects_invalid_symbol_in_list(self):
        from backend.api.json_routes import QuotesRequest

        with pytest.raises(Exception):
            QuotesRequest(symbols=["AAPL", "'; DROP TABLE", "GOOGL"])

    def test_rejects_too_many_symbols(self):
        from backend.api.json_routes import QuotesRequest

        with pytest.raises(Exception):
            QuotesRequest(symbols=[f"SYM{i}" for i in range(51)])


class TestShadowLogRequestValidation:
    """Test ShadowLogRequest symbol validator."""

    def test_valid_symbol(self):
        from backend.api.json_routes import ShadowLogRequest

        req = ShadowLogRequest(
            symbol="aapl",
            strategy="pullback",
            score=7.5,
            short_strike=150.0,
            long_strike=145.0,
            spread_width=5.0,
            est_credit=0.50,
            expiration="2026-06-19",
            dte=75,
            price_at_log=165.0,
        )
        assert req.symbol == "AAPL"

    def test_rejects_injection(self):
        from backend.api.json_routes import ShadowLogRequest

        with pytest.raises(Exception):
            ShadowLogRequest(
                symbol="'; DROP TABLE trades;--",
                strategy="pullback",
                score=7.5,
                short_strike=150.0,
                long_strike=145.0,
                spread_width=5.0,
                est_credit=0.50,
                expiration="2026-06-19",
                dte=75,
                price_at_log=165.0,
            )
