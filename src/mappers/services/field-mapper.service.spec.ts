import { describe, expect, it } from 'vitest';
import { FieldMapperService } from './field-mapper.service';

describe('FieldMapperService date transforms', () => {
    it('maps an explicitly formatted date deterministically', () => {
        const result = new FieldMapperService().mapRecord(
            { sourceDate: '31/12/2024' },
            [{
                source: 'sourceDate',
                target: 'createdAt',
                transforms: [{
                    type: 'date',
                    date: {
                        inputFormat: 'DD/MM/YYYY',
                        outputFormat: 'YYYY-MM-DD',
                    },
                }],
            }],
        );

        expect(result).toEqual({
            success: true,
            data: { createdAt: '2024-12-31' },
            errors: [],
            warnings: [],
        });
    });

    it('reports invalid explicit-format dates without coercing them', () => {
        const result = new FieldMapperService().mapRecord(
            { sourceDate: '31/02/2024' },
            [{
                source: 'sourceDate',
                target: 'createdAt',
                transforms: [{
                    type: 'date',
                    date: { inputFormat: 'DD/MM/YYYY' },
                }],
            }],
        );

        expect(result.success).toBe(false);
        expect(result.data).toEqual({ createdAt: '31/02/2024' });
        expect(result.errors).toEqual([{
            field: 'sourceDate',
            message: 'Transform error: Date value does not match the configured input format',
            value: '31/02/2024',
        }]);
    });
});
