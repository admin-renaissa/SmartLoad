# Suite GA Backlog — SmartLoad

> **Follow-along:** [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) — open this first for complete suite GA. **`hasAddon` only · EP-SL-01 before EP-SL-02.**

> **Owner:** SmartLoad team · **SoR:** Scan, dispatch, POD (**optional add-on**)  
> **Program hub:** [114](../../../docs/revamp/110-program/114_SUITE_GA_EXECUTION_PLAN.md)  
> **Full backlog:** [06_SMARTLOAD.md](../../../docs/revamp/110-program/backlog/06_SMARTLOAD.md)

> **Implementation specs:** [18_GA_IMPLEMENTATION_SPECS.md](./18_GA_IMPLEMENTATION_SPECS.md) · platform [`implement/`](../../../docs/revamp/110-program/implement/README.md)

```bash
./scripts/push-app-renverse-branch.sh publish --apps SmartLoad
```

**BLOCKER:** Multi-tenant org incomplete · **Entitlement:** `hasAddon('smartload')` only · **Tally:** on-prem

---

## EP-SL-01 — Tenancy + addon gates (P2 · 21 SP)

| ID | Story | SP | Status |
|----|-------|-----|--------|
| SL-01-1 | Org/site tenancy model | 8 | todo |
| SL-01-2 | `hasAddon('smartload')` on APIs | 5 | todo |
| SL-01-3 | Full OIDC + AppLink | 5 | todo |
| SL-01-4 | ISSA tools (2 + persona) | 3 | todo |

**Path:** `apps/api/src/renverse/` · [02](./02_TENANT_AND_USER_MAPPING.md), [08](./08_ENTITLEMENTS_AND_GATES.md)

---

## EP-SL-02 — POD → RenBooks (P2 · 8 SP)

| ID | Story | SP | Status |
|----|-------|-----|--------|
| SL-02-1 | POD emit from product module | 3 | todo |
| SL-02-2 | E2E with RenBooks RB-01-4 | 5 | todo |

**Event:** `smartload.pod.confirmed.v1` only

---

## Sprint plan

| Sprint | Focus |
|--------|-------|
| S2 | SL-01-1 |
| S3 | SL-01-2 |
| S4 | SL-01-3 |
| S5 | SL-01-4, SL-02-1 |
| S6 | SL-02-2 |

## Ban

No full WMS/ERP. Not required for core Suite SKU.

**Cursor prompts:** [README.md](./README.md)

---

*SmartLoad · 2026-08-19*
