from __future__ import annotations

from src.modules.editor.services.EditorDraftDiffBuilder import EditorDraftDiffBuilder


def test_editor_draft_diff_builder_detects_hotspot_changes_and_ignores_label_meta():
    builder = EditorDraftDiffBuilder()

    items = builder.build_items(
        submitted_layout_meta={
            "scale": 1,
            "hotspot_labels": {"hotspot-1": "Kitchen Light"},
        },
        submitted_hotspots_raw=[
            {
                "hotspot_id": "hotspot-1",
                "device_id": "device-light-new",
                "x": 0.2,
                "y": 0.3,
                "icon_type": "light",
                "label_mode": "ALWAYS",
                "is_visible": True,
                "structure_order": 2,
            }
        ],
        compared_layout_meta={
            "scale": 1,
            "hotspot_labels": {"hotspot-1": "Old Light"},
        },
        compared_hotspots_raw=[
            {
                "hotspot_id": "hotspot-1",
                "device_id": "device-light-old",
                "x": 0.1,
                "y": 0.3,
                "icon_type": "switch",
                "label_mode": "EDIT_ONLY",
                "is_visible": True,
                "structure_order": 1,
            }
        ],
        submitted_background_asset_id=None,
        compared_background_asset_id=None,
    )

    assert [item.change_type for item in items] == [
        "moved",
        "relabeled",
        "rebound",
        "restyled",
        "reordered",
    ]


def test_editor_draft_diff_builder_reports_background_and_layout_meta_changes():
    builder = EditorDraftDiffBuilder()

    items = builder.build_items(
        submitted_layout_meta={"scale": 2},
        submitted_hotspots_raw=[],
        compared_layout_meta={"scale": 1},
        compared_hotspots_raw=[],
        submitted_background_asset_id="asset-1",
        compared_background_asset_id=None,
    )

    assert [item.change_type for item in items] == ["background", "layout_meta"]
