# `.agent/ref` — Project Reference Library

Canonical reference documents for domain-specific knowledge. These docs are the **single source of truth** that all agents, skills, and workflows must consult.

## Index

| Document | Domain | Summary |
|----------|--------|---------|
| [invest-domain.md](invest-domain.md) | Investment | Glossary, node types, counting rules, state diagram, API map |
| [invest-architecture.md](invest-architecture.md) | Investment | Payment pipeline, Fineract integration, schedule calculation |
| [invest-rules.md](invest-rules.md) | Investment | 13 enforceable development rules for the invest module |

## Convention

- Each domain gets a **`{domain}-domain.md`** (concepts) + **`{domain}-architecture.md`** (technical) + **`{domain}-rules.md`** (guardrails)
- New domains follow the same pattern: `loan-domain.md`, `bnpl-architecture.md`, etc.
- All docs are referenced by their corresponding **skill** (in `.agent/skills/`) and **workflow** (in `.agent/workflows/`)

## Related

- **Skill**: [`.agent/skills/invest/SKILL.md`](../skills/invest/SKILL.md)
- **Workflow**: [`.agent/workflows/invest.md`](../workflows/invest.md)
