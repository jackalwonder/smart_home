from __future__ import annotations

from typing import Any

from sqlalchemy import bindparam, text


SETTINGS_ID_SQL = text(
    """
    SELECT id::text AS id
    FROM v_current_settings_versions
    WHERE home_id = :home_id
    """
)

FAVORITE_ROWS_SQL = text(
    """
    SELECT
        device_id::text AS device_id,
        selected,
        favorite_order
    FROM favorite_devices
    WHERE settings_version_id = :settings_version_id
    """
)

MEDIA_DEVICE_ID_SQL = text(
    """
    SELECT device_id::text AS device_id
    FROM media_bindings
    WHERE home_id = :home_id
      AND binding_status = 'MEDIA_SET'
    """
)

ACTIVE_BADGES_SQL = text(
    """
    SELECT
        device_id::text AS device_id,
        code,
        level,
        text
    FROM device_alert_badges
    WHERE is_active = true
      AND device_id IN :device_ids
    ORDER BY created_at ASC
    """
).bindparams(bindparam("device_ids", expanding=True))

ROOMS_WITH_COUNTS_SQL = text(
    """
    SELECT
        r.id::text AS room_id,
        r.room_name,
        r.priority,
        r.visible_in_editor,
        COUNT(d.id)::int AS device_count,
        COUNT(*) FILTER (WHERE d.is_homepage_visible = true)::int AS homepage_device_count
    FROM rooms r
    LEFT JOIN devices d
      ON d.room_id = r.id
    WHERE r.home_id = :home_id
    GROUP BY r.id, r.room_name, r.priority, r.visible_in_editor, r.sort_order, r.created_at
    ORDER BY r.priority DESC, r.room_name ASC, r.created_at ASC
    """
)

ROOMS_SQL = text(
    """
    SELECT
        r.id::text AS room_id,
        r.room_name,
        r.priority,
        r.visible_in_editor,
        0::int AS device_count,
        0::int AS homepage_device_count
    FROM rooms r
    WHERE r.home_id = :home_id
    ORDER BY r.priority DESC, r.room_name ASC, r.created_at ASC
    """
)

DETAIL_SQL = text(
    """
    SELECT
        d.id::text AS device_id,
        d.display_name,
        d.raw_name,
        d.device_type,
        d.room_id::text AS room_id,
        r.room_name,
        COALESCE(drs.status, 'UNKNOWN') AS status,
        COALESCE(drs.is_offline, true) AS is_offline,
        d.is_complex_device,
        d.is_readonly_device,
        d.confirmation_type::text AS confirmation_type,
        d.entry_behavior::text AS entry_behavior,
        d.default_control_target,
        d.capabilities_json,
        d.source_meta_json,
        drs.status_summary_json,
        drs.runtime_state_json,
        drs.aggregated_state,
        drs.aggregated_mode,
        drs.aggregated_position::float8 AS aggregated_position,
        drs.last_state_update_at::text AS last_state_update_at
    FROM devices d
    LEFT JOIN rooms r
      ON r.id = d.room_id
    LEFT JOIN device_runtime_states drs
      ON drs.device_id = d.id
    WHERE d.home_id = :home_id
      AND d.id = :device_id
    """
)

DETAIL_BADGES_SQL = text(
    """
    SELECT code, level, text
    FROM device_alert_badges
    WHERE device_id = :device_id
      AND is_active = true
    ORDER BY created_at ASC
    """
)

CONTROL_SCHEMA_SQL = text(
    """
    SELECT
        action_type,
        target_scope,
        target_key,
        value_type,
        value_range_json,
        allowed_values_json,
        unit,
        is_quick_action,
        requires_detail_entry
    FROM device_control_schemas
    WHERE device_id = :device_id
    ORDER BY sort_order ASC, created_at ASC
    """
)

ENTITY_LINKS_SQL = text(
    """
    SELECT
        he.id::text AS ha_entity_row_id,
        he.entity_id,
        he.platform,
        he.domain,
        he.raw_name,
        he.state,
        he.room_hint,
        he.is_available,
        he.last_synced_at::text AS last_synced_at,
        he.last_state_changed_at::text AS last_state_changed_at,
        del.entity_role::text AS entity_role,
        del.is_primary,
        del.sort_order
    FROM device_entity_links del
    JOIN ha_entities he
      ON he.id = del.ha_entity_id
    WHERE del.home_id = :home_id
      AND del.device_id = :device_id
    ORDER BY del.sort_order ASC, del.is_primary DESC, he.entity_id ASC
    """
)

EDITOR_HOTSPOTS_SQL = text(
    """
    SELECT
        lh.hotspot_id,
        lh.x::float8 AS x,
        lh.y::float8 AS y,
        lh.icon_type,
        lh.icon_asset_id::text AS icon_asset_id,
        lh.label_mode,
        lh.is_visible,
        lh.structure_order
    FROM v_current_layout_versions clv
    JOIN layout_hotspots lh
      ON lh.layout_version_id = clv.id
    WHERE clv.home_id = :home_id
      AND lh.device_id = :device_id
    ORDER BY lh.structure_order ASC, lh.hotspot_id ASC
    """
)

LOW_BATTERY_THRESHOLD_SQL = text(
    """
    SELECT low_battery_threshold::float8 AS low_battery_threshold
    FROM function_settings
    WHERE settings_version_id = :settings_version_id
    """
)


def build_list_devices_statement(
    *,
    home_id: str,
    room_id: str | None,
    device_type: str | None,
    status: str | None,
    keyword: str | None,
) -> tuple[Any, dict[str, Any]]:
    clauses = ["d.home_id = :home_id"]
    params: dict[str, Any] = {"home_id": home_id}
    if room_id is not None:
        clauses.append("d.room_id = :room_id")
        params["room_id"] = room_id
    if device_type is not None:
        clauses.append("d.device_type = :device_type")
        params["device_type"] = device_type
    if status is not None:
        clauses.append("COALESCE(drs.status, 'UNKNOWN') = :status")
        params["status"] = status
    if keyword is not None:
        clauses.append("(d.display_name ILIKE :keyword OR COALESCE(d.raw_name, '') ILIKE :keyword)")
        params["keyword"] = f"%{keyword}%"

    stmt = text(
        f"""
        SELECT
            d.id::text AS device_id,
            d.display_name,
            d.raw_name,
            d.device_type,
            d.room_id::text AS room_id,
            r.room_name,
            COALESCE(drs.status, 'UNKNOWN') AS status,
            COALESCE(drs.is_offline, true) AS is_offline,
            d.is_complex_device,
            d.is_readonly_device,
            d.confirmation_type::text AS confirmation_type,
            d.entry_behavior::text AS entry_behavior,
            d.default_control_target,
            d.is_homepage_visible,
            d.is_primary_device,
            COALESCE(d.capabilities_json, '{{}}'::jsonb) AS capabilities_json,
            COALESCE(drs.status_summary_json, '{{}}'::jsonb) AS status_summary_json
        FROM devices d
        LEFT JOIN rooms r
          ON r.id = d.room_id
        LEFT JOIN device_runtime_states drs
          ON drs.device_id = d.id
        WHERE {' AND '.join(clauses)}
        ORDER BY d.display_name ASC, d.id ASC
        """
    )
    return stmt, params


def build_panel_devices_statement(
    *,
    home_id: str,
    room_id: str | None,
) -> tuple[Any, dict[str, Any]]:
    params: dict[str, Any] = {"home_id": home_id}
    room_clause = ""
    if room_id is not None:
        params["room_id"] = room_id
        room_clause = "AND d.room_id = :room_id"
    stmt = text(
        f"""
        SELECT
            d.id::text AS device_id,
            d.display_name,
            d.device_type,
            d.room_id::text AS room_id,
            r.room_name,
            COALESCE(drs.status, 'UNKNOWN') AS status,
            COALESCE(drs.is_offline, true) AS is_offline,
            d.is_complex_device,
            d.is_readonly_device,
            d.confirmation_type::text AS confirmation_type,
            d.entry_behavior::text AS entry_behavior,
            d.default_control_target,
            drs.runtime_state_json
        FROM devices d
        LEFT JOIN rooms r
          ON r.id = d.room_id
        LEFT JOIN device_runtime_states drs
          ON drs.device_id = d.id
        WHERE d.home_id = :home_id
        {room_clause}
        ORDER BY d.display_name ASC, d.id ASC
        """
    )
    return stmt, params
