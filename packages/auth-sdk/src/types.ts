/**
 * @renverse/auth-sdk — normative TypeScript types (contracts v1.0.0)
 */

export type AppKey =
  | 'renbooks'
  | 'renexus'
  | 'renorc'
  | 'renovax'
  | 'creator'
  | 'renaura'
  | 'smartload';

export type AddonKey = 'smartload';

export type SuiteRole =
  | 'org_owner'
  | 'org_admin'
  | 'org_member'
  | 'org_billing'
  | 'org_readonly';

export type RenverseMode = 'suite' | 'standalone';

export interface Department {
  id: string;
  orgId: string;
  name: string;
  code?: string;
  status: 'active' | 'disabled';
}

export interface Team {
  id: string;
  orgId: string;
  departmentId?: string;
  name: string;
  status: 'active' | 'disabled';
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  role: SuiteRole;
  status?: string;
  departmentId?: string | null;
  teamIds?: string[];
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string;
  appKey: AppKey;
  /** Default `app`. SmartLoad suite SSO uses `addon` (hasAddon). */
  entitlement?: 'app' | 'addon';
}

export interface AccessTokenClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  org_id: string;
  apps: AppKey[];
  addons?: AddonKey[];
  roles?: SuiteRole[];
  sid?: string;
  /** Platform operator — never implied by org_owner. */
  platform_admin?: boolean;
  [key: string]: unknown;
}

export interface Session {
  accessToken: string;
  refreshToken?: string;
  claims: AccessTokenClaims;
  expiresAt: number;
}

export type AuthErrorCode =
  | 'oidc_invalid_state'
  | 'oidc_pkce_failed'
  | 'oidc_token_invalid'
  | 'oidc_entitlement_missing'
  | 'oidc_addon_missing'
  | 'oidc_org_mismatch'
  | 'oidc_user_unmapped'
  | 'oidc_client_misconfigured'
  | 'oidc_jwks_unavailable';

export class RenverseAuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RenverseAuthError';
  }
}

export interface OidcClient {
  loginRedirect(req: unknown, res: unknown): void | Promise<void>;
  handleCallback(req: unknown, res: unknown): Promise<Session>;
  logout(
    req: unknown,
    res: unknown,
    opts?: { rpInitiated?: boolean },
  ): Promise<void>;
  validateAccessToken(token: string): Promise<AccessTokenClaims>;
  getSession(req: unknown): Session | null;
}

export type SessionStore = {
  get(req: unknown): Session | null;
  set(req: unknown, res: unknown, session: Session): void;
  clear(req: unknown, res: unknown): void;
};
