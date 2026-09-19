import type { ToolHostConfig, ToolHostHelpers } from './types.js';
/** Node / suite-host helper — do not import from browser SPAs. */
export declare function createToolHost(config: ToolHostConfig): ToolHostHelpers;
