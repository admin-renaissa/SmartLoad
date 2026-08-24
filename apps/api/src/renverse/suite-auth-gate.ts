/**
 * Suite auth migration gates (EP-X-01) — thin wrapper over @renverse/auth-sdk.
 */
export {
  resolveAuthPhase,
  isRenverseSuiteMode,
  isSuiteAuthCutoverPhase,
  shouldShowLocalLoginOnClient,
  shouldBlockLocalLogin,
  suiteCutoverMessage,
  SUITE_CUTOVER_CODE,
} from '@renverse/auth-sdk';
export type { AuthPhase } from '@renverse/auth-sdk';
