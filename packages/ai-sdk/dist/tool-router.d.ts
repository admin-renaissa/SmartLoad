import { Router } from 'express';
import type { ToolTokenClaims } from './types.js';
export interface ToolCallContext {
    claims: ToolTokenClaims;
    correlationId: string;
    dryRun: boolean;
    arguments: Record<string, unknown>;
}
export type ToolHandler = (args: Record<string, unknown>, ctx: ToolCallContext) => Promise<unknown> | unknown;
export declare function createIssaToolRouter(opts: {
    appKey: string;
    secret: string;
    issuer?: string;
    handlers: Record<string, ToolHandler>;
    authorize?: (ctx: ToolCallContext) => boolean | Promise<boolean>;
}): Router;
