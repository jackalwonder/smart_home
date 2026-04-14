from __future__ import annotations

import hashlib
import os

import psycopg

HOME_ID = "11111111-1111-1111-1111-111111111111"
TERMINAL_ID = "22222222-2222-2222-2222-222222222222"
SETTINGS_VERSION_ID = "33333333-3333-3333-3333-333333333333"
LAYOUT_VERSION_ID = "44444444-4444-4444-4444-444444444444"
AUTH_CONFIG_ID = "55555555-5555-5555-5555-555555555555"


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://smart_home:smart_home@postgres:5432/smart_home")
    return url.replace("postgresql+psycopg://", "postgresql://")


def _hash_pin(pin: str, salt: str) -> str:
    return hashlib.sha256(f"{pin}:{salt}".encode("utf-8")).hexdigest()


def main() -> None:
    conn = psycopg.connect(_database_url())
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO homes (id, home_code, display_name, timezone, status)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                timezone = EXCLUDED.timezone,
                status = EXCLUDED.status
            """,
            (HOME_ID, "demo-home", "演示家庭", "Asia/Shanghai", "ACTIVE"),
        )

        cur.execute(
            """
            INSERT INTO terminals (id, home_id, terminal_code, terminal_name, terminal_mode)
            VALUES (%s, %s, %s, %s, 'KIOSK')
            ON CONFLICT (id) DO UPDATE
            SET terminal_name = EXCLUDED.terminal_name,
                terminal_mode = EXCLUDED.terminal_mode,
                updated_at = now()
            """,
            (TERMINAL_ID, HOME_ID, "wall-panel-main", "主墙板"),
        )

        cur.execute(
            """
            INSERT INTO home_auth_configs (
                id,
                home_id,
                login_mode,
                pin_hash,
                pin_salt,
                pin_retry_limit,
                pin_lock_minutes,
                pin_session_ttl_seconds
            )
            VALUES (%s, %s, 'FIXED_HOME_ACCOUNT', %s, %s, 5, 5, 600)
            ON CONFLICT (home_id) DO UPDATE
            SET pin_hash = EXCLUDED.pin_hash,
                pin_salt = EXCLUDED.pin_salt,
                pin_retry_limit = EXCLUDED.pin_retry_limit,
                pin_lock_minutes = EXCLUDED.pin_lock_minutes,
                pin_session_ttl_seconds = EXCLUDED.pin_session_ttl_seconds,
                updated_at = now()
            """,
            (AUTH_CONFIG_ID, HOME_ID, _hash_pin("1234", "dev-salt"), "dev-salt"),
        )

        cur.execute(
            """
            INSERT INTO settings_versions (
                id,
                home_id,
                settings_version,
                updated_domains_json,
                effective_at
            )
            VALUES (%s, %s, %s, '[]'::jsonb, now())
            ON CONFLICT (id) DO UPDATE
            SET settings_version = EXCLUDED.settings_version,
                effective_at = EXCLUDED.effective_at
            """,
            (SETTINGS_VERSION_ID, HOME_ID, "settings_v1"),
        )

        cur.execute(
            """
            INSERT INTO page_settings (
                id,
                home_id,
                settings_version_id,
                room_label_mode,
                homepage_display_policy_json,
                icon_policy_json,
                layout_preference_json
            )
            VALUES (
                gen_random_uuid(),
                %s,
                %s,
                %s,
                %s::jsonb,
                %s::jsonb,
                %s::jsonb
            )
            ON CONFLICT (settings_version_id) DO NOTHING
            """,
            (
                HOME_ID,
                SETTINGS_VERSION_ID,
                "EDIT_ONLY",
                "{}",
                "{}",
                "{}",
            ),
        )

        cur.execute(
            """
            INSERT INTO function_settings (
                id,
                home_id,
                settings_version_id,
                low_battery_threshold,
                offline_threshold_seconds,
                quick_entry_policy_json,
                music_enabled,
                favorite_limit,
                auto_home_timeout_seconds,
                position_device_thresholds_json
            )
            VALUES (
                gen_random_uuid(),
                %s,
                %s,
                20,
                90,
                %s::jsonb,
                true,
                8,
                180,
                %s::jsonb
            )
            ON CONFLICT (settings_version_id) DO NOTHING
            """,
            (
                HOME_ID,
                SETTINGS_VERSION_ID,
                '{"favorites": true}',
                '{"closed_max": 5, "opened_min": 95}',
            ),
        )

        cur.execute(
            """
            INSERT INTO layout_versions (
                id,
                home_id,
                layout_version,
                layout_meta_json,
                effective_at,
                published_by_terminal_id
            )
            VALUES (%s, %s, %s, '{}'::jsonb, now(), %s)
            ON CONFLICT (id) DO UPDATE
            SET layout_version = EXCLUDED.layout_version,
                effective_at = EXCLUDED.effective_at,
                published_by_terminal_id = EXCLUDED.published_by_terminal_id
            """,
            (LAYOUT_VERSION_ID, HOME_ID, "layout_v1", TERMINAL_ID),
        )

    conn.close()


if __name__ == "__main__":
    main()
