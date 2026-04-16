from __future__ import annotations

import json

from scripts.export_realtime_schema import export_realtime_schema


def test_export_realtime_schema_writes_parseable_json(tmp_path):
    output_path = tmp_path / "realtime.schema.json"

    exported = export_realtime_schema(output_path)

    assert exported == output_path
    assert output_path.exists()
    parsed = json.loads(output_path.read_text(encoding="utf-8"))
    assert parsed["title"] == "RealtimeContractBundle"
    assert parsed["properties"]["server_event"]["title"] == "Server Event"
    assert "$defs" in parsed
