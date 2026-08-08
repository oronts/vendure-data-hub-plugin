import { describe, expect, it, vi } from 'vitest';
import type { ExtractorContext } from '../../types';
import { DatabaseType } from '../../constants';
import {
    parseDatabaseConnectionString,
    resolveDatabaseEndpoint,
} from './database-endpoint';

const context = {
    secrets: { get: vi.fn() },
} as unknown as ExtractorContext;

describe('database endpoint normalization', () => {
    it('normalizes documented PostgreSQL and MySQL TCP URIs', () => {
        expect(parseDatabaseConnectionString(
            'postgresql://catalog%20user:p%40ss@db.example.com:5544/catalog%20db',
            DatabaseType.POSTGRESQL,
        )).toEqual({
            hostname: 'db.example.com',
            port: 5544,
            database: 'catalog db',
            username: 'catalog user',
            password: 'p@ss',
        });
        expect(parseDatabaseConnectionString(
            'mysql://user:secret@mysql.example.com/catalog',
            DatabaseType.MYSQL,
        )).toEqual({
            hostname: 'mysql.example.com',
            port: 3306,
            database: 'catalog',
            username: 'user',
            password: 'secret',
        });
    });

    it.each([
        'postgres://user:secret@db.example.com/catalog?host=127.0.0.1',
        'postgres://user:secret@db.example.com/catalog?host=%2Fvar%2Frun%2Fpostgresql',
        'mysql://user:secret@db.example.com/catalog?socketPath=%2Ftmp%2Fmysql.sock',
    ])('rejects endpoint-changing URI parameters without exposing credentials: %s', uri => {
        let message = '';
        try {
            parseDatabaseConnectionString(
                uri,
                uri.startsWith('mysql:') ? DatabaseType.MYSQL : DatabaseType.POSTGRESQL,
            );
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }

        expect(message).toContain('query parameters');
        expect(message).not.toContain('user:secret');
    });

    it.each([
        ['host=db.example.com dbname=catalog', DatabaseType.POSTGRESQL],
        ['file:///tmp/catalog.db', DatabaseType.POSTGRESQL],
        ['postgres://db.example.com', DatabaseType.POSTGRESQL],
        ['postgres://db.example.com/catalog', DatabaseType.MYSQL],
    ] as const)('rejects unsupported or incomplete connection strings', (uri, type) => {
        expect(() => parseDatabaseConnectionString(uri, type)).toThrow();
    });

    it('treats a connection string as the complete endpoint contract', async () => {
        vi.mocked(context.secrets.get).mockResolvedValueOnce(
            'postgres://uri-user:uri-password@uri.example.com:5544/uri-db',
        );

        await expect(resolveDatabaseEndpoint(context, {
            databaseType: DatabaseType.POSTGRESQL,
            host: 'ignored.example.com',
            port: 5432,
            database: 'ignored-db',
            username: 'ignored-user',
            passwordSecretCode: 'ignored-password',
            connectionStringSecretCode: 'database-uri',
            query: 'SELECT 1',
        }, DatabaseType.POSTGRESQL)).resolves.toEqual({
            hostname: 'uri.example.com',
            port: 5544,
            database: 'uri-db',
            username: 'uri-user',
            password: 'uri-password',
        });
        expect(context.secrets.get).toHaveBeenCalledTimes(1);
    });
});
