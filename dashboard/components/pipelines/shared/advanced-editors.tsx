import * as React from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@vendure/dashboard';
import { getOperatorPlaceholder } from '../../../constants';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

type JsonRecord = Record<string, unknown>;

/** Config with mapping field for AdvancedMapEditor */
interface MapEditorConfig extends JsonRecord {
    mapping?: Record<string, string>;
}

/** Config with template fields for AdvancedTemplateEditor */
interface TemplateEditorConfig extends JsonRecord {
    template?: string;
    target?: string;
}

/** Rule condition for AdvancedWhenEditor */
interface RuleCondition {
    field?: string;
    cmp?: string;
    value?: unknown;
}

/** Rule group for grouped conditions */
interface RuleGroup {
    logic: 'AND' | 'OR';
    rules: RuleCondition[];
}

/** Config for AdvancedWhenEditor */
interface WhenEditorConfig extends JsonRecord {
    conditions?: RuleCondition[] | RuleGroup[];
    action?: 'keep' | 'drop';
    combine?: 'AND' | 'OR';
}

/** Logic type for condition groups */
type LogicType = 'AND' | 'OR';

function getPath(obj: JsonRecord, path: string): unknown {
    return String(path).split('.').reduce((acc: unknown, k) => {
        if (acc && typeof acc === 'object' && k in (acc as JsonRecord)) {
            return (acc as JsonRecord)[k];
        }
        return undefined;
    }, obj);
}

function collectPaths(obj: JsonRecord, prefix = ''): string[] {
    const out: string[] = [];
    if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            const p = prefix ? `${prefix}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                out.push(...collectPaths(v as JsonRecord, p));
            } else {
                out.push(p);
            }
        }
    }
    return out.sort();
}

export function AdvancedMapEditor({ config, onChange }: { config: JsonRecord; onChange: (values: JsonRecord) => void }) {
    const typedConfig = config as MapEditorConfig;
    const [sample, setSample] = React.useState<string>('[\n  { "name": "Alice", "price": 10, "category": { "code": "A" } }\n]');
    const [mappingText, setMappingText] = React.useState<string>(() => JSON.stringify(typedConfig.mapping ?? { title: 'name', amount: 'price' }, null, 2));
    const [selectedPath, setSelectedPath] = React.useState<string>('');
    const [destKey, setDestKey] = React.useState<string>('');
    const [helpOpen, setHelpOpen] = React.useState<boolean>(false);

    // JSON validation - empty catch returns false for invalid JSON (expected behavior)
    const mappingValid = React.useMemo(() => { try { JSON.parse(mappingText); return true; } catch { return false; } }, [mappingText]);
    const sampleValid = React.useMemo(() => { try { const v = JSON.parse(sample); return Array.isArray(v); } catch { return false; } }, [sample]);

    function apply() {
        try {
            const mapping = JSON.parse(mappingText);
            onChange({ ...config, mapping });
        } catch {
            // Invalid JSON - silently ignore (user sees validation state via mappingValid)
        }
    }
    function preview(): Array<JsonRecord> {
        try {
            const rows = JSON.parse(sample);
            const mapping = JSON.parse(mappingText);
            if (!Array.isArray(rows) || typeof mapping !== 'object') return [];
            return rows.map((row: any) => {
                const out: any = {};
                for (const [dst, src] of Object.entries(mapping)) out[dst] = src ? String(src).split('.').reduce((o: any, k) => (o ? o[k] : undefined), row) : undefined;
                return out;
            });
        } catch {
            // Invalid JSON or mapping - return empty preview
            return [];
        }
    }
    const result = preview();
    // Extract first sample record for path suggestions - returns null on invalid JSON
    const first = React.useMemo(() => { try { const r = JSON.parse(sample); return Array.isArray(r) ? r[0] : null; } catch { return null; } }, [sample]);
    const pathList = React.useMemo(() => (first ? collectPaths(first) : []), [first]);
    function addMappingFromSelection() {
        if (!selectedPath || !destKey) return;
        // Add to existing mapping - silently ignore if current mapping is invalid JSON
        try { const m = (JSON.parse(mappingText) || {}) as Record<string, string>; m[String(destKey)] = selectedPath; setMappingText(JSON.stringify(m, null, 2)); } catch { /* ignored */ }
    }

    return (
        <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Advanced: Map Editor</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between -mt-1">
                    <p className="text-[11px] text-muted-foreground">Define {`{ dest: source.path }`} pairs and preview.
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setHelpOpen(v => !v)}>{helpOpen ? 'Hide help' : 'Help'}</Button>
                </div>
                {helpOpen && (
                    <div className="border rounded p-2 text-[11px] text-muted-foreground bg-muted/30">
                        <ul className="list-disc pl-4 space-y-1">
                            <li>Mapping is JSON: keys are destination fields; values are source paths.</li>
                            <li>Nested paths supported (e.g., category.code).</li>
                            <li>Preview shows transformed records; use Before/After to compare.</li>
                        </ul>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-medium">Mapping (JSON)</label>
                        <Textarea className="font-mono text-xs min-h-[140px]" value={mappingText} onChange={e => setMappingText(e.target.value)} />
                        {!mappingValid && (<p className="text-[11px] text-destructive mt-1">Invalid mapping JSON</p>)}
                        <div className="mt-2 flex gap-2">
                            <Button variant="outline" size="sm" onClick={apply} disabled={!mappingValid}>Apply</Button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium">Sample Input (JSON array)</label>
                        <Textarea className="font-mono text-xs min-h-[140px]" value={sample} onChange={e => setSample(e.target.value)} />
                        {!sampleValid && (<p className="text-[11px] text-amber-600 mt-1">Enter a valid JSON array of records</p>)}
                        {pathList.length > 0 && (
                            <div className="mt-2">
                                <label className="text-xs font-medium">Field Picker</label>
                                <div className="border rounded p-2 max-h-32 overflow-auto">
                                    <div className="grid grid-cols-1 gap-1">
                                        {pathList.map((p) => (
                                            <button key={p} className={`text-[11px] text-left px-2 py-1 rounded ${selectedPath === p ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`} onClick={() => setSelectedPath(p)}>{p}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <Input className="h-8" placeholder="dest field" value={destKey} onChange={e => setDestKey(e.target.value)} />
                                    <Button variant="outline" size="sm" onClick={addMappingFromSelection} disabled={!selectedPath || !destKey}>Add mapping</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <label className="text-xs font-medium">Preview</label>
                    <div className="border rounded p-2 max-h-48 overflow-auto bg-muted/50">
                        <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
                    </div>
                    {(!mappingValid || !sampleValid) && (<p className="text-[11px] text-muted-foreground mt-1">Preview may be empty until mapping and sample are valid</p>)}
                </div>
                {first && result?.[0] && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium">Before (first record)</label>
                            <div className="border rounded p-2 max-h-48 overflow-auto bg-muted/30">
                                <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all">{JSON.stringify(first, null, 2)}</pre>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium">After (first mapped)</label>
                            <div className="border rounded p-2 max-h-48 overflow-auto bg-muted/30">
                                <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all">{JSON.stringify(result[0], null, 2)}</pre>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function AdvancedTemplateEditor({ config, onChange }: { config: JsonRecord; onChange: (values: JsonRecord) => void }) {
    const typedConfig = config as TemplateEditorConfig;
    const [sample, setSample] = React.useState<string>('{ "name": "Alice", "sku": "A-1" }');
    const [template, setTemplate] = React.useState<string>(typedConfig.template ?? 'Product ${name}');
    const [target, setTarget] = React.useState<string>(typedConfig.target ?? 'title');
    const templateRef = React.useRef<HTMLTextAreaElement>(null);
    const [helpOpen, setHelpOpen] = React.useState<boolean>(false);

    function apply() { onChange({ ...config, template, target }); }
    function render(): string {
        try {
            const obj = JSON.parse(sample);
            return template.replace(/\$\{([^}]+)\}/g, (_m, p1) => {
                const v = getPath(obj, String(p1));
                return v == null ? '' : String(v);
            });
        } catch { return ''; }
    }
    const paths = React.useMemo(() => { try { const obj = JSON.parse(sample); return collectPaths(obj); } catch { return []; } }, [sample]);
    function insertPath(path: string) {
        const t = templateRef.current;
        const ins = '${' + path + '}';
        if (!t) { setTemplate(prev => prev + ins); return; }
        const start = t.selectionStart ?? template.length;
        const end = t.selectionEnd ?? start;
        const next = template.slice(0, start) + ins + template.slice(end);
        setTemplate(next);
        requestAnimationFrame(() => {
            t.focus();
            const pos = start + ins.length;
            try { t.setSelectionRange(pos, pos); } catch {}
        });
    }

    return (
        <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Advanced: Template Editor</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between -mt-1">
                    <p className="text-[11px] text-muted-foreground">Render strings with {'${path}'} placeholders; write to the target path.</p>
                    <Button variant="ghost" size="sm" onClick={() => setHelpOpen(v => !v)}>{helpOpen ? 'Hide help' : 'Help'}</Button>
                </div>
                {helpOpen && (
                    <div className="border rounded p-2 text-[11px] text-muted-foreground bg-muted/30">
                        <ul className="list-disc pl-4 space-y-1">
                            <li>Use {'${field}'} or {'${nested.path}'} inside the template.</li>
                            <li>Click a field in Quick insert to add it at the cursor.</li>
                            <li>Rendered value is written to the target path.</li>
                        </ul>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium">Template</label>
                            <span className="text-[10px] text-muted-foreground">{template.length} chars</span>
                        </div>
                        {/* Note: Textarea ref type from @vendure/dashboard may differ from HTMLTextAreaElement */}
                        <Textarea ref={templateRef} className="font-mono text-xs min-h-[100px]" value={template} onChange={e => setTemplate(e.target.value)} />
                        <p className="text-[11px] text-muted-foreground">Use {'${path}'} placeholders, e.g. {'${name}'}, {'${category.code}'}</p>
                        <label className="text-xs font-medium">Target path</label>
                        <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="title" />
                        <div className="mt-2 flex gap-2">
                            <Button variant="outline" size="sm" onClick={apply}>Apply</Button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium">Sample Record (JSON)</label>
                        <Textarea className="font-mono text-xs min-h-[120px]" value={sample} onChange={e => setSample(e.target.value)} />
                        {paths.length > 0 && (
                            <div className="mt-2">
                                <label className="text-xs font-medium">Quick insert</label>
                                <div className="border rounded p-2 max-h-28 overflow-auto">
                                    {paths.map(p => (
                                        <button key={p} className="block w-full text-left text-[11px] px-2 py-1 rounded hover:bg-muted" onClick={() => insertPath(p)}>
                                            Insert path
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <label className="text-xs font-medium">Preview</label>
                    <div className="border rounded p-2 bg-muted/50">
                        <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all">{render()}</pre>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export function AdvancedWhenEditor({ config, onChange }: { config: JsonRecord; onChange: (values: JsonRecord) => void }) {
    const typedConfig = config as WhenEditorConfig;
    const rawConds = Array.isArray(typedConfig.conditions) ? typedConfig.conditions : [];
    const isGrouped = rawConds.length > 0 && typeof rawConds[0] === 'object' && 'rules' in (rawConds[0] as object);
    const groups: RuleGroup[] = isGrouped ? (rawConds as RuleGroup[]) : [{ logic: 'AND', rules: rawConds as RuleCondition[] }];
    const action = typedConfig.action ?? 'keep';
    const combine: LogicType = typedConfig.combine === 'OR' ? 'OR' : 'AND';

    function commit(nextGroups: RuleGroup[]) { onChange({ ...config, conditions: nextGroups, combine }); }
    function addGroup() { commit([...groups, { logic: 'AND', rules: [] }]); }
    function removeGroup(i: number) { commit(groups.filter((_g, idx) => idx !== i)); }
    function updateGroupLogic(i: number, logic: LogicType) { commit(groups.map((g, idx) => idx === i ? { ...g, logic } : g)); }
    function addRule(i: number) { commit(groups.map((g, idx) => idx === i ? { ...g, rules: [...g.rules, { field: 'price', cmp: 'gt', value: 0 }] } : g)); }
    function updateRule(gi: number, ri: number, patch: Partial<RuleCondition>) { commit(groups.map((g, idx) => idx === gi ? { ...g, rules: g.rules.map((r, ridx)=> ridx===ri? { ...r, ...patch } : r) } : g)); }
    function removeRule(gi: number, ri: number) { commit(groups.map((g, idx) => idx === gi ? { ...g, rules: g.rules.filter((_r, ridx)=> ridx!==ri) } : g)); }

    return (
        <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Advanced: Rule Builder (When)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-medium">Action</label>
                    <Select value={action} onValueChange={(v) => onChange({ ...config, action: v })}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="keep">Keep matches</SelectItem>
                            <SelectItem value="drop">Drop matches</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 ml-auto">
                        <label className="text-xs font-medium">Combine Groups</label>
                        <Select value={combine} onValueChange={(v) => onChange({ ...config, combine: v })}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="AND">AND</SelectItem>
                                <SelectItem value="OR">OR</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-3">
                    {groups.map((g, gi) => (
                        <div key={gi} className="border rounded p-2 space-y-2">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium">Group {gi + 1}</label>
                                <Select value={g.logic} onValueChange={(v) => updateGroupLogic(gi, v as LogicType)}>
                                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AND">AND</SelectItem>
                                        <SelectItem value="OR">OR</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={() => removeGroup(gi)}>
                                    Remove
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => addRule(gi)}>Add rule</Button>
                            </div>
                            <div className="space-y-2">
                                {g.rules.map((c, ri) => (
                                    <div key={ri} className="grid grid-cols-[1fr,140px,1fr,auto] gap-2 items-center">
                                        <Input value={String(c.field ?? '')} onChange={e => updateRule(gi, ri, { field: e.target.value })} placeholder="path.to.field" />
                                        <Select value={String(c.cmp ?? 'eq')} onValueChange={(v) => updateRule(gi, ri, { cmp: v })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="eq">eq</SelectItem>
                                                <SelectItem value="ne">ne</SelectItem>
                                                <SelectItem value="gt">gt</SelectItem>
                                                <SelectItem value="lt">lt</SelectItem>
                                                <SelectItem value="gte">gte</SelectItem>
                                                <SelectItem value="lte">lte</SelectItem>
                                                <SelectItem value="in">in</SelectItem>
                                                <SelectItem value="contains">contains</SelectItem>
                                                <SelectItem value="regex">regex</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {(() => {
                                            const cmp = String(c.cmp ?? 'eq').toLowerCase();
                                            const placeholder = getOperatorPlaceholder(cmp);
                                            const valStr = Array.isArray(c.value) ? JSON.stringify(c.value) : String(c.value ?? '');
                                            const onValChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                                                const txt = e.target.value;
                                                if (cmp === 'in') {
                                                    try { updateRule(gi, ri, { value: JSON.parse(txt) }); } catch { updateRule(gi, ri, { value: txt }); }
                                                } else {
                                                    updateRule(gi, ri, { value: txt });
                                                }
                                            };
                                            const regexError = cmp === 'regex' ? (() => { try { new RegExp(String(c.value ?? '')); return ''; } catch (err: any) { return err?.message || 'Invalid regex'; } })() : '';
                                            const inError = cmp === 'in' ? (Array.isArray(c.value) ? '' : 'Enter a JSON array for "in"') : '';
                                            return (
                                                <>
                                                    <Input value={valStr} onChange={onValChange} placeholder={placeholder} />
                                                    {(inError || regexError) && (
                                                        <div className="col-span-3 -mt-1">
                                                            <p className="text-[11px] text-amber-600">{inError || regexError}</p>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeRule(gi, ri)}>Remove</Button>
                                    </div>
                                ))}
                                {g.rules.length === 0 && (<p className="text-xs text-muted-foreground">No rules in this group.</p>)}
                            </div>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addGroup}>Add group</Button>
                </div>
            </CardContent>
        </Card>
    );
}

// =============================================================================
// MULTI-OPERATOR EDITOR
// =============================================================================

interface OperatorConfig {
    op: string;
    args?: Record<string, unknown>;
}

interface MultiOperatorEditorProps {
    operators: OperatorConfig[];
    availableOperators: Array<{ code: string; name: string; description?: string }>;
    onChange: (operators: OperatorConfig[]) => void;
}

/**
 * Editor for multi-operator transform steps.
 * Allows viewing, editing, adding, removing, and reordering operators.
 */
export function MultiOperatorEditor({ operators, availableOperators, onChange }: MultiOperatorEditorProps) {
    const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);
    const [addingNew, setAddingNew] = React.useState(false);

    const updateOperator = (index: number, updates: Partial<OperatorConfig>) => {
        const newOps = [...operators];
        newOps[index] = { ...newOps[index], ...updates };
        onChange(newOps);
    };

    const updateOperatorArg = (index: number, key: string, value: unknown) => {
        const newOps = [...operators];
        newOps[index] = {
            ...newOps[index],
            args: { ...newOps[index].args, [key]: value },
        };
        onChange(newOps);
    };

    const removeOperator = (index: number) => {
        onChange(operators.filter((_, i) => i !== index));
        if (expandedIndex === index) setExpandedIndex(null);
    };

    const addOperator = (opCode: string) => {
        onChange([...operators, { op: opCode, args: {} }]);
        setAddingNew(false);
        setExpandedIndex(operators.length); // Expand the newly added one
    };

    const moveOperator = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= operators.length) return;
        const newOps = [...operators];
        [newOps[index], newOps[newIndex]] = [newOps[newIndex], newOps[index]];
        onChange(newOps);
        setExpandedIndex(newIndex);
    };

    return (
        <Card>
            <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Transform Operators ({operators.length})</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setAddingNew(!addingNew)}>
                        {addingNew ? 'Cancel' : '+ Add Operator'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-2">
                {/* Add new operator */}
                {addingNew && (
                    <div className="p-3 border border-dashed rounded-md bg-muted/30">
                        <Label className="text-xs">Select operator to add:</Label>
                        <Select onValueChange={addOperator}>
                            <SelectTrigger className="mt-1">
                                <SelectValue placeholder="Choose operator..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableOperators.map(op => (
                                    <SelectItem key={op.code} value={op.code}>
                                        <div>
                                            <div className="font-medium">{op.name}</div>
                                            {op.description && (
                                                <div className="text-xs text-muted-foreground">{op.description}</div>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Operator list */}
                {operators.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No operators configured. Click "Add Operator" to add one.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {operators.map((op, index) => {
                            const isExpanded = expandedIndex === index;
                            const operatorMeta = availableOperators.find(a => a.code === op.op);
                            const argEntries = Object.entries(op.args || {});

                            return (
                                <div
                                    key={index}
                                    className={`border rounded-md transition-colors ${isExpanded ? 'border-primary/40 bg-muted/50' : 'border-border bg-background hover:bg-muted/30'}`}
                                >
                                    {/* Header */}
                                    <div
                                        className="flex items-center justify-between p-2.5 cursor-pointer"
                                        onClick={() => setExpandedIndex(isExpanded ? null : index)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-muted-foreground/70 w-4">{index + 1}</span>
                                            <span className="text-xs text-muted-foreground">{isExpanded ? '▼' : '▶'}</span>
                                            <span className="font-medium text-sm">{op.op}</span>
                                            {!isExpanded && argEntries.length > 0 && (
                                                <span className="text-xs text-muted-foreground ml-1">
                                                    ({argEntries.map(([k]) => k).join(', ')})
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                onClick={(e) => { e.stopPropagation(); moveOperator(index, 'up'); }}
                                                disabled={index === 0}
                                            >
                                                ↑
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                onClick={(e) => { e.stopPropagation(); moveOperator(index, 'down'); }}
                                                disabled={index === operators.length - 1}
                                            >
                                                ↓
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 text-destructive"
                                                onClick={(e) => { e.stopPropagation(); removeOperator(index); }}
                                            >
                                                ×
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Expanded content */}
                                    {isExpanded && (
                                        <div className="px-3 pb-3 pt-2 border-t border-border/50 space-y-3">
                                            {/* Operator type selector */}
                                            <div>
                                                <Label className="text-xs">Operator Type</Label>
                                                <Select
                                                    value={op.op}
                                                    onValueChange={(v) => updateOperator(index, { op: v })}
                                                >
                                                    <SelectTrigger className="mt-1">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {availableOperators.map(a => (
                                                            <SelectItem key={a.code} value={a.code}>{a.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Args editor */}
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs">Arguments</Label>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-xs"
                                                        onClick={() => {
                                                            const key = prompt('Enter argument key:');
                                                            if (key) updateOperatorArg(index, key, '');
                                                        }}
                                                    >
                                                        + Add Arg
                                                    </Button>
                                                </div>
                                                {argEntries.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground mt-1">No arguments configured.</p>
                                                ) : (
                                                    <div className="mt-2 space-y-2">
                                                        {argEntries.map(([key, value]) => (
                                                            <div key={key} className="flex items-start gap-2">
                                                                <div className="flex-1">
                                                                    <Label className="text-[11px] text-muted-foreground">{key}</Label>
                                                                    {typeof value === 'object' ? (
                                                                        <Textarea
                                                                            className="font-mono text-xs mt-0.5"
                                                                            rows={3}
                                                                            value={JSON.stringify(value, null, 2)}
                                                                            onChange={(e) => {
                                                                                try {
                                                                                    updateOperatorArg(index, key, JSON.parse(e.target.value));
                                                                                } catch {
                                                                                    // Keep as string if invalid JSON
                                                                                    updateOperatorArg(index, key, e.target.value);
                                                                                }
                                                                            }}
                                                                        />
                                                                    ) : (
                                                                        <Input
                                                                            className="mt-0.5 text-sm"
                                                                            value={String(value ?? '')}
                                                                            onChange={(e) => updateOperatorArg(index, key, e.target.value)}
                                                                        />
                                                                    )}
                                                                </div>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 w-6 p-0 mt-5 text-destructive"
                                                                    onClick={() => {
                                                                        const newArgs = { ...op.args };
                                                                        delete newArgs[key];
                                                                        updateOperator(index, { args: newArgs });
                                                                    }}
                                                                >
                                                                    ×
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

