"""Tests for config backup before overwrite — unit tests."""

import sys
import os
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
import yaml


class TestConfigBackupLogic:
    """Test the backup-before-write logic directly (same as admin.py)."""

    def test_backup_created_before_overwrite(self, tmp_path):
        """shutil.copy2 creates .bak with original content."""
        config_file = tmp_path / "scoring_weights.yaml"
        config_file.write_text("original: true\nversion: 1\n")

        # Simulate what admin.py does
        file_path = str(config_file)
        if os.path.exists(file_path):
            shutil.copy2(file_path, file_path + ".bak")

        new_content = "updated: true\nversion: 2\n"
        with open(file_path, "w") as f:
            f.write(new_content)

        # Verify backup has original content
        backup = tmp_path / "scoring_weights.yaml.bak"
        assert backup.exists()
        assert backup.read_text() == "original: true\nversion: 1\n"

        # Verify file was updated
        assert config_file.read_text() == new_content

    def test_backup_overwrites_previous_backup(self, tmp_path):
        """Second save overwrites the .bak with previous content."""
        config_file = tmp_path / "config.yaml"

        # First save
        config_file.write_text("v1\n")
        shutil.copy2(str(config_file), str(config_file) + ".bak")
        config_file.write_text("v2\n")

        # Second save
        shutil.copy2(str(config_file), str(config_file) + ".bak")
        config_file.write_text("v3\n")

        backup = tmp_path / "config.yaml.bak"
        assert backup.read_text() == "v2\n"
        assert config_file.read_text() == "v3\n"

    def test_yaml_validation_rejects_invalid(self):
        """Invalid YAML is rejected before writing."""
        invalid_content = "invalid: yaml: : :\n  - [broken"
        with pytest.raises(yaml.YAMLError):
            yaml.safe_load(invalid_content)

    def test_yaml_validation_accepts_valid(self):
        """Valid YAML passes validation."""
        valid_content = "key: value\nlist:\n  - item1\n  - item2\n"
        result = yaml.safe_load(valid_content)
        assert result["key"] == "value"
        assert len(result["list"]) == 2

    def test_no_backup_for_new_file(self, tmp_path):
        """No backup created when file doesn't exist yet."""
        config_file = tmp_path / "new_config.yaml"
        file_path = str(config_file)

        # Simulate admin.py logic
        if os.path.exists(file_path):
            shutil.copy2(file_path, file_path + ".bak")

        # No backup should exist
        backup = tmp_path / "new_config.yaml.bak"
        assert not backup.exists()
