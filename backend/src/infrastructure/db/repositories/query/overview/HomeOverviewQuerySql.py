from __future__ import annotations

from sqlalchemy import bindparam, text


CURRENT_LAYOUT_SQL = text(
    """
    SELECT
        vclv.id::text AS id,
        vclv.home_id::text AS home_id,
        vclv.layout_version,
        vclv.background_asset_id::text AS background_asset_id,
        vclv.effective_at::text AS effective_at,
        pa.file_url AS background_image_url,
        pa.width AS background_image_width,
        pa.height AS background_image_height
    FROM v_current_layout_versions vclv
    LEFT JOIN page_assets pa
      ON pa.id = vclv.background_asset_id
    WHERE vclv.home_id = :home_id
    """
)

HOTSPOTS_SQL = text(
    """
    SELECT
        layout_hotspots.hotspot_id,
        layout_hotspots.device_id::text AS device_id,
        COALESCE(
            lv.layout_meta_json -> 'hotspot_labels' ->> layout_hotspots.hotspot_id,
            d.display_name
        ) AS display_name,
        d.device_type,
        layout_hotspots.x::float8 AS x,
        layout_hotspots.y::float8 AS y,
        layout_hotspots.icon_type,
        layout_hotspots.icon_asset_id::text AS icon_asset_id,
        layout_hotspots.label_mode,
        COALESCE(drs.status, 'UNKNOWN') AS status,
        COALESCE(drs.is_offline, true) AS is_offline,
        d.is_complex_device,
        d.is_readonly_device,
        d.entry_behavior::text AS entry_behavior,
        d.default_control_target,
        COALESCE(drs.status_summary_json, '{}'::jsonb) AS status_summary_json,
        layout_hotspots.display_policy::text AS display_policy
    FROM layout_hotspots
    JOIN layout_versions lv
      ON lv.id = layout_hotspots.layout_version_id
    JOIN devices d
      ON d.id = layout_hotspots.device_id
    LEFT JOIN device_runtime_states drs
      ON drs.device_id = d.id
    WHERE layout_hotspots.layout_version_id = :layout_version_id
      AND layout_hotspots.is_visible = true
    ORDER BY layout_hotspots.structure_order ASC, layout_hotspots.created_at ASC
    """
)

HOMEPAGE_DEVICES_SQL = text(
    """
    SELECT
        d.id::text AS device_id,
        d.room_id::text AS room_id,
        r.room_name,
        d.display_name,
        d.raw_name,
        d.device_type,
        COALESCE(drs.status, 'UNKNOWN') AS status,
        COALESCE(drs.is_offline, true) AS is_offline,
        d.is_complex_device,
        d.is_readonly_device,
        d.confirmation_type::text AS confirmation_type,
        d.entry_behavior::text AS entry_behavior,
        d.default_control_target,
        d.is_homepage_visible,
        d.is_primary_device,
        COALESCE(d.capabilities_json, '{}'::jsonb) AS capabilities_json,
        COALESCE(drs.status_summary_json, '{}'::jsonb) AS status_summary_json
    FROM devices d
    LEFT JOIN rooms r
      ON r.id = d.room_id
    LEFT JOIN device_runtime_states drs
      ON drs.device_id = d.id
    WHERE d.home_id = :home_id
      AND d.is_homepage_visible = true
    ORDER BY d.display_name ASC, d.id ASC
    """
)

CURRENT_SETTINGS_SQL = text(
    """
    SELECT
        id::text AS id,
        settings_version
    FROM v_current_settings_versions
    WHERE home_id = :home_id
    """
)

PAGE_SETTINGS_SQL = text(
    """
    SELECT
        room_label_mode,
        homepage_display_policy_json,
        icon_policy_json,
        layout_preference_json
    FROM page_settings
    WHERE settings_version_id = :settings_version_id
    """
)

FUNCTION_SETTINGS_SQL = text(
    """
    SELECT
        music_enabled,
        low_battery_threshold::float8 AS low_battery_threshold,
        offline_threshold_seconds,
        favorite_limit,
        quick_entry_policy_json,
        auto_home_timeout_seconds,
        position_device_thresholds_json
    FROM function_settings
    WHERE settings_version_id = :settings_version_id
    """
)

FAVORITES_SQL = text(
    """
    SELECT
        device_id::text AS device_id,
        selected,
        favorite_order
    FROM favorite_devices
    WHERE settings_version_id = :settings_version_id
    ORDER BY favorite_order ASC NULLS LAST, created_at ASC
    """
)

FAVORITE_DEVICE_ROWS_SQL = text(
    """
    SELECT
        d.id::text AS device_id,
        d.room_id::text AS room_id,
        r.room_name,
        d.display_name,
        d.raw_name,
        d.device_type,
        COALESCE(drs.status, 'UNKNOWN') AS status,
        COALESCE(drs.is_offline, true) AS is_offline,
        d.is_complex_device,
        d.is_readonly_device,
        d.confirmation_type::text AS confirmation_type,
        d.entry_behavior::text AS entry_behavior,
        d.default_control_target,
        d.is_homepage_visible,
        d.is_primary_device,
        COALESCE(d.capabilities_json, '{}'::jsonb) AS capabilities_json,
        COALESCE(drs.status_summary_json, '{}'::jsonb) AS status_summary_json
    FROM devices d
    LEFT JOIN rooms r
      ON r.id = d.room_id
    LEFT JOIN device_runtime_states drs
      ON drs.device_id = d.id
    WHERE d.home_id = :home_id
      AND d.id::text IN :favorite_device_ids
    """
).bindparams(bindparam("favorite_device_ids", expanding=True))

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

ENERGY_SUMMARY_SQL = text(
    """
    SELECT
        binding_status::text AS binding_status,
        refresh_status::text AS refresh_status,
        yesterday_usage,
        monthly_usage,
        yearly_usage,
        balance,
        created_at::text AS updated_at,
        source_updated_at::text AS source_updated_at
    FROM energy_snapshots
    WHERE home_id = :home_id
    ORDER BY created_at DESC
    LIMIT 1
    """
)

MEDIA_BINDING_SQL = text(
    """
    SELECT
        mb.binding_status::text AS binding_status,
        mb.device_id::text AS device_id,
        d.display_name,
        d.entry_behavior::text AS entry_behavior,
        drs.is_offline,
        drs.runtime_state_json
    FROM media_bindings mb
    LEFT JOIN devices d
      ON d.id = mb.device_id
    LEFT JOIN device_runtime_states drs
      ON drs.device_id = mb.device_id
    WHERE mb.home_id = :home_id
    """
)

SYSTEM_CONNECTION_SQL = text(
    """
    SELECT
        system_type::text AS system_type,
        connection_status::text AS connection_status,
        auth_configured,
        last_test_at::text AS last_test_at,
        last_sync_at::text AS last_sync_at
    FROM system_connections
    WHERE home_id = :home_id
    ORDER BY updated_at DESC
    LIMIT 1
    """
)
