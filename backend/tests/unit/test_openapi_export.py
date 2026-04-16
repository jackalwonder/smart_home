from __future__ import annotations

import json

from scripts.export_openapi import export_openapi


def test_export_openapi_writes_parseable_json(tmp_path):
    output_path = tmp_path / "openapi.json"

    exported = export_openapi(output_path)

    assert exported == output_path
    assert output_path.exists()
    parsed = json.loads(output_path.read_text(encoding="utf-8"))
    assert parsed["openapi"].startswith("3.")
    assert "BearerAuth" in parsed["components"]["securitySchemes"]
