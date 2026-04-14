# Home Assistant Deployment

This project can run Home Assistant inside the same `docker-compose` stack.

## What is included

- Compose service name: `homeassistant`
- Internal URL used by backend bootstrap: `http://homeassistant:8123`
- Persistent config path: `./deploy/homeassistant/config`

## First-time setup

1. Start the stack.
2. Open `http://localhost:8123`.
3. Complete the Home Assistant onboarding flow.
4. Create a Long-Lived Access Token in your Home Assistant user profile.
5. Put that token into `.env` as `HOME_ASSISTANT_BOOTSTRAP_ACCESS_TOKEN`.
6. Restart the backend container.

## Backend bootstrap behavior

When all of the following are set:

- `HOME_ASSISTANT_BOOTSTRAP_ENABLED=true`
- `HOME_ASSISTANT_BOOTSTRAP_URL=http://homeassistant:8123`
- `HOME_ASSISTANT_BOOTSTRAP_ACCESS_TOKEN=<your token>`

the backend will:

- use the internal Home Assistant service as the default HA target
- allow test, reload, and control calls before a `system_connections` row exists
- materialize a per-home `system_connections` record on first reload or explicit save

## Notes

- The backend still stores HA connection data in encrypted form in PostgreSQL.
- You can overwrite the bootstrap connection later through `/api/v1/system-connections/home-assistant`.
