# SmartLoad Tally Bridge

Standalone **Node.js** application that runs as a **Windows Service** on the same PC as **TallyPrime**. It exposes a small REST API so the SmartLoad cloud can pull ledgers, stock items and orders from Tally, and push stock journals and GRNs back — all via TallyPrime's built-in HTTP XML interface.

## Architecture

```
SmartLoad Cloud API
      │  HTTPS (Cloudflare Tunnel / ngrok / VPN)
      ▼
[Tally Bridge :7474]  ←─── Windows Service (SmartLoadTallyBridge)
      │  HTTP XML on localhost:9000
      ▼
[TallyPrime]
```

## Prerequisites

- **Windows 10/11** or Windows Server 2016+
- **TallyPrime** with HTTP server enabled (see below)
- **Node.js 20+** and **pnpm**

## TallyPrime Configuration

1. Open TallyPrime
2. `Gateway of Tally → F12: Configure → Advanced → Data Configuration`
3. Enable: **Allow ODBC Server** = Yes
4. For TDL:
   - Copy `tdl/smartload.tdl` to your Tally data directory
   - `F12: Configure → Advanced → TDL Configuration`
   - Set **Load TDL Files on Startup** = Yes, add the path
   - Restart TallyPrime after changes

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

| Variable | Default | Purpose |
|----------|---------|---------|
| `BRIDGE_PORT` | `7474` | Port this bridge listens on |
| `BRIDGE_HOST` | `127.0.0.1` | Bind address (keep localhost unless exposed via VPN) |
| `TALLY_BRIDGE_SECRET` | `change-me` | **Bearer** token the SmartLoad cloud must send |
| `TALLY_URL` | `http://localhost:9000` | TallyPrime HTTP base URL |
| `TALLY_HTTP_TIMEOUT_MS` | `15000` | Tally request timeout (ms) |
| `TALLY_COMPANY_NAME` | _(empty)_ | Company name shown in health/status responses |
| `TALLY_GODOWN` | `Main Warehouse` | Default godown for inventory line items |
| `TALLY_DEFAULT_VENDOR_LEDGER` | _(empty)_ | **Required** for `POST /push/grn` if not provided per call |
| `TALLY_LEDGER_REPORT` | `List of Ledgers` | Tally report for `POST /pull/parties` |
| `TALLY_PO_REPORT` | `Voucher Register` | Report for `POST /pull/orders` |
| `TALLY_PO_FROM` / `TALLY_PO_TO` | last 2 years | YYYYMMDD date range for order pull |
| `TALLY_PO_SVVOUCHERTYPENAME` | _(empty)_ | Optional: sent to Tally as `SVVOUCHERTYPENAME` (e.g. `Purchase`) |
| `TALLY_PO_VOUCHER_TYPE_FILTER` | _(empty)_ | Optional substring filter on voucher type in parsed XML |
| `TALLY_POLL_INTERVAL_MS` | `60000` | How often the bridge pings TallyPrime; set `0` to disable |
| `TALLY_BRIDGE_LOG_DIR` | `./logs` | Directory for daily request/response log files |
| `LOG_LEVEL` | `info` | Winston log level (`error` \| `warn` \| `info` \| `debug`) |

## Run (development)

From repo root:

```bash
pnpm --filter @smartload/tally-bridge run dev
```

Or from this directory: `pnpm run dev` (uses `tsx watch` for hot reload).

## Build & Start (production)

```bash
pnpm run build   # compiles TypeScript → dist/
pnpm start       # runs dist/index.js
```

## Install as Windows Service

> **Requires Administrator privileges**

```bash
# 1. Build first
pnpm run build

# 2. Set environment variables in Windows (System → Advanced → Environment Variables)
#    or in a .env file in this directory

# 3. Install the service
node dist/service/install.js
```

The service (`SmartLoadTallyBridge`) will:
- Auto-start on Windows boot
- Restart automatically on crash (max 3 times, 10s delay)
- Log to Windows Event Viewer under **Applications**
- Be manageable via `Services` → `SmartLoadTallyBridge`

### Uninstall

```bash
node dist/service/uninstall.js
```

> **Note**: The legacy `install-service.cjs` / `install.bat` approach is still available for quick installs without building TypeScript first.

## API Reference

All routes (except `/health`) require `Authorization: Bearer <TALLY_BRIDGE_SECRET>`.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | No auth. Bridge status + last Tally ping |
| `GET` | `/tally-status` | TallyPrime reachability + company |
| `POST` | `/pull/stock-items` | Export enriched stock items from TallyPrime |
| `POST` | `/pull/stock-items/legacy` | Legacy stock item format (tallyName, tallyAlias) |
| `POST` | `/pull/parties` | Ledgers (parties) export with GSTIN + balance |
| `POST` | `/pull/orders` | Purchase/order voucher data |
| `POST` | `/push/stock-journal` | Create outward Stock Journal voucher in Tally |
| `POST` | `/push/grn` | Create Purchase (GRN) receipt voucher in Tally |

### POST /push/stock-journal

Body: `{ "session": <SmartLoad DispatchSession object from API> }`

### POST /push/grn

Body: `{ "grn": <SmartLoad GRN object from API> }`

## Tests

```bash
pnpm test
pnpm typecheck
```

## TDL Custom Fields

After installing `tdl/smartload.tdl`, each Stock Item in TallyPrime gains three custom UDF fields:

| Field | TDL Name | Purpose |
|-------|----------|---------|
| SmartLoad Variant ID | `SLVariantId` | SmartLoad internal UUID for the product variant |
| SmartLoad Colour Code | `SLColourCode` | Colour code used in SmartLoad (e.g. `WHT`, `IVR`) |
| SmartLoad SKU | `SLSku` | Full SmartLoad SKU (e.g. `PVC-4X8-3MM-WHT`) |

These fields are used by the `SL Stock Items` Tally Collection for automatic product-variant mapping during stock sync.

## Logs

- HTTP XML request/response pairs: `logs/tally-http-<date>.log` (one per calendar day)
- Application logs: `logs/bridge-<date>.log` (Winston, daily rotation, 14 days kept)
- Error logs: `logs/bridge-error-<date>.log` (errors only, 30 days kept)

## Security

- Bind to **localhost** only. Expose to the internet only through a **VPN**, **Cloudflare Tunnel**, or **mTLS** hop that your organisation controls.
- Treat `TALLY_BRIDGE_SECRET` as a machine secret — rotate it with your DevOps process.
- `TALLY_BRIDGE_SECRET` on the cloud API side is stored in `TALLY_BRIDGE_SECRET` env var (must match).
