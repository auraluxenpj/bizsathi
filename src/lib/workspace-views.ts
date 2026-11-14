/** View selectors only; these never change posting or authorization rules. */
export function validateWorkspaceView(search: Record<string, unknown>): { kind?: string; tool?: string; panel?: string } {
 return Object.fromEntries(['kind', 'tool', 'panel'].flatMap(key => typeof search[key] === 'string' ? [[key, search[key]]] : []));
}
export function selectedDocumentKind(mode: 'sale' | 'purchase', kind: unknown) {
 return kind === `${mode}_return` ? `${mode}_return` : undefined;
}
export function documentInSelectedView(mode: 'sale' | 'purchase', kind: unknown, documentKind: string) {
 const selected = selectedDocumentKind(mode, kind);
 return selected ? documentKind === selected : (mode === 'sale' ? ['sale', 'sale_return'] : ['purchase', 'purchase_order', 'goods_receipt', 'purchase_return']).includes(documentKind);
}