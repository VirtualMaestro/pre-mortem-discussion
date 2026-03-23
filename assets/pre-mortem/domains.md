# Domain Catalog

Read this before selecting domains or creating new agents.
Boundaries prevent overlap — each domain surfaces risks the others miss.
Trigger signals are used for automatic scoring (≥ 2 hits = included).

---

## tech-critic
Covers:          architecture decisions, wrong abstractions, technical debt,
                 testability, dependency risks, build and deploy complexity
Does NOT cover:  security attacks, UX, legal, infrastructure costs,
                 database internals, API contracts (use narrow experts for those)
Trigger signals: architecture, framework, monolith, microservices, refactor,
                 migration, codebase, library, abstraction, pattern, coupling

---

## security-critic
Covers:          auth/authz flaws, data exposure, attack vectors (injection,
                 MITM, SSRF, privilege escalation), supply chain, secrets
                 management, audit trail gaps
Does NOT cover:  general architecture, UX, compliance (use legal-critic)
Trigger signals: auth, login, token, JWT, session, API key, credentials,
                 permissions, access control, encryption, certificate, OAuth

---

## database-critic
Covers:          schema design, migrations, indexing strategy, N+1 queries,
                 transactions and locking, data integrity, backup and recovery,
                 query performance, ORM pitfalls
Does NOT cover:  application architecture, API design, UX, infrastructure
Trigger signals: database, schema, migration, index, query, ORM, SQL, NoSQL,
                 transaction, relation, foreign key, join, table, record, row

---

## api-critic
Covers:          REST/GraphQL contract design, versioning strategy,
                 rate limiting, pagination, error response consistency,
                 backward compatibility, API documentation gaps
Does NOT cover:  internal architecture, security threats, UX, database internals
Trigger signals: API, endpoint, REST, GraphQL, route, request, response,
                 payload, versioning, contract, swagger, openapi, webhook

---

## frontend-critic
Covers:          rendering strategy (SSR/CSR/SSG), state management complexity,
                 bundle size, component coupling, accessibility, browser
                 compatibility, hydration issues
Does NOT cover:  backend architecture, security, database, infrastructure
Trigger signals: frontend, UI, component, React, Vue, Angular, rendering,
                 bundle, state, hydration, SSR, CSR, browser, DOM

---

## mobile-critic
Covers:          offline behavior, battery and memory constraints, OS
                 permissions, push notifications, app store review risks,
                 deep linking, background processing limits
Does NOT cover:  backend architecture, web frontend, infrastructure
Trigger signals: mobile, iOS, Android, app, offline, push notification,
                 background, permission, store, native, React Native, Flutter

---

## ux-critic
Covers:          mental model mismatches, cognitive load, error and empty
                 states, onboarding gaps, accessibility, mobile/offline
                 edge cases from a user experience perspective
Does NOT cover:  backend, security, legal, business model, frontend
                 implementation details
Trigger signals: user, interface, flow, onboarding, dashboard, form,
                 notification, experience, interaction, screen, journey

---

## scalability-critic
Covers:          throughput bottlenecks, caching strategy, horizontal vs
                 vertical scaling, queue saturation, connection pool limits,
                 read/write ratio imbalances, cold start latency
Does NOT cover:  application architecture, security, UX, infrastructure ops
Trigger signals: scale, load, throughput, performance, cache, queue,
                 concurrent, traffic, latency, bottleneck, capacity

---

## devops-critic
Covers:          CI/CD pipeline risks, containerization pitfalls, secrets
                 in pipelines, rollback strategy, environment parity,
                 deployment frequency, observability gaps
Does NOT cover:  application architecture, security vulnerabilities, UX
Trigger signals: deploy, CI/CD, pipeline, Docker, container, environment,
                 rollback, release, build, artifact, registry, helm

---

## infra-critic
Covers:          cloud infrastructure costs at scale, vendor lock-in,
                 disaster recovery, SLA and uptime requirements,
                 multi-region complexity, managed vs self-hosted tradeoffs
Does NOT cover:  application architecture, security, UX, CI/CD pipeline
Trigger signals: cloud, AWS, GCP, Azure, kubernetes, infrastructure, SLA,
                 uptime, region, availability, disaster recovery, cost

---

## legal-critic
Covers:          GDPR/CCPA/local privacy laws, PCI-DSS, IP and license
                 risks, ToS violations of used platforms, jurisdictional
                 availability limits, liability exposure
Does NOT cover:  technical implementation, UX, business strategy
Trigger signals: GDPR, compliance, privacy, personal data, user data,
                 payments, license, jurisdiction, EU, regulation, legal

---

## cost-critic
Covers:          unit economics, cloud spend at scale, vendor pricing
                 changes, pricing model risks, hidden costs, revenue
                 concentration, build vs buy economics
Does NOT cover:  technical implementation, UX, legal compliance
Trigger signals: cost, pricing, budget, spend, revenue, margins, CAC,
                 LTV, subscription, billing, invoice, enterprise tier

---

## integration-critic
Covers:          third-party API reliability, deprecation and versioning
                 risks, webhook failure modes, rate limits, vendor
                 dependency concentration, SLA gaps with external providers
Does NOT cover:  internal architecture, security, UX, business model
Trigger signals: integration, third-party, Stripe, Twilio, SendGrid,
                 webhook, SDK, external API, SaaS, vendor, partner, OAuth
                 provider

---

## data-critic
Covers:          data pipeline reliability, ETL failures, schema evolution,
                 data quality and consistency, ML model reliability,
                 analytics blind spots, training data risks, reporting accuracy
Does NOT cover:  application architecture, UX, legal, business strategy
Trigger signals: pipeline, ETL, data warehouse, analytics, ML, model,
                 dataset, training, prediction, reporting, feature store,
                 embedding, vector
