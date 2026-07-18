import * as fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDataHubConfigFile } from './config-file.utils';

vi.mock('fs');

describe('loadDataHubConfigFile', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fails closed when an explicitly configured file is missing', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        expect(() => loadDataHubConfigFile('/config/data-hub.yaml')).toThrow(
            'DataHub config file not found',
        );
    });

    it('rejects unsupported extensions', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('secrets: []');

        expect(() => loadDataHubConfigFile('/config/data-hub.toml')).toThrow(
            'Unsupported DataHub config file extension',
        );
    });

    it('rejects malformed content', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('{');

        expect(() => loadDataHubConfigFile('/config/data-hub.json')).toThrow(
            'Could not parse DataHub config file',
        );
    });

    it('rejects a non-object root value', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('[]');

        expect(() => loadDataHubConfigFile('/config/data-hub.json')).toThrow(
            'must contain an object at its root',
        );
    });
});
