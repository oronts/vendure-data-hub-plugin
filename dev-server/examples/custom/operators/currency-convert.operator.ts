import { JsonObject, SingleRecordOperator, OperatorHelpers, StepConfigSchema } from '../../../../src';

const EXCHANGE_RATES: Record<string, Record<string, number>> = {
    USD: { EUR: 0.92, GBP: 0.79, JPY: 149.50, CAD: 1.36 },
    EUR: { USD: 1.09, GBP: 0.86, JPY: 162.50, CAD: 1.48 },
    GBP: { USD: 1.27, EUR: 1.16, JPY: 189.00, CAD: 1.72 },
};

export const currencyConvertSchema: StepConfigSchema = {
    fields: [
        { key: 'field', type: 'string', label: 'Price Field', required: true, placeholder: 'price' },
        {
            key: 'from',
            type: 'select',
            label: 'From Currency',
            required: true,
            options: [
                { value: 'USD', label: 'US Dollar (USD)' },
                { value: 'EUR', label: 'Euro (EUR)' },
                { value: 'GBP', label: 'British Pound (GBP)' },
            ],
        },
        {
            key: 'to',
            type: 'select',
            label: 'To Currency',
            required: true,
            options: [
                { value: 'USD', label: 'US Dollar (USD)' },
                { value: 'EUR', label: 'Euro (EUR)' },
                { value: 'GBP', label: 'British Pound (GBP)' },
            ],
        },
        { key: 'targetField', type: 'string', label: 'Target Field', required: false, placeholder: 'priceConverted' },
        { key: 'round', type: 'number', label: 'Decimal Places', required: false, defaultValue: 2 },
    ],
};

interface CurrencyConvertConfig {
    field: string;
    from: string;
    to: string;
    targetField?: string;
    round?: number;
}

export const currencyConvertOperator: SingleRecordOperator<CurrencyConvertConfig> = {
    type: 'operator',
    code: 'currencyConvert',
    name: 'Currency Convert',
    description: 'Convert currency values using exchange rates',
    category: 'conversion',
    pure: true,
    schema: currencyConvertSchema,
    icon: 'currency-exchange',
    version: '1.0.0',

    applyOne(record: JsonObject, config: CurrencyConvertConfig, helpers: OperatorHelpers): JsonObject | null {
        const { field, from, to, targetField, round = 2 } = config;
        const value = helpers.get(record, field);

        if (value === undefined || value === null) return record;

        const numValue = typeof value === 'number' ? value : parseFloat(String(value));
        if (isNaN(numValue)) return record;
        if (from === to) return record;

        const rate = EXCHANGE_RATES[from]?.[to];
        if (!rate) return record;

        const converted = Math.round(numValue * rate * Math.pow(10, round)) / Math.pow(10, round);
        const output = targetField || field;
        const result = { ...record };
        helpers.set(result, output, converted);
        return result;
    },
};

export default currencyConvertOperator;
