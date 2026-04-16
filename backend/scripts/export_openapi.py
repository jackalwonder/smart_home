from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.main import create_app


def export_openapi(output_path: Path) -> Path:
    app = create_app()
    schema = app.openapi()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return output_path


if __name__ == "__main__":
    default_output = Path(__file__).resolve().parents[1] / "openapi.json"
    destination = export_openapi(default_output)
    print(destination)
