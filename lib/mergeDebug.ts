/**
 * Enable with DEBUG_ADMIN_MERGE=1, or logs run automatically in development.
 */
export function mergeDebugEnabled(): boolean {
  return process.env.DEBUG_ADMIN_MERGE === '1' || process.env.NODE_ENV === 'development';
}

export function mergeDebugLog(...args: unknown[]): void {
  if (!mergeDebugEnabled()) return;
  console.log(...args);
}
