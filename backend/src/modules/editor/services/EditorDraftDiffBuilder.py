from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EditorDraftDiffItem:
    change_type: str
    label: str
    count: int
    summary: str
    preview: list[str]


class EditorDraftDiffBuilder:
    def extract_hotspot_labels(self, layout_meta: dict[str, Any] | None) -> dict[str, str]:
        source = layout_meta.get("hotspot_labels") if isinstance(layout_meta, dict) else None
        if not isinstance(source, dict):
            return {}
        labels: dict[str, str] = {}
        for hotspot_id, label in source.items():
            if isinstance(hotspot_id, str) and isinstance(label, str) and label.strip():
                labels[hotspot_id] = label.strip()
        return labels

    def normalize_layout_meta(self, layout_meta: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(layout_meta, dict):
            return {}
        return {key: value for key, value in layout_meta.items() if key != "hotspot_labels"}

    def normalize_hotspot(
        self,
        hotspot: dict[str, Any],
        labels: dict[str, str],
        fallback_index: int,
    ) -> dict[str, Any]:
        hotspot_id = str(hotspot.get("hotspot_id") or f"hotspot-{fallback_index}")
        device_id = str(hotspot.get("device_id") or "")
        label = labels.get(hotspot_id) or device_id or hotspot_id
        return {
            "hotspot_id": hotspot_id,
            "device_id": device_id,
            "label": label,
            "x": float(hotspot.get("x") or 0),
            "y": float(hotspot.get("y") or 0),
            "icon_type": hotspot.get("icon_type"),
            "icon_asset_id": hotspot.get("icon_asset_id"),
            "label_mode": hotspot.get("label_mode"),
            "is_visible": bool(hotspot.get("is_visible", True)),
            "structure_order": int(hotspot.get("structure_order", fallback_index) or 0),
        }

    def build_items(
        self,
        *,
        submitted_layout_meta: dict[str, Any],
        submitted_hotspots_raw: list[dict[str, Any]],
        compared_layout_meta: dict[str, Any],
        compared_hotspots_raw: list[dict[str, Any]],
        submitted_background_asset_id: str | None,
        compared_background_asset_id: str | None,
    ) -> list[EditorDraftDiffItem]:
        submitted_labels = self.extract_hotspot_labels(submitted_layout_meta)
        compared_labels = self.extract_hotspot_labels(compared_layout_meta)
        submitted_hotspots = [
            self.normalize_hotspot(hotspot, submitted_labels, index)
            for index, hotspot in enumerate(submitted_hotspots_raw)
        ]
        compared_hotspots = [
            self.normalize_hotspot(hotspot, compared_labels, index)
            for index, hotspot in enumerate(compared_hotspots_raw)
        ]
        submitted_by_id = {hotspot["hotspot_id"]: hotspot for hotspot in submitted_hotspots}
        compared_by_id = {hotspot["hotspot_id"]: hotspot for hotspot in compared_hotspots}

        added = [
            hotspot for hotspot in submitted_hotspots if hotspot["hotspot_id"] not in compared_by_id
        ]
        removed = [
            hotspot for hotspot in compared_hotspots if hotspot["hotspot_id"] not in submitted_by_id
        ]
        moved: list[dict[str, Any]] = []
        relabeled: list[dict[str, Any]] = []
        rebound: list[dict[str, Any]] = []
        restyled: list[dict[str, Any]] = []
        reordered: list[dict[str, Any]] = []

        for hotspot in submitted_hotspots:
            previous = compared_by_id.get(hotspot["hotspot_id"])
            if previous is None:
                continue
            if (
                abs(hotspot["x"] - previous["x"]) > 0.0005
                or abs(hotspot["y"] - previous["y"]) > 0.0005
            ):
                moved.append(hotspot)
            if hotspot["label"] != previous["label"]:
                relabeled.append(hotspot)
            if hotspot["device_id"] != previous["device_id"]:
                rebound.append(hotspot)
            if (
                hotspot["icon_type"] != previous["icon_type"]
                or hotspot["icon_asset_id"] != previous.get("icon_asset_id")
                or hotspot["label_mode"] != previous["label_mode"]
                or hotspot["is_visible"] != previous["is_visible"]
            ):
                restyled.append(hotspot)
            if hotspot["structure_order"] != previous["structure_order"]:
                reordered.append(hotspot)

        items = [
            self._build_diff_item(change_type="added", label="新增热点", hotspots=added),
            self._build_diff_item(change_type="removed", label="移除热点", hotspots=removed),
            self._build_diff_item(change_type="moved", label="位置调整", hotspots=moved),
            self._build_diff_item(change_type="relabeled", label="名称更新", hotspots=relabeled),
            self._build_diff_item(change_type="rebound", label="设备绑定更新", hotspots=rebound),
            self._build_diff_item(change_type="restyled", label="展示样式更新", hotspots=restyled),
            self._build_diff_item(change_type="reordered", label="排序更新", hotspots=reordered),
        ]
        filtered_items = [item for item in items if item is not None]

        if submitted_background_asset_id != compared_background_asset_id:
            filtered_items.append(
                EditorDraftDiffItem(
                    change_type="background",
                    label="背景图更新",
                    count=1,
                    summary="已设置或替换背景图" if submitted_background_asset_id else "已清除背景图",
                    preview=[],
                )
            )

        if self.normalize_layout_meta(submitted_layout_meta) != self.normalize_layout_meta(
            compared_layout_meta
        ):
            filtered_items.append(
                EditorDraftDiffItem(
                    change_type="layout_meta",
                    label="布局元数据更新",
                    count=1,
                    summary="JSON 元数据已修改",
                    preview=[],
                )
            )

        return filtered_items

    def _format_preview_names(self, hotspots: list[dict[str, Any]]) -> list[str]:
        return [str(hotspot["label"]) for hotspot in hotspots[:3]]

    def _build_diff_item(
        self,
        *,
        change_type: str,
        label: str,
        hotspots: list[dict[str, Any]],
    ) -> EditorDraftDiffItem | None:
        if not hotspots:
            return None
        preview = self._format_preview_names(hotspots)
        summary = "、".join(preview)
        if len(hotspots) > 3:
            summary = f"{summary} 等 {len(hotspots)} 个"
        return EditorDraftDiffItem(
            change_type=change_type,
            label=label,
            count=len(hotspots),
            summary=summary,
            preview=preview,
        )
