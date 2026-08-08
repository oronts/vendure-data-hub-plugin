export interface TransformSummaryMessages {
    empty: string;
    remove: (fields: string) => string;
    keep: (fields: string) => string;
    rule: (action: string, count: number) => string;
    lookup: (field: string) => string;
    fields: (count: number) => string;
}

export function summarizeConfig(
    type: string,
    config: Record<string, unknown>,
    messages: TransformSummaryMessages,
): string {
    const entries = Object.entries(config).filter(([, value]) => value != null && value !== '');
    if (entries.length === 0) return '';
    if ((type === 'rename' || type === 'copy') && config.from && config.to) {
        return `${config.from} → ${config.to}`;
    }
    if (type === 'set' && config.field) {
        const value = config.value != null
            ? String(config.value)
            : messages.empty;
        return `${config.field} = ${value.length > 20 ? value.slice(0, 20) + '…' : value}`;
    }
    if (type === 'remove' && (config.fields || config.field)) {
        const fields = config.fields ?? config.field;
        return messages.remove(Array.isArray(fields) ? fields.join(', ') : String(fields));
    }
    if (type === 'pick' && config.fields) {
        return messages.keep(
            Array.isArray(config.fields) ? config.fields.join(', ') : String(config.fields),
        );
    }
    if (type === 'template' && config.template) {
        const template = String(config.template);
        return template.length > 30 ? template.slice(0, 30) + '…' : template;
    }
    if ((type === 'filter' || type === 'when') && config.action) {
        const ruleCount = Array.isArray(config.conditions) ? config.conditions.length : 0;
        return messages.rule(String(config.action), ruleCount);
    }
    if (type === 'lookup' && config.field) {
        return messages.lookup(String(config.field));
    }
    if (type === 'dateParse' && config.field) {
        return `${config.field}${config.format ? ` (${config.format})` : ''}`;
    }
    if (entries.length <= 2) {
        return entries.map(([key, value]) => {
            const stringValue = String(value);
            return `${key}: ${stringValue.length > 15 ? stringValue.slice(0, 15) + '…' : stringValue}`;
        }).join(', ');
    }
    return messages.fields(entries.length);
}
