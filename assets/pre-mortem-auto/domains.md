# Pre-mortem domains (curated)

Curated catalog used by deterministic domain selection.
Do not auto-edit. New candidates go to `domains.generated.md`.

Format: table.

| agent | prefix | triggers (tokens and/or phrases; case-insensitive) |
|---|---:|---|
| tech-critic | tech | architecture, performance, latency, throughput, scaling, reliability, concurrency, api, schema, migration |
| security-critic | sec | auth, authentication, authorization, oauth, jwt, csrf, xss, sql injection, secret, encryption, threat model |
| product-critic | prod | user, customer, onboarding, retention, churn, funnel, roadmap, pricing, persona |
| ux-critic | ux | usability, accessibility, a11y, ux, ui, flow, friction, error message |
| data-critic | data | analytics, metric, event, tracking, warehouse, etl, pipeline, schema drift |
| ops-critic | ops | deploy, deployment, rollback, incident, oncall, sla, sre, observability, monitoring |
| finance-critic | fin | cost, budget, roi, pricing, margin, forecast, billing, invoice |
| legal-critic | legal | gdpr, privacy policy, pii, compliance, retention policy, consent |
