# SGCC Electricity Runtime Configuration

Create a local `.env` file from `.env.example` only on the machine that runs the
sidecar. The local `.env` file must not be committed.

Rotate the SGCC password and Home Assistant token immediately if a real `.env`
file is copied into a shared workspace or exposed in logs.

The sidecar also writes `sgcc_cache.json` and `login_qr_code.png` at runtime.
Those files can contain account/session context and must remain untracked.

`SGCC_KEEPALIVE_ENABLED=true` starts a lightweight keepalive worker after the
sidecar boots. By default it waits 480 seconds, then every 480 seconds it
reuses the live Chromium session to touch the SGCC business page. It skips
while a login or refresh task is running, and it does not generate a new QR
code when SGCC requires login again.
