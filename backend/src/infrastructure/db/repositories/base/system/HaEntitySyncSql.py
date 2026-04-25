from __future__ import annotations

from sqlalchemy import bindparam, text


LOAD_ROOMS_SQL = text(
    """
    SELECT id::text AS id, room_name
    FROM rooms
    WHERE home_id = :home_id
    """
)

ENSURE_ROOM_SQL = text(
    """
    INSERT INTO rooms (
        home_id,
        room_name,
        priority,
        visible_in_editor,
        sort_order,
        created_at,
        updated_at
    ) VALUES (
        :home_id,
        :room_name,
        0,
        true,
        0,
        now(),
        now()
    )
    ON CONFLICT (home_id, room_name) DO UPDATE
    SET updated_at = now()
    RETURNING id::text AS id
    """
)

LOAD_DEVICES_SQL = text(
    """
    SELECT
        id::text AS id,
        source_meta_json ->> 'ha_device_id' AS ha_device_id
    FROM devices
    WHERE home_id = :home_id
    """
)

LOAD_ENTITIES_SQL = text(
    """
    SELECT id::text AS id, entity_id
    FROM ha_entities
    WHERE home_id = :home_id
      AND entity_id IN :entity_ids
    """
).bindparams(bindparam("entity_ids", expanding=True))

UPDATE_DEVICE_SQL = text(
    """
    UPDATE devices
    SET
        room_id = :room_id,
        display_name = :display_name,
        raw_name = :raw_name,
        device_type = :device_type,
        is_complex_device = :is_complex_device,
        is_readonly_device = :is_readonly_device,
        entry_behavior = :entry_behavior,
        default_control_target = :default_control_target,
        is_homepage_visible = true,
        capabilities_json = :capabilities_json,
        source_meta_json = :source_meta_json,
        updated_at = now()
    WHERE id = :device_id
    """
)

INSERT_DEVICE_SQL = text(
    """
    INSERT INTO devices (
        home_id,
        room_id,
        display_name,
        raw_name,
        device_type,
        is_complex_device,
        is_readonly_device,
        confirmation_type,
        entry_behavior,
        default_control_target,
        is_primary_device,
        is_homepage_visible,
        capabilities_json,
        source_meta_json,
        created_at,
        updated_at
    ) VALUES (
        :home_id,
        :room_id,
        :display_name,
        :raw_name,
        :device_type,
        :is_complex_device,
        :is_readonly_device,
        'ACK_DRIVEN',
        :entry_behavior,
        :default_control_target,
        false,
        true,
        :capabilities_json,
        :source_meta_json,
        now(),
        now()
    )
    RETURNING id::text AS id
    """
)

UPSERT_RUNTIME_STATE_SQL = text(
    """
    INSERT INTO device_runtime_states (
        device_id,
        home_id,
        status,
        is_offline,
        status_summary_json,
        runtime_state_json,
        last_state_update_at,
        updated_at
    ) VALUES (
        :device_id,
        :home_id,
        :status,
        :is_offline,
        :status_summary_json,
        :runtime_state_json,
        :last_state_update_at,
        now()
    )
    ON CONFLICT (device_id) DO UPDATE SET
        home_id = EXCLUDED.home_id,
        status = EXCLUDED.status,
        is_offline = EXCLUDED.is_offline,
        status_summary_json = EXCLUDED.status_summary_json,
        runtime_state_json = EXCLUDED.runtime_state_json,
        last_state_update_at = EXCLUDED.last_state_update_at,
        updated_at = now()
    """
)

UPDATE_HA_ENTITY_SQL = text(
    """
    UPDATE ha_entities
    SET
        platform = :platform,
        domain = :domain,
        raw_name = :raw_name,
        state = :state,
        attributes_json = :attributes_json,
        last_synced_at = now(),
        last_state_changed_at = :last_state_changed_at,
        room_hint = :room_hint,
        is_available = :is_available,
        updated_at = now()
    WHERE id = :id
    """
)

UPSERT_HA_ENTITY_SQL = text(
    """
    INSERT INTO ha_entities (
        home_id,
        entity_id,
        platform,
        domain,
        raw_name,
        state,
        attributes_json,
        last_synced_at,
        last_state_changed_at,
        room_hint,
        is_available,
        created_at,
        updated_at
    ) VALUES (
        :home_id,
        :entity_id,
        :platform,
        :domain,
        :raw_name,
        :state,
        :attributes_json,
        now(),
        :last_state_changed_at,
        :room_hint,
        :is_available,
        now(),
        now()
    )
    ON CONFLICT (home_id, entity_id) DO UPDATE SET
        platform = EXCLUDED.platform,
        domain = EXCLUDED.domain,
        raw_name = EXCLUDED.raw_name,
        state = EXCLUDED.state,
        attributes_json = EXCLUDED.attributes_json,
        last_synced_at = now(),
        last_state_changed_at = EXCLUDED.last_state_changed_at,
        room_hint = EXCLUDED.room_hint,
        is_available = EXCLUDED.is_available,
        updated_at = now()
    RETURNING id::text AS id
    """
)

UPSERT_DEVICE_ENTITY_LINK_SQL = text(
    """
    INSERT INTO device_entity_links (
        home_id,
        device_id,
        ha_entity_id,
        entity_role,
        is_primary,
        sort_order,
        created_at,
        updated_at
    ) VALUES (
        :home_id,
        :device_id,
        :ha_entity_id,
        :entity_role,
        :is_primary,
        :sort_order,
        now(),
        now()
    )
    ON CONFLICT (ha_entity_id) DO UPDATE SET
        home_id = EXCLUDED.home_id,
        device_id = EXCLUDED.device_id,
        entity_role = EXCLUDED.entity_role,
        is_primary = EXCLUDED.is_primary,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    """
)

DELETE_STALE_DEVICE_ENTITY_LINKS_SQL = text(
    """
    DELETE FROM device_entity_links
    WHERE device_id = :device_id
      AND ha_entity_id NOT IN :ha_entity_ids
    """
).bindparams(bindparam("ha_entity_ids", expanding=True))

FIND_STATE_CHANGED_ENTITY_SQL = text(
    """
    SELECT
        he.id::text AS ha_entity_id,
        he.state AS current_state,
        he.last_state_changed_at::text AS current_last_state_changed_at,
        del.device_id::text AS device_id
    FROM ha_entities he
    JOIN device_entity_links del ON del.ha_entity_id = he.id
    WHERE he.home_id = :home_id
      AND he.entity_id = :entity_id
    """
)

UPDATE_HA_ENTITY_STATE_SQL = text(
    """
    UPDATE ha_entities
    SET
        state = :state,
        attributes_json = :attributes_json,
        last_synced_at = now(),
        last_state_changed_at = :last_state_changed_at,
        is_available = :is_available,
        updated_at = now()
    WHERE id = :ha_entity_id
    """
)

RUNTIME_ENTITY_LINKS_SQL = text(
    """
    SELECT
        d.id::text AS device_id,
        d.home_id::text AS home_id,
        d.display_name,
        d.device_type,
        he.entity_id,
        he.domain,
        he.state,
        he.attributes_json,
        he.last_state_changed_at::text AS last_state_changed_at,
        del.is_primary,
        del.sort_order
    FROM devices d
    JOIN device_entity_links del ON del.device_id = d.id
    JOIN ha_entities he ON he.id = del.ha_entity_id
    WHERE d.home_id = :home_id
      AND d.id = :device_id
    ORDER BY del.is_primary DESC, del.sort_order ASC, he.entity_id ASC
    """
)
