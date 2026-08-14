# SmartLoad — Implementation Status vs PRD v1.0

**Source:** Product Requirements Document v1.0 (April 2026), validated against this repository.  
**Last updated:** 2026-04 — integrations page, notification env model, reports export UI.

This document tracks **what is done**, **what is partial**, and **what remains** relative to in-scope PRD requirements (§5–§9) and stated out-of-scope items (§5.2).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| Done | Implemented and usable end-to-end in this repo |
| Partial | Works in code but gaps vs PRD (config, depth, or NFR) |
| Stub | Placeholder or non-production integration |
| Not planned (V1) | PRD §5.2 out of scope |
| Backlog | In scope or roadmap but not implemented |

---

## 1. Core product (PRD §6)

### FR-01 — Product & barcode master

| Item | Status | Notes |
|------|--------|--------|
| Product + category + SKU | Done | Prisma + API + web |
| Variants (colour, L/W/T, barcode, MRP, HSN, min stock) | Done | |
| Barcode formats enum (QR, Code128, etc.) | Done | |
| Bulk import CSV | Done | `POST /api/v1/products/import` |
| Export CSV | Done | Products list export |
| Excel (xlsx) import | Backlog | CSV path exists; xlsx optional |
| Label print to production ZPL | Backlog | PDF QR sheets exist (variant) |
| PRD JSON QR payload helper | Partial | `parseQRPayload` / generation in shared |

### FR-02 — Purchase orders

| Item | Status | Notes |
|------|--------|--------|
| PO create / list / detail / cancel | Done | |
| Line items, rates, GST | Done | |
| Status workflow (draft → … → delivered) | Done | Aligns with `POStatus` |
| Split PO across trucks | Done | Multiple `DispatchSession` per PO |
| Auto-import PO from Tally | Partial | Bridge + pull-orders; mapping is site-specific |

### FR-03 — Scan verification

| Item | Status | Notes |
|------|--------|--------|
| Create session (PO + vehicle + operator) | Done | |
| Expected load / scan processing | Done | `SessionService.processScan` |
| Match: product, colour, excess | Done | `ScanResult` types |
| WebSocket real-time scan | Done | `plugins/socket.ts`, `scan:submit` |
| REST scan fallback | Done | |
| Wrong product / colour / excess / unknown | Done | UI states on `ActiveScanPage` |
| Audio beep | Partial | Browser audio possible; not guaranteed on all devices |
| Session close → inventory + jobs | Done | Workers: inventory, tally queue, POD creation |
| Hindi / vernacular UI | Backlog | English only today |

### FR-04 — Vehicles

| Item | Status | Notes |
|------|--------|--------|
| Vehicle CRUD | Done | |
| One open session per vehicle | Done | Enforced in session create |
| Loading history | Done | Reports + sessions |
| Live progress | Partial | Dispatch UI + session detail; “2m distance” UX not audited |

### FR-05 — Inventory

| Item | Status | Notes |
|------|--------|--------|
| Stock + reserved + available | Done | `InventoryStock` |
| Auto deduction on session close | Done | Worker |
| GRN inward | Done | `grn.routes` + ledger |
| Ledger + manual adjust + transfer | Done | `inventory.service` + routes |
| Low stock | Done | Executive dashboard + inventory |
| Per **location / zone** | Backlog | No warehouse/zone model in schema |
| Stock export CSV (date range) | Partial | Ledger report API exists; dedicated “export” UX in reports UI |

### FR-06 — Tally integration

| Item | Status | Notes |
|------|--------|--------|
| Tally Bridge (Node, Windows) | Done | `apps/tally-bridge` |
| XML send/receive, daily logs | Done | `tally-client.ts` |
| Pull: stock, parties, orders (configurable) | Partial | Pull-orders mapping Tally-specific |
| Push: stock journal, GRN | Partial | XML best-effort; company config in Tally |
| Sync jobs + retry queue | Partial | Bull worker; mock if no `TALLY_BRIDGE_URL` |
| Full bidirectional (sales voucher, POD payment, etc.) | Backlog | PRD table §10.1 beyond current push/pull |
| Admin Tally status | Done | `/app/tally` — bridge + channel status + sync log + pull/push actions; API `GET /api/v1/tally/status`, `GET /api/v1/integrations/notifications` |

### FR-07 — Digital POD

| Item | Status | Notes |
|------|--------|--------|
| Link-based POD (no install) | Done | `/pod/:token` |
| OTP flow | Done | |
| Signature / discrepancy path | Partial | Check `PODPage` + API for full parity |
| SMS / WhatsApp send | Partial | Worker + `notification-env.ts` (mock / live / misconfigured); **Tally & integrations** shows channel status; production still needs real keys and approved templates |
| PDF to client + accounts | Partial | Puppeteer / PDF pipelines exist in places; verify prod wiring |
| 72h link expiry | Partial | `POD_LINK_EXPIRY_HOURS` in shared constants |

### FR-08 — Dashboards & reports

| Item | Status | Notes |
|------|--------|--------|
| Supervisor dashboard | Done | API + `DashboardPage` branch |
| Executive dashboard (KPIs, charts, tally bar) | Done | `ExecutiveDashboard` + `/dashboard/executive` |
| Report **APIs** (dispatch register, ledger, errors, POD, tally log, outstanding POs, client history) | Done | `report.routes.ts`; `pod-status` and `vehicle-loading-history` honor `dateFrom`/`dateTo` (filter on `createdAt` / `closedAt`) |
| Report **UI** (export centre) | **Done** (this iteration) | `ReportsPage` + `csvDownload.ts` |
| PDF export per PRD table | Backlog | CSV from browser; server PDF generation per report not all built |

---

## 2. Cross-cutting (PRD §7, §9, §13)

| Item | Status | Notes |
|------|--------|--------|
| JWT auth + RBAC | Done | |
| Roles: Admin, Supervisor, Operator, Accounts, Driver | Done | Driver limited surface |
| Audit log (user actions) | Done | Routes + Prisma `AuditLog` |
| Audit 7-year retention / immutability policy | Backlog | Operational / DB policy |
| HTTPS / TLS | Partial | Deploy responsibility |
| Passwords hashed | Done | bcrypt |
| 2FA for admin/accounts | Backlog | |
| AES-256 at rest for PII | Backlog | |
| Scan &lt; 500ms | Partial | Not load-tested |
| Offline scan queue | Backlog | |
| i18n (Hindi) | Backlog | |
| HAL (keyboard, serial, Zebra stub) | Done | `apps/api/src/hal` (API-side; browser uses wedge + socket) |
| Redis + BullMQ | Done | |
| PostgreSQL | Done | |

---

## 3. PRD out of scope V1 (§5.2)

| Item | Status |
|------|--------|
| GPS live tracking | Not planned (V2) |
| E-commerce integration | Not planned (V1) |
| Multi-company Tally | Not planned (V1) |
| Customer order portal | Not planned (V1) |

---

## 4. PRD §12 suggested enhancements

Treated as **backlog** unless explicitly pulled into a milestone: AI analytics, GPS, driver app, returns module, production auto-labels, WhatsApp-first, multi-branch, RFID, predictive stock, client portal, etc.

---

## 5. Remaining priorities (suggested order)

1. **Production notifications** — Configure MSG91 / WATI / SMTP; unset `NOTIFICATIONS_FORCE_MOCK` in prod; verify templates match flow API body.  
2. **Tally** — Harden XML for each customer; complete pull-orders mapping; optional sales/challan push if in contract.  
3. **Reports** — Add server-side PDF for key reports if clients require PDF not CSV.  
4. **Offline scan** — IndexedDB queue + replay in PWA scan flow.  
5. **Security NFRs** — 2FA, encryption at rest for PII, formal backup runbook.  
6. **Warehouse/zone** — Schema + stock by location if FR-05 must be literal.  
7. **i18n** — Hindi strings for operator flow.

---

## 6. How to update this file

When closing a feature:

1. Move rows from **Backlog** / **Partial** to **Done** with a one-line note (e.g. “Reports UI 2026-04”).  
2. Adjust **Last updated** at the top.  
3. Keep **Remaining priorities** aligned with the product roadmap.

---

*Confidential — SmartLoad internal delivery tracking.*
