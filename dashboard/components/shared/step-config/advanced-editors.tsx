import * as React from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@vendure/dashboard';
import { COMPARISON_OPERATORS, getOperatorPlaceholder, MOVE_DIRECTION, ERROR_MESSAGES } from '../../../constants';
import type { MoveDirection } from '../../../constants';
import { OperatorCard, OperatorConfig, StepOperatorDefinition } from './OperatorCard';
import { generateStableKey } from '../../../utils';

export type { OperatorConfig, StepOperatorDefinition } from './OperatorCard';
export type { OperatorSchemaField } from './OperatorFieldInput';

type JsonRecord = Record<string, unknown>;

interface MapEditorConfig extends JsonRecord {
    mapping?: Record<string, string>;
}

interface TemplateEditorConfig extends JsonRecord {
    template?: string;
    target?: string;
}

interface RuleCondition {
    field?: string;
    cmp?: string;
    value?: unknown;
}

interface RuleGroup {
    logic: 'AND' | 'OR';
    rules: RuleCondition[];
}

interface WhenEditorConfig extends JsonRecord {
    conditions?: RuleCondition[] | RuleGroup[];
    action?: 'keep' | 'drop';
    combine?: 'AND' | 'OR';
}

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

    const mappingValid = React.useMemo(() => { try { JSON.parse(mappingText); return true; } catch { return false; } }, [mappingText]);
    const sampleValid = React.useMemo(() => { try { const v = JSON.parse(sample); return Array.isArray(v); } catch { return false; } }, [sample]);

    function apply() {
        try {
            const mapping = JSON.parse(mappingText);
            onChange({ ...config, mapping });
        } catch {
            // JSON parse failed - ignore invalid mapping text
        }
    }
    function preview(): Array<JsonRecord> {
        try {
            const rows = JSON.parse(sample);
            const mapping = JSON.parse(mappingText);
            if (!Array.isArray(rows) || typeof mapping !== 'object') return [];
            return rows.map((row: JsonRecord) => {
                const out: JsonRecord = {};
                for (const [dst, src] of Object.entries(mapping)) {
                    out[dst] = src ? String(src).split('.').reduce((o: unknown, k) => {
                        if (o && typeof o === 'object' && k in (o as JsonRecord)) {
                            return (o as JsonRecord)[k];
                        }
                        return undefined;
                    }, row as unknown) : undefined;
                }
                return out;
            });
        } catch {
            return [];
        }
    }
    const result = preview();
    const first = React.useMemo(() => { try { const r = JSON.parse(sample); return Array.isArray(r) ? r[0] : null; } catch { return null; } }, [sample]);
    const pathList = React.useMemo(() => (first ? collectPaths(first) : []), [first]);
    function addMappingFromSelection() {
        if (!selectedPath || !destKey) return;
        try {
            const m = (JSON.parse(mappingText) || {}) as Record<string, string>;
            m[String(destKey)] = selectedPath;
            setMappingText(JSON.stringify(m, null, 2));
        } catch {
            // JSON parse failed - ignore invalid mapping text
        }
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
                        <Label className="text-xs font-medium">Mapping (JSON)</Label>
                        <Textarea className="font-mono text-xs min-h-[140px]" value={mappingText} onChange={e => setMappingText(e.target.value)} />
                        {!mappingValid && (<p className="text-[11px] text-destructive mt-1">{ERROR_MESSAGES.INVALID_MAPPING_JSON}</p>)}
                        <div className="mt-2 flex gap-2">
                            <Button variant="outline" size="sm" onClick={apply} disabled={!mappingValid}>Apply</Button>
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs font-medium">Sample Input (JSON array)</Label>
                        <Textarea className="font-mono text-xs min-h-[140px]" value={sample} onChange={e => setSample(e.target.value)} />
                        {!sampleValid && (<p className="text-[11px] text-amber-600 mt-1">Enter a valid JSON array of records</p>)}
                        {pathList.length > 0 && (
                            <div className="mt-2">
                                <Label className="text-xs font-medium">Field Picker</Label>
                                <div className="border rounded p-2 max-h-32 overflow-auto">
                                    <div className="grid grid-cols-1 gap-1">
                                        {pathList.map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                className={`text-[11px] text-left px-2 py-1 rounded ${selectedPath === p ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                                                onClick={() => setSelectedPath(p)}
                                                aria-pressed={selectedPath === p}
                                                aria-label={`Select field path ${p}`}
                                            >
                                                {p}
                                            </button>
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
                    <Label className="text-xs font-medium">Preview</Label>
                    <div className="border rounded p-2 max-h-48 overflow-auto bg-muted/50">
                        <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
                    </div>
                    {(!mappingValid || !sampleValid) && (<p className="text-[11px] text-muted-foreground mt-1">Preview may be empty until mapping and sample are valid</p>)}
                </div>
                {first && result?.[0] && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs font-medium">Before (first record)</Label>
                            <div className="border rounded p-2 max-h-48 overflow-auto bg-muted/30">
                                <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all">{JSON.stringify(first, null, 2)}</pre>
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs font-medium">After (first mapped)</Label>
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
            try { t.setSelectionRange(pos, pos); } catch { /* Selection range not supported */ }
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
                            <Label className="text-xs font-medium">Template</Label>
                            <span className="text-[10px] text-muted-foreground">{template.length} chars</span>
                        </div>
                        <Textarea ref={templateRef} className="font-mono text-xs min-h-[100px]" value={template} onChange={e => setTemplate(e.target.value)} />
                        <p className="text-[11px] text-muted-foreground">Use {'${path}'} placeholders, e.g. {'${name}'}, {'${category.code}'}</p>
                        <Label className="text-xs font-medium">Target path</Label>
                        <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="title" />
                        <div className="mt-2 flex gap-2">
                            <Button variant="outline" size="sm" onClick={apply}>Apply</Button>
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs font-medium">Sample Record (JSON)</Label>
                        <Textarea className="font-mono text-xs min-h-[120px]" value={sample} onChange={e => setSample(e.target.value)} />
                        {paths.length > 0 && (
                            <div className="mt-2">
                                <Label className="text-xs font-medium">Quick insert</Label>
                                <div className="border rounded p-2 max-h-28 overflow-auto">
                                    {paths.map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            className="block w-full text-left text-[11px] px-2 py-1 rounded hover:bg-muted"
                                            onClick={() => insertPath(p)}
                                            aria-label={`Insert ${p} at cursor`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div>
                    <Label className="text-xs font-medium">Preview</Label>
                    <div className="border rounded p-2 bg-muted/50">
                        <pre className="text-[11px] leading-tight whitespace-pre-wrap break-all">{render()}</pre>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function useGroupKeys(groups: RuleGroup[]): string[] {
    const keysRef = React.useRef<Map<RuleGroup, string>>(new Map());
    groups.forEach(group => {
        if (!keysRef.current.has(group)) {
            keysRef.current.set(group, generateStableKey('group'));
        }
    });
    return groups.map(g => keysRef.current.get(g) ?? generateStableKey('group'));
}

function useRuleKeys(rules: RuleCondition[]): string[] {
    const keysRef = React.useRef<Map<RuleCondition, string>>(new Map());
    rules.forEach(rule => {
        if (!keysRef.current.has(rule)) {
            keysRef.current.set(rule, generateStableKey('rule'));
        }
    });
    return rules.map(r => keysRef.current.get(r) ?? generateStableKey('rule'));
}

export function AdvancedWhenEditor({ config, onChange }: { config: JsonRecord; onChange: (values: JsonRecord) => void }) {
    const typedConfig = config as WhenEditorConfig;
    const rawConds = Array.isArray(typedConfig.conditions) ? typedConfig.conditions : [];
    const isGrouped = rawConds.length > 0 && typeof rawConds[0] === 'object' && 'rules' in (rawConds[0] as object);
    const groups: RuleGroup[] = isGrouped ? (rawConds as RuleGroup[]) : [{ logic: 'AND', rules: rawConds as RuleCondition[] }];
    const action = typedConfig.action ?? 'keep';
    const combine: LogicType = typedConfig.combine === 'OR' ? 'OR' : 'AND';
    const groupKeys = useGroupKeys(groups);

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
                    <Label className="text-xs font-medium">Action</Label>
                    <Select value={action} onValueChange={(v) => onChange({ ...config, action: v })}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="keep">Keep matches</SelectItem>
                            <SelectItem value="drop">Drop matches</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 ml-auto">
                        <Label className="text-xs font-medium">Combine Groups</Label>
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
                        <RuleGroupCard
                            key={groupKeys[gi]}
                            group={g}
                            groupIndex={gi}
                            onUpdateLogic={(logic) => updateGroupLogic(gi, logic)}
                            onRemoveGroup={() => removeGroup(gi)}
                            onAddRule={() => addRule(gi)}
                            onUpdateRule={(ri, patch) => updateRule(gi, ri, patch)}
                            onRemoveRule={(ri) => removeRule(gi, ri)}
                        />
                    ))}
                    <Button variant="outline" size="sm" onClick={addGroup}>Add group</Button>
                </div>
            </CardContent>
        </Card>
    );
}

interface RuleGroupCardProps {
    group: RuleGroup;
    groupIndex: number;
    onUpdateLogic: (logic: LogicType) => void;
    onRemoveGroup: () => void;
    onAddRule: () => void;
    onUpdateRule: (ruleIndex: number, patch: Partial<RuleCondition>) => void;
    onRemoveRule: (ruleIndex: number) => void;
}

function RuleGroupCard({ group: g, groupIndex: gi, onUpdateLogic, onRemoveGroup, onAddRule, onUpdateRule, onRemoveRule }: RuleGroupCardProps) {
    const ruleKeys = useRuleKeys(g.rules);

    return (
                        <div className="border rounded p-2 space-y-2">
                            <div className="flex items-center gap-2">
                                <Label className="text-xs font-medium">Group {gi + 1}</Label>
                                <Select value={g.logic} onValueChange={(v) => onUpdateLogic(v as LogicType)}>
                                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AND">AND</SelectItem>
                                        <SelectItem value="OR">OR</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={onRemoveGroup}>
                                    Remove
                                </Button>
                                <Button variant="outline" size="sm" onClick={onAddRule}>Add rule</Button>
                            </div>
                            <div className="space-y-2">
                                {g.rules.map((c, ri) => (
                                    <div key={ruleKeys[ri]} className="grid grid-cols-[1fr,140px,1fr,auto] gap-2 items-center">
                                        <Input value={String(c.field ?? '')} onChange={e => onUpdateRule(ri, { field: e.target.value })} placeholder="path.to.field" />
                                        <Select value={String(c.cmp ?? 'eq')} onValueChange={(v) => onUpdateRule(ri, { cmp: v })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {COMPARISON_OPERATORS.map(op => (
                                                    <SelectItem key={op.code} value={op.code}>{op.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {(() => {
                                            const cmp = String(c.cmp ?? 'eq');
                                            const placeholder = getOperatorPlaceholder(cmp);
                                            const valStr = Array.isArray(c.value) ? JSON.stringify(c.value) : String(c.value ?? '');
                                            const onValChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                                                const txt = e.target.value;
                                                if (cmp === 'in') {
                                                    try { onUpdateRule(ri, { value: JSON.parse(txt) }); } catch { onUpdateRule(ri, { value: txt }); }
                                                } else {
                                                    onUpdateRule(ri, { value: txt });
                                                }
                                            };
                                            const regexError = cmp === 'regex' ? (() => { try { new RegExp(String(c.value ?? '')); return ''; } catch (err: unknown) { return err instanceof Error ? err.message : 'Invalid regex'; } })() : '';
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
                                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onRemoveRule(ri)}>Remove</Button>
                                    </div>
                                ))}
                                {g.rules.length === 0 && (<p className="text-xs text-muted-foreground">No rules in this group.</p>)}
                            </div>
                        </div>
    );
}

interface MultiOperatorEditorProps {
    operators: OperatorConfig[];
    availableOperators: StepOperatorDefinition[];
    onChange: (operators: OperatorConfig[]) => void;
}

function useOperatorKeys(operators: OperatorConfig[]): string[] {
    const keysRef = React.useRef(new WeakMap<OperatorConfig, string>());
    operators.forEach(op => {
        const existingKey = keysRef.current.get(op);
        if (!existingKey) {
            keysRef.current.set(op, generateStableKey('op'));
        }
    });
    return operators.map(op => keysRef.current.get(op) ?? generateStableKey('op'));
}

/**
 * Multi-operator editor that displays a list of configurable operators.
 * Uses OperatorCard for individual operator display and OperatorFieldInput for field rendering.
 */
export function MultiOperatorEditor({ operators, availableOperators, onChange }: MultiOperatorEditorProps) {
    const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);
    const [addingNew, setAddingNew] = React.useState(false);
    const operatorKeys = useOperatorKeys(operators);

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
        const operatorDef = availableOperators.find(a => a.code === opCode);
        const initialArgs: Record<string, unknown> = {};

        if (operatorDef?.schema?.fields) {
            for (const field of operatorDef.schema.fields) {
                if (field.defaultValue !== undefined) {
                    initialArgs[field.key] = field.defaultValue;
                } else if (field.required) {
                    initialArgs[field.key] = '';
                }
            }
        }

        onChange([...operators, { op: opCode, args: initialArgs }]);
        setAddingNew(false);
        setExpandedIndex(operators.length);
    };

    const moveOperator = (index: number, direction: MoveDirection) => {
        const newIndex = direction === MOVE_DIRECTION.UP ? index - 1 : index + 1;
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

                {operators.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No operators configured. Click "Add Operator" to add one.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {operators.map((op, index) => (
                            <OperatorCard
                                key={operatorKeys[index]}
                                operator={op}
                                index={index}
                                isExpanded={expandedIndex === index}
                                totalCount={operators.length}
                                availableOperators={availableOperators}
                                onToggleExpand={() => setExpandedIndex(expandedIndex === index ? null : index)}
                                onUpdate={(updates) => updateOperator(index, updates)}
                                onUpdateArg={(key, value) => updateOperatorArg(index, key, value)}
                                onRemove={() => removeOperator(index)}
                                onMove={(direction) => moveOperator(index, direction)}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
