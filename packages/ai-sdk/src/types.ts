/**
 * @renverse/ai-sdk — normative TypeScript types (ISSA Hub)
 * Mirror contracts/openapi/issa-hub.openapi.yaml
 */

export type AppKey =
  | 'renbooks'
  | 'renexus'
  | 'renorc'
  | 'renovax'
  | 'creator'
  | 'renaura'
  | 'smartload';

export type CreditClass = 'read' | 'write' | 'search' | 'codegen' | 'heavy';

export type PersonaTier = 'featured' | 'standard' | 'advanced' | 'internal';

export type PersonaVisibility = 'suite' | 'app' | 'org';

/** Bedrock routing profile — org override or platform default. */
export type ModelProfile = 'efficient' | 'balanced' | 'quality';

export interface AiSdkConfig {
  baseUrl: string;
  /** Identity access token getter (userBearer) */
  getAccessToken: () => Promise<string> | string;
}

export interface ToolHostConfig {
  baseUrl: string;
  /** Platform service token for PUT /v1/tools and /v1/personas */
  getServiceToken: () => Promise<string> | string;
  /** Shared HMAC secret (dev) or JWKS-backed verify */
  toolTokenSecret: string;
  issuer?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface AppContext {
  appKey: AppKey;
  localTenantId?: string;
  route?: string;
}

export interface ChatRequest {
  orgId: string;
  conversationId?: string;
  personaId?: string;
  appContext?: AppContext;
  /**
   * Client app selection (All or Selected chips).
   * Hub intersects with token `apps[]` (+ smartload addon). Empty after filter → 403.
   */
  appScope?: AppKey[];
  messages: ChatMessage[];
  toolsAllowlist?: string[];
  dryRun?: boolean;
  /** After write-confirm UI — re-run mutating tool. */
  confirm?: boolean;
  /** Bump to rare/Sonnet within org profile + plan ceiling. */
  thinkHarder?: boolean;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  creditsDebited?: number;
}

export interface ToolCallResult {
  toolId: string;
  ok: boolean;
  result?: unknown;
  errorCode?: string;
  /** Optional suite deep-link hint for Launcher / app UI (EP-PLAT-01). */
  deepLink?: {
    type: string;
    sid: string;
    src?: string;
    orgId?: string;
  };
}

export interface ChatResponse {
  traceId: string;
  conversationId?: string;
  message: ChatMessage;
  usage: Usage;
  toolCalls?: ToolCallResult[];
}

export type StreamEventType =
  | 'trace'
  | 'delta'
  | 'tool_call'
  | 'tool_result'
  | 'usage'
  | 'error'
  | 'done';

export interface StreamEvent {
  type: StreamEventType;
  data: Record<string, unknown>;
}

export interface Persona {
  personaId: string;
  name: string;
  description?: string;
  owningApp: AppKey | string;
  allowedTools: string[];
  visibility: PersonaVisibility;
  modelPolicy?: Record<string, unknown>;
  active: boolean;
  tier?: PersonaTier;
}

export interface ToolRegistration {
  toolId: string;
  owningApp: AppKey | string;
  httpPath: string;
  inputSchema?: Record<string, unknown>;
  creditClass?: CreditClass;
  active: boolean;
}

export interface CreditBalance {
  orgId: string;
  balance: number;
  updatedAt?: string;
}

export interface ModelProfileState {
  profile: ModelProfile;
  source: 'org' | 'platform';
  orgId?: string;
}

export interface IssaClient {
  chatStream(
    req: ChatRequest,
    onEvent: (ev: StreamEvent) => void,
  ): Promise<void>;
  chat(req: ChatRequest): Promise<ChatResponse>;
  listPersonas(opts?: {
    owningApp?: string;
    visibility?: PersonaVisibility;
  }): Promise<Persona[]>;
  getCredits(orgId: string): Promise<CreditBalance>;
  getOrgModelProfile(orgId: string): Promise<ModelProfileState>;
  cancel(traceId: string): Promise<void>;
}

export interface ToolTokenClaims {
  sub: string;
  org_id: string;
  tool_id: string;
  aud: string;
  iss?: string;
  exp?: number;
  jti?: string;
}

export interface ToolHostHelpers {
  registerTool(tool: ToolRegistration): Promise<void>;
  registerPersona(persona: Persona): Promise<void>;
  verifyToolToken(token: string): Promise<ToolTokenClaims>;
}

export const CREDIT_CLASS_WEIGHTS: Record<CreditClass, number> = {
  search: 2,
  read: 1,
  write: 5,
  codegen: 25,
  heavy: 50,
};
