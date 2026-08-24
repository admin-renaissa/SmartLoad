# Suite GA Backlog — SmartLoad

> **Follow-along:** [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) — open this first for complete suite GA. **`hasAddon` only · EP-SL-01 before EP-SL-02.**

> **Owner:** SmartLoad team · **SoR:** Scan, dispatch, POD (**optional add-on**)  
> **Program hub:** [114](../../../docs/revamp/110-program/114_SUITE_GA_EXECUTION_PLAN.md)  
> **Full backlog:** [06_SMARTLOAD.md](../../../docs/revamp/110-program/backlog/06_SMARTLOAD.md)

> **Implementation specs:** [18_GA_IMPLEMENTATION_SPECS.md](./18_GA_IMPLEMENTATION_SPECS.md) · platform [`implement/`](../../../docs/revamp/110-program/implement/README.md)

```bash
./scripts/push-app-renverse-branch.sh publish --apps SmartLoad
```

**State (2026-08-24):** EP-SL-01/02 closeout — Organization + OrgMembership, product API org scope, `hasAddon` gates, OIDC JIT, ISSA tools, product POD emit. **EP-X-01:** dual CTA + link banner + cutover. **Ops:** `pnpm db:migrate:deploy` + `pnpm db:backfill-org`. **Tally:** on-prem.

---

## EP-SL-01 — Tenancy + addon gates (P2 · 21 SP)

| ID | Story | SP | Status |
|----|-------|-----|--------|
| SL-01-1 | Org/site tenancy model | 8 | done |
| SL-01-2 | `hasAddon('smartload')` on APIs | 5 | done |
| SL-01-3 | Full OIDC + AppLink | 5 | done |
| SL-01-4 | ISSA tools (2 + persona) | 3 | done |

**Path:** `apps/api/src/renverse/` · migrations `20260824120000_*` + `20260824130000_scanner_org_backfill` · `pnpm db:backfill-org`

---

## EP-SL-02 — POD → RenBooks (P2 · 8 SP)

| ID | Story | SP | Status |
|----|-------|-----|--------|
| SL-02-1 | POD emit from product module | 3 | done |
| SL-02-2 | E2E with RenBooks RB-01-4 | 5 | done (product URLs; live Connect E2E ops follow-up) |

**Event:** `smartload.pod.confirmed.v1` only · Product: `modules/pod/pod.routes.ts` → `emit-pod-confirmed.ts`

---

## Ban

No full WMS/ERP. Not required for core Suite SKU.

**Cursor prompts:** [README.md](./README.md)

---

*SmartLoad · 2026-08-24*
