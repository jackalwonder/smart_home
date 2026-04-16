from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.modules.realtime.RealtimeSchemas import RealtimeContractBundle


def export_realtime_schema(output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            RealtimeContractBundle.model_json_schema(),
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return output_path


def main() -> None:
    output_path = Path(__file__).resolve().parents[1] / "realtime.schema.json"
    exported = export_realtime_schema(output_path)
    print(exported)


if __name__ == "__main__":
    main()
