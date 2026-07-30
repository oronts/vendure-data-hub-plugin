import { describe, expect, it } from 'vitest';
import { DataHubDestinationType } from '../../gql/graphql';
import type { DestinationSchema } from '../../hooks/api/use-config-options';
import {
    createManagedDestinationDraft,
    prepareManagedDestinationInput,
    validateManagedDestinationDraft,
    type DestinationMessageFormatter,
} from './destination-form';

const formatMessage: DestinationMessageFormatter = (id, values) => [
    id,
    ...Object.values(values ?? {}),
].join('|');

const sftpSchema: DestinationSchema = {
    type: 'SFTP',
    label: 'SFTP',
    configKey: 'sftpConfig',
    fields: [
        { key: 'host', label: 'Host', type: 'text', required: true },
        { key: 'port', label: 'Port', type: 'number', defaultValue: 22, required: true },
        { key: 'username', label: 'Username', type: 'text', required: true },
        { key: 'passwordSecretCode', label: 'Password', type: 'secret' },
        { key: 'privateKeySecretCode', label: 'Private key', type: 'secret' },
        { key: 'remotePath', label: 'Remote path', type: 'text', required: true },
    ],
};

describe('managed destination form', () => {
    it('creates schema defaults in the wizard destination config', () => {
        const draft = createManagedDestinationDraft('SFTP', sftpSchema);

        expect(draft.destination).toEqual({
            type: 'SFTP',
            sftpConfig: { port: 22 },
        });
        expect(draft.enabled).toBe(true);
    });

    it('validates identifiers, schema fields, and SFTP credential references', () => {
        const draft = createManagedDestinationDraft('SFTP', sftpSchema);
        draft.id = 'not valid';
        draft.name = 'Partner SFTP';
        draft.destination.sftpConfig = {
            host: 'sftp.example.com',
            port: 22,
            username: 'feed',
            remotePath: '/incoming',
        };

        expect(validateManagedDestinationDraft(draft, sftpSchema, formatMessage)).toEqual({
            isValid: false,
            errors: {
                id: 'destinations.validation.idPattern',
                passwordSecretCode: 'destinations.validation.sftpCredential',
            },
        });
    });

    it('flattens schema configuration and omits empty optional values', () => {
        const draft = createManagedDestinationDraft('SFTP', sftpSchema);
        draft.id = 'partner-sftp';
        draft.name = ' Partner SFTP ';
        draft.destination.sftpConfig = {
            host: ' sftp.example.com ',
            port: 22,
            username: 'feed',
            passwordSecretCode: 'partner-password',
            privateKeySecretCode: '',
            remotePath: '/incoming',
            timeout: 0,
        };

        expect(prepareManagedDestinationInput(draft, sftpSchema)).toEqual({
            id: 'partner-sftp',
            name: 'Partner SFTP',
            enabled: true,
            type: DataHubDestinationType.SFTP,
            host: 'sftp.example.com',
            port: 22,
            username: 'feed',
            passwordSecretCode: 'partner-password',
            remotePath: '/incoming',
            timeout: 0,
        });
    });

    it('rejects invalid ports, URLs, and incompatible authentication fields', () => {
        const schema: DestinationSchema = {
            type: 'HTTP',
            label: 'HTTP',
            configKey: 'httpConfig',
            fields: [
                { key: 'url', label: 'URL', type: 'text', required: true },
                { key: 'auth.type', label: 'Authentication', type: 'select', defaultValue: 'NONE' },
                { key: 'auth.secretCode', label: 'Secret', type: 'secret' },
                { key: 'auth.username', label: 'Username', type: 'text' },
            ],
        };
        const draft = createManagedDestinationDraft('HTTP', schema);
        draft.id = 'http-partner';
        draft.name = 'HTTP Partner';
        draft.destination.httpConfig = {
            url: 'https://user:password@example.com/import',
            auth: {
                type: 'NONE',
                secretCode: 'should-not-be-used',
                username: 'feed',
            },
        };

        expect(validateManagedDestinationDraft(draft, schema, formatMessage)).toEqual({
            isValid: false,
            errors: {
                url: 'destinations.validation.httpUrl|URL',
                'auth.type': 'destinations.validation.noAuthCredentials',
                'auth.username': 'destinations.validation.authUsernameUnsupported|NONE',
            },
        });
    });

    it('preserves backend field labels in localized validation parameters', () => {
        const draft = createManagedDestinationDraft('SFTP', sftpSchema);

        expect(validateManagedDestinationDraft(draft, sftpSchema, formatMessage).errors).toMatchObject({
            host: 'destinations.validation.fieldRequired|Host',
            username: 'destinations.validation.fieldRequired|Username',
            remotePath: 'destinations.validation.fieldRequired|Remote path',
        });
    });
});
