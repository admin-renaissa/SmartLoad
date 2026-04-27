# SmartLoad Tally Bridge

Separate **Node.js** app that runs on the same Windows PC as **TallyPrime**, exposing a small REST API for the SmartLoad cloud (API + workers) to pull ledgers / stock and push stock journals, GRNs, and related vouchers via Tally’s **HTTP interface**.

## Prerequisites

- **Windows 10/11** (Tally Prime + this bridge are typically co-located).
- **TallyPrime** with **F12 → TallyPrime Developer → Tally.Developer HTTP** (or *Help → F1 → HTTP* depending on build) to enable the HTTP server — default `http://127.0.0.1:9000/`.
- **Node.js 20+** and **pnpm**.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TALLY_URL` | `http://localhost:9000` | TallyPrime HTTP base URL. |
| `BRIDGE_PORT` | `7474` | This bridge listens on `127.0.0.1:BRIDGE_PORT`. |
| `BRIDGE_HOST` | `127.0.0.1` | Bind address (keep localhost unless you have a specific network layout). |
| `TALLY_BRIDGE_SECRET` | `change-me` | **Bearer** token the cloud must send. |
| `TALLY_GODOWN` | `Main Warehouse` | Godown for inventory lines. |
| `TALLY_DEFAULT_VENDOR_LEDGER` | _(empty)_ | **Required** for `POST /push/grn` if not provided per call. |
| `TALLY_LEDGER_REPORT` | `List of Ledgers` | Tally report for `POST /pull/parties`. |
| `TALLY_PO_REPORT` | `Voucher Register` | Report for `POST /pull/orders`. |
| `TALLY_PO_FROM` / `TALLY_PO_TO` | last 2 years | YYYYMMDD date range for that report. |
| `TALLY_PO_SVVOUCHERTYPENAME` | _(empty)_ | Optional: sent to Tally as `SVVOUCHERTYPENAME` (e.g. `Purchase`). |
| `TALLY_PO_VOUCHER_TYPE_FILTER` | _(empty)_ | Optional substring filter on voucher type in parsed XML. |
| `TALLY_HTTP_TIMEOUT_MS` | `15000` | Tally request timeout. |
| `TALLY_POLL_INTERVAL_MS` | `60000` | How often the bridge **pings Tally** in the background; set to `0` to disable. |
| `TALLY_BRIDGE_LOG_DIR` | `./logs` | HTTP request/response log directory (one file per day: `tally-http-YYYY-MM-DD.log`). |

## Run (development)

From repo root:

```bash
pnpm --filter @smartload/tally-bridge run dev
```

Or from this folder: `pnpm run dev` (uses `tsx watch`).

## Build & start (production)

```bash
pnpm run build
pnpm start
```

## Windows Service (LAN IT)

1. In Tally, enable the HTTP service and test with a browser: `TALLY_URL` should respond to XML.
2. Build: `pnpm run build`.
3. (Optional) Set machine-level env vars for `TALLY_URL`, `TALLY_BRIDGE_SECRET`, etc.
4. Run **`install.bat` as Administrator** (or `node install-service.cjs` after `pnpm add -D node-windows`).

Uninstall: `node install-service.cjs --uninstall` (as Administrator).

> **node-windows** is a dev/optional dependency. If `install-service.cjs` errors, run `pnpm add -D node-windows` in this package.

## API (called by SmartLoad cloud with `Authorization: Bearer <TALLY_BRIDGE_SECRET>`)

- `GET /health` — no auth; returns bridge + last Tally ping status.
- `GET /tally-status` — Tally reachability.
- `POST /pull/stock-items` — export stock items from Tally.
- `POST /pull/parties` — ledgers (parties) export.
- `POST /pull/orders` — purchase / order data (default mapping may need your TDL and code changes).
- `POST /push/stock-journal` — body `{ session: … }` from Prisma (dispatch).
- `POST /push/grn` — body `{ grn: … }` from Prisma (GRN + lines).

## TDL

Place `tdl/smartload.tdl` in Tally’s TDL path and include it in **F12 → Configuration → TDL** so stock items can carry **SmartLoad** custom fields. Extend with **reports** for `TALLY_PO_REPORT` if you need custom purchase-order XML.

## Logs

- HTTP XML request/response pairs are appended to `logs/tally-http-<date>.log` (one file per calendar day). Rotate or archive these files for compliance; they may contain business data.

## Security

- Bind to **localhost** only; expose the bridge to the internet only through a **VPN** or **mTLS** hop that your org controls. Treat `TALLY_BRIDGE_SECRET` as a machine secret and rotate with your DevOps process.
