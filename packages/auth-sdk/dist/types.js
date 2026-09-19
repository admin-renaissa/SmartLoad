/**
 * @renverse/auth-sdk — normative TypeScript types (contracts v1.0.0)
 */
export class RenverseAuthError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'RenverseAuthError';
    }
}
