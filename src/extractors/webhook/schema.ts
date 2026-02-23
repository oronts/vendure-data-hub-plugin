import { StepConfigSchema } from '../../../shared/types';
import { SIGNATURE_ALGORITHM_OPTIONS } from '../../constants/adapter-schema-options';

export const WEBHOOK_EXTRACTOR_SCHEMA: StepConfigSchema = {
    fields: [
        {
            key: 'dataPath',
            label: 'Data Path',
            description: 'JSON path to records array in webhook payload',
            type: 'string',
            placeholder: 'data.records',
        },
        {
            key: 'idempotencyKeyField',
            label: 'Idempotency Key Field',
            description: 'Field to use for deduplication',
            type: 'string',
            placeholder: 'id',
        },
        {
            key: 'validateSignature',
            label: 'Validate Signature',
            description: 'Validate webhook signature',
            type: 'boolean',
            defaultValue: false,
        },
        {
            key: 'signatureSecretCode',
            label: 'Signature Secret',
            description: 'Secret code for signature validation',
            type: 'secret',
            dependsOn: { field: 'validateSignature', value: true },
        },
        {
            key: 'signatureHeader',
            label: 'Signature Header',
            description: 'Header containing signature',
            type: 'string',
            defaultValue: 'X-Hub-Signature-256',
            dependsOn: { field: 'validateSignature', value: true },
        },
        {
            key: 'signatureAlgorithm',
            label: 'Signature Algorithm',
            type: 'select',
            options: SIGNATURE_ALGORITHM_OPTIONS,
            defaultValue: 'sha256',
            dependsOn: { field: 'validateSignature', value: true },
        },
        {
            key: 'wrapSingleRecord',
            label: 'Wrap Single Record',
            description: 'Wrap single object in array',
            type: 'boolean',
            defaultValue: true,
        },
    ],
};
