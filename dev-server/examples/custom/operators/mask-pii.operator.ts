import { JsonObject, SingleRecordOperator, AdapterOperatorHelpers, StepConfigSchema } from '../../../../src';

export const maskPiiSchema: StepConfigSchema = {
    fields: [
        { key: 'field', type: 'string', label: 'Field to Mask', required: true, placeholder: 'email' },
        {
            key: 'type',
            type: 'select',
            label: 'PII Type',
            required: true,
            options: [
                { value: 'email', label: 'Email Address' },
                { value: 'phone', label: 'Phone Number' },
                { value: 'name', label: 'Person Name' },
                { value: 'creditCard', label: 'Credit Card' },
                { value: 'ssn', label: 'SSN/National ID' },
                { value: 'full', label: 'Full Redaction' },
            ],
        },
        { key: 'preserveLength', type: 'boolean', label: 'Preserve Length', required: false, defaultValue: false },
        { key: 'maskChar', type: 'string', label: 'Mask Character', required: false, defaultValue: '*' },
    ],
};

type PiiType = 'email' | 'phone' | 'name' | 'creditCard' | 'ssn' | 'full';

interface MaskPiiConfig {
    field: string;
    type: PiiType;
    preserveLength?: boolean;
    maskChar?: string;
}

function maskEmail(email: string, maskChar: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const [local, domain] = parts;
    if (local.length <= 1) return email;
    return `${local[0]}${maskChar.repeat(3)}@${domain}`;
}

function maskPhone(phone: string, maskChar: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return maskChar.repeat(phone.length);
    return `${maskChar.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function maskName(name: string, maskChar: string): string {
    return name.split(' ').map(part => part.length <= 1 ? part : part[0] + maskChar.repeat(part.length - 1)).join(' ');
}

function maskCreditCard(card: string, maskChar: string): string {
    const digits = card.replace(/\D/g, '');
    if (digits.length < 4) return maskChar.repeat(card.length);
    return `${maskChar.repeat(4)}-${maskChar.repeat(4)}-${maskChar.repeat(4)}-${digits.slice(-4)}`;
}

function maskSsn(ssn: string, maskChar: string): string {
    const digits = ssn.replace(/\D/g, '');
    if (digits.length < 4) return maskChar.repeat(ssn.length);
    return `${maskChar.repeat(3)}-${maskChar.repeat(2)}-${digits.slice(-4)}`;
}

export const maskPiiOperator: SingleRecordOperator<MaskPiiConfig> = {
    type: 'OPERATOR',
    code: 'maskPII',
    name: 'Mask PII',
    description: 'Mask personally identifiable information for privacy compliance',
    category: 'utility',
    pure: true,
    schema: maskPiiSchema,
    icon: 'shield-check',
    version: '1.0.0',

    applyOne(record: JsonObject, config: MaskPiiConfig, helpers: AdapterOperatorHelpers): JsonObject | null {
        const { field, type, maskChar = '*' } = config;
        const value = helpers.get(record, field);
        if (value === undefined || value === null) return record;

        const strValue = String(value);
        let masked: string;

        switch (type) {
            case 'email': masked = maskEmail(strValue, maskChar); break;
            case 'phone': masked = maskPhone(strValue, maskChar); break;
            case 'name': masked = maskName(strValue, maskChar); break;
            case 'creditCard': masked = maskCreditCard(strValue, maskChar); break;
            case 'ssn': masked = maskSsn(strValue, maskChar); break;
            case 'full':
            default: masked = maskChar.repeat(strValue.length); break;
        }

        const result = { ...record };
        helpers.set(result, field, masked);
        return result;
    },
};

export default maskPiiOperator;
