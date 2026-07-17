# Flows — flow-as-code

Versioned exports of production ChatbotX flows, managed via the `chatbotx` CLI.

- Export:  `chatbotx flows export <id> --file flows/<name>.json`
- Apply (upsert-by-name, idempotent): `chatbotx flows apply --file flows/<name>.json`
  - matches an existing flow by `name` → PUT (update); no match → POST (create).

Files here are the source of truth for the funnel structure; edit + `apply` to deploy.
`ig-comment-dm-v2.json` = the live "IG Comment to DM v2" funnel (exported 2026-07-17).
