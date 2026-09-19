import type {
  Persona,
  ToolHostConfig,
  ToolHostHelpers,
  ToolRegistration,
} from './types.js';
import { verifyToolToken } from './token.js';

async function tokenOf(
  getter: () => Promise<string> | string,
): Promise<string> {
  return getter();
}

/** Node / suite-host helper — do not import from browser SPAs. */
export function createToolHost(config: ToolHostConfig): ToolHostHelpers {
  const base = config.baseUrl.replace(/\/$/, '');
  const issuer = config.issuer || base;

  async function serviceHeaders(): Promise<Record<string, string>> {
    const token = await tokenOf(config.getServiceToken);
    return {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
  }

  return {
    async registerTool(tool: ToolRegistration): Promise<void> {
      const res = await fetch(`${base}/v1/tools/${encodeURIComponent(tool.toolId)}`, {
        method: 'PUT',
        headers: await serviceHeaders(),
        body: JSON.stringify({
          owningApp: tool.owningApp,
          httpPath: tool.httpPath,
          inputSchema: tool.inputSchema || {},
          creditClass: tool.creditClass || 'read',
          active: tool.active,
        }),
      });
      if (!res.ok) throw new Error(`registerTool ${res.status}`);
    },

    async registerPersona(persona: Persona): Promise<void> {
      const res = await fetch(
        `${base}/v1/personas/${encodeURIComponent(persona.personaId)}`,
        {
          method: 'PUT',
          headers: await serviceHeaders(),
          body: JSON.stringify({
            name: persona.name,
            description: persona.description,
            owningApp: persona.owningApp,
            allowedTools: persona.allowedTools,
            visibility: persona.visibility,
            modelPolicy: persona.modelPolicy || {},
            active: persona.active,
            tier: persona.tier,
          }),
        },
      );
      if (!res.ok) throw new Error(`registerPersona ${res.status}`);
    },

    async verifyToolToken(token: string) {
      return verifyToolToken(token, {
        secret: config.toolTokenSecret,
        issuer,
      });
    },
  };
}
