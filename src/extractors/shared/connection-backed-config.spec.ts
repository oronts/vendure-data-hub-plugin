import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { resolveConnectionBackedConfig } from './connection-backed-config';

function createContext(type = 'SFTP'): ExtractorContext {
    return {
        connections: {
            get: vi.fn(),
            getRequired: vi.fn(async () => ({
                code: 'incoming-sftp',
                type,
                config: {
                    host: 'files.example.com',
                    port: 22,
                    username: 'importer',
                    passwordSecretCode: 'sftp-password',
                },
            })),
        },
    } as unknown as ExtractorContext;
}

describe('connection-backed extractor config', () => {
    it('merges a saved connection while keeping step source options authoritative', async () => {
        const result = await resolveConnectionBackedConfig(createContext(), {
            connectionCode: 'incoming-sftp',
            remotePath: '/incoming',
            port: 2222,
        }, ['FTP', 'SFTP']);

        expect(result).toEqual({
            connectionType: 'SFTP',
            config: {
                connectionCode: 'incoming-sftp',
                host: 'files.example.com',
                passwordSecretCode: 'sftp-password',
                port: 2222,
                remotePath: '/incoming',
                username: 'importer',
            },
        });
    });

    it('rejects a saved connection of the wrong type', async () => {
        await expect(resolveConnectionBackedConfig(createContext('HTTP'), {
            connectionCode: 'incoming-sftp',
        }, ['FTP', 'SFTP'])).rejects.toThrow('expected FTP or SFTP');
    });

    it('leaves inline configurations unchanged', async () => {
        const config = { host: 'files.example.com' };
        await expect(resolveConnectionBackedConfig(createContext(), config, ['FTP', 'SFTP']))
            .resolves.toEqual({ config });
    });
});
