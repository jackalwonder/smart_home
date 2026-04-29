# Deploy Runtime Data

This directory is used by Docker Compose for local runtime data and integration
configuration. Do not place real secrets in tracked files.

Use the `*.example` files as templates, then create local `.env` files outside
version control or inject secrets with a secret manager.

Tracked files in this directory are limited to documentation and non-secret
templates. Runtime data such as Home Assistant databases, logs, SGCC cache
files, QR code images, and real `.env` files must remain ignored.

Docker Compose defines default `mem_limit` and `cpus` values for every service.
When deploying to a platform that ignores these Compose fields, configure the
same CPU and memory ceilings in that platform's deployment settings.

The frontend container serves HTTP behind the real edge. Keep HSTS at the
actual HTTPS/TLS termination layer. The bundled Nginx config emits an enforced
minimal CSP for the SPA, same-origin API/WebSocket traffic, data URL QR codes,
and blob URL runtime images.

Example HSTS header for the real HTTPS edge after certificate and redirect
behavior are verified:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

Before sharing a workspace or creating a release artifact, run:

```bash
python scripts/check_plaintext_secrets.py
git status --ignored deploy
```
