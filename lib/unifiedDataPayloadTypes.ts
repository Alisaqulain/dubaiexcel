export type UnifiedSocketPayload =
  | { type: 'row-updated'; rowId: string; row?: Record<string, unknown> }
  | { type: 'row-removed'; rowId: string }
  | { type: 'row-restored'; rowId: string; row?: Record<string, unknown> }
  | { type: 'row-picked'; rowId: string; row?: Record<string, unknown> }
  | { type: 'row-unpicked'; rowId: string; row?: Record<string, unknown> }
  | { type: 'rows-imported'; count: number };
