export type JsonRecord = Record<string, unknown>;

export interface MapEditorConfig extends JsonRecord {
    mapping?: unknown;
    passthrough?: boolean;
}

export interface TemplateEditorConfig extends JsonRecord {
    template?: string;
    target?: string;
    missingAsEmpty?: boolean;
}

export interface RuleCondition {
    field?: string;
    cmp?: string;
    value?: unknown;
}

export interface WhenEditorConfig extends JsonRecord {
    conditions?: unknown[];
    action?: 'keep' | 'drop';
}
