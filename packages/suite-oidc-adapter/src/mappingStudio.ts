export function mappingStudioUrl(
  accountsOrigin: string,
  opts: { orgId: string; appKey: string; next?: string },
): string {
  const url = new URL(`/orgs/${opts.orgId}/apps`, accountsOrigin);
  url.searchParams.set('map', '1');
  url.searchParams.set('app', opts.appKey);
  if (opts.next) url.searchParams.set('next', opts.next);
  return url.toString();
}

export class NeedsMappingError extends Error {
  readonly code = 'needs_mapping' as const;
  constructor(
    public readonly orgId: string,
    public readonly appKey: string,
  ) {
    super('needs_mapping');
    this.name = 'NeedsMappingError';
  }
}

export function isNeedsMappingError(err: unknown): err is NeedsMappingError {
  return (
    err instanceof NeedsMappingError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'needs_mapping' &&
      typeof (err as { orgId?: string }).orgId === 'string' &&
      typeof (err as { appKey?: string }).appKey === 'string')
  );
}
