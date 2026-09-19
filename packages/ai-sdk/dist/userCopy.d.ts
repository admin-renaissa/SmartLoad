/** Who sees ISSA copy. Members never get tool IDs or error codes. */
export type IssaCopyAudience = 'member' | 'ops';
export declare function issaAppLabel(appOrTool?: string): string;
export declare function issaToolUserCopy(opts: {
    ok?: boolean;
    owningApp?: string;
    toolId?: string;
    errorCode?: string;
    audience?: IssaCopyAudience;
}): {
    headline: string;
    detail?: string;
};
/** Strip tool IDs and internal error codes from member-visible text. */
export declare function sanitizeIssaUserText(text: string): string;
/** Safe payload for the composer model — no tool IDs or error codes. */
export declare function issaComposeFacts(results: Array<{
    toolId: string;
    ok: boolean;
    result?: unknown;
    errorCode?: string;
    owningApp?: string;
}>): Array<{
    app: string;
    ok: boolean;
    result?: unknown;
    note?: string;
}>;
