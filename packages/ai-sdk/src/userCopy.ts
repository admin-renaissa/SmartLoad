/** Who sees ISSA copy. Members never get tool IDs or error codes. */
export type IssaCopyAudience = 'member' | 'ops';

const APP_LABEL: Record<string, string> = {
  renbooks: 'RenBooks',
  renexus: 'Renexus',
  renorc: 'RenOrc',
  renovax: 'ReNovaX',
  creator: 'RenAura',
  renaura: 'RenAura',
  smartload: 'SmartLoad',
};

const TOOL_ID_RE = /\b[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*){1,5}\b/gi;
const ERROR_CODE_RE =
  /\b(?:callback_failed|not_found|not_entitled|confirm_required|forbidden|http_\d{3})\b/gi;

export function issaAppLabel(appOrTool?: string): string {
  const key = String(appOrTool || '')
    .split('.')[0]
    ?.toLowerCase();
  return (key && APP_LABEL[key]) || 'that app';
}

export function issaToolUserCopy(opts: {
  ok?: boolean;
  owningApp?: string;
  toolId?: string;
  errorCode?: string;
  audience?: IssaCopyAudience;
}): { headline: string; detail?: string } {
  const app = issaAppLabel(opts.owningApp || opts.toolId);
  if (opts.audience === 'ops') {
    const id = opts.toolId || opts.owningApp || 'tool';
    if (opts.ok === true) return { headline: `Done in ${app}`, detail: id };
    if (opts.ok === false) {
      return {
        headline: `Couldn’t finish in ${app}`,
        detail: [id, opts.errorCode].filter(Boolean).join(' · '),
      };
    }
    return { headline: `Working in ${app}…`, detail: id };
  }
  if (opts.ok === true) return { headline: `Done in ${app}` };
  if (opts.errorCode === 'not_entitled' || opts.errorCode === 'forbidden') {
    return { headline: `You don’t have permission in ${app} for that action.` };
  }
  if (opts.errorCode === 'confirm_required') {
    return { headline: `Confirm this change in ${app} before ISSA continues.` };
  }
  if (opts.ok === false) {
    return { headline: `Couldn’t finish in ${app}. Try again or open the app.` };
  }
  return { headline: `Working in ${app}…` };
}

/** Strip tool IDs and internal error codes from member-visible text. */
export function sanitizeIssaUserText(text: string): string {
  return text
    .replace(TOOL_ID_RE, (id) => issaAppLabel(id))
    .replace(ERROR_CODE_RE, '')
    .replace(/\b(?:the\s+)?tool\s+["']([^"']+)["']/gi, '$1')
    .replace(/\bdue to a callback failure(?:\s+error)?\b/gi, '')
    .replace(/\b(?:according to )?(?:the )?tool results(?: provided)?[,.]?\s*/gi, '')
    .replace(/\b(?:returned an )?error code of\s*["'][^"']*["']\.?/gi, '')
    .replace(/\bcallback function\b/gi, 'connection')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/** Safe payload for the composer model — no tool IDs or error codes. */
export function issaComposeFacts(
  results: Array<{
    toolId: string;
    ok: boolean;
    result?: unknown;
    errorCode?: string;
    owningApp?: string;
  }>,
): Array<{ app: string; ok: boolean; result?: unknown; note?: string }> {
  return results.map((t) => ({
    app: issaAppLabel(t.owningApp || t.toolId),
    ok: t.ok,
    result: t.ok ? t.result : undefined,
    note: t.ok
      ? undefined
      : t.errorCode === 'not_entitled' || t.errorCode === 'forbidden'
        ? 'permission_denied'
        : t.errorCode === 'confirm_required'
          ? 'needs_confirm'
          : 'unavailable',
  }));
}
