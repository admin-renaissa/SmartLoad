# `@renverse/ai-sdk`

ISSA Hub client + tool-host helpers.

**Contracts:** `contracts/openapi/issa-hub.openapi.yaml`, `contracts/issa/`  
**Specs:** `docs/revamp/60-issa/` (`65_AI_SDK_CONTRACT.md`, tool callback, credits)

## 0.1 runtime

| Export | Purpose |
|--------|---------|
| `createIssaClient` | `chatStream`, `chat`, `listPersonas`, `getCredits`, `cancel` — browser-safe |
| `createToolHost` | register tool/persona; verify tool token (Node / suite-host) |
| `signToolToken` / `verifyToolToken` | HMAC tool tokens (TTL ≤ 120s) — Node |
| `createIssaToolRouter` | App `POST /issa/tools/:toolId` — Node / Express |
| `issaToolUserCopy` / `sanitizeIssaUserText` | Member-safe chat copy (no tool IDs) |

Browser SPAs (Launcher) resolve the `browser` export / `@renverse/ai-sdk/browser` so Vite does not pull `node:crypto`, jose, or Express.

```bash
npm run build:ai-sdk
npm run test:ai-sdk
```

**Version:** 0.1.0
