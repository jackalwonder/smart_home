# Deploy Runtime Data

This directory is used by Docker Compose for local runtime data and integration
configuration. Do not place real secrets in tracked files.

Use the `*.example` files as templates, then create local `.env` files outside
version control or inject secrets with a secret manager.

Tracked files in this directory are limited to documentation and non-secret
templates. Runtime data such as Home Assistant databases, logs, SGCC cache
files, QR code images, and real `.env` files must remain ignored.

Before sharing a workspace or creating a release artifact, run:

```bash
python scripts/check_plaintext_secrets.py
git status --ignored deploy
```
