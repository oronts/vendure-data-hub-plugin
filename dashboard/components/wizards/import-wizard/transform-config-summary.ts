import { IMPORT_WIZARD_TRANSLATION_IDS } from '../../../constants';

type Translate = (id: string, values?: Record<string, unknown>) => string;

export function summarizeConfig(
    type: string,
    config: Record<string, unknown>,
    translate: Translate,
): string {
    const entries = Object.entries(config).filter(([, value]) => value != null && value !== '');
    if (entries.length === 0) return '';
    if ((type === 'rename' || type === 'copy') && config.from && config.to) {
        return `${config.from} → ${config.to}`;
    }
    if (type === 'set' && config.field) {
        const value = config.value != null
            ? String(config.value)
            : translate(IMPORT_WIZARD_TRANSLATION_IDS.TRANSFORM_SUMMARY_EMPTY);
        return `${config.field} = ${value.length > 20 ? value.slice(0, 20) + '…' : value}`;
    }
    if (type === 'remove' && (config.fields || config.field)) {
        const fields = config.fields ?? config.field;
        return translate(IMPORT_WIZARD_TRANSLATION_IDS.TRANSFORM_SUMMARY_REMOVE, {
            fields: Array.isArray(fields) ? fields.join(', ') : String(fields),
        });
    }
    if (type === 'pick' && config.fields) {
        return translate(IMPORT_WIZARD_TRANSLATION_IDS.TRANSFORM_SUMMARY_KEEP, {
            fields: Array.isArray(config.fields) ? config.fields.join(', ') : String(config.fields),
        });
    }
    if (type === 'template' && config.template) {
        const template = String(config.template);
        return template.length > 30 ? template.slice(0, 30) + '…' : template;
    }
    if ((type === 'filter' || type === 'when') && config.action) {
        const ruleCount = Array.isArray(config.conditions) ? config.conditions.length : 0;
        return translate(
            ruleCount === 1
                ? IMPORT_WIZARD_TRANSLATION_IDS.TRANSFORM_SUMMARY_RULE_ONE
                : IMPORT_WIZARD_TRANSLATION_IDS.TRANSFORM_SUMMARY_RULE_MULTIPLE,
            { action: String(config.action), count: ruleCount },
        );
    }
    if (type === 'lookup' && config.field) {
        return translate(IMPORT_WIZARD_TRANSLATION_IDS.TRANSFORM_SUMMARY_LOOKUP, {
            field: String(config.field),
        });
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
    return translate(IMPORT_WIZARD_TRANSLATION_IDS.TRANSFORM_SUMMARY_FIELDS, {
        count: entries.length,
    });
}
