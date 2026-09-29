# Secret patterns detected by Jagernator

Source of truth: `src/security/secrets.js`.

## High confidence (blocks egress, asks before reading)

private key blocks (`-----BEGIN ... PRIVATE KEY-----`), AWS access key IDs (`AKIA…`/`ASIA…`) and `aws_secret_access_key=`, GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), GitLab (`glpat-`), Slack (`xox?-`), Stripe (`sk_live_`, `rk_test_`, …), Google API keys (`AIza…`), Anthropic (`sk-ant-`), OpenAI (`sk-…`, `sk-proj-…`), npm (`npm_`), JWTs, `Authorization: Bearer/Basic …` headers, URLs with embedded credentials (`scheme://user:pass@host`).

## Medium confidence (redacted in logs; not used to block)

Assignments like `password = …`, `api_key: …`, `client_secret=…` whose value has high entropy and is not an obvious placeholder (`${VAR}`, `<value>`, `changeme`, `process.env…`).

## Sensitive file names

`.env`, `.env.*` (except `.example`/`.sample`/`.template`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.tfstate`, `*.tfvars`, `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519`, `credentials*`, `secrets*` (not source files), `service-account*.json`, `.netrc`, `.npmrc`, `.pypirc`, `.pgpass`, `.git-credentials`, `.htpasswd`, anything under `.ssh/`, `.aws/`, `.gnupg/`, plus `.docker/config.json` and `.kube/config`.

Filename detection is not sufficient on its own; content scanning complements it. Neither is complete.
