# Home Assistant Runtime Data

Home Assistant writes runtime configuration, logs, and databases below this
directory when Docker Compose runs locally.

Do not commit generated Home Assistant runtime files or long-lived access
tokens.

If Home Assistant is managed outside this Compose stack, keep its production
configuration in that platform's secret/config store and use this directory only
for local development.
