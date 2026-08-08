import { describe, expect, it, vi } from 'vitest';
import { secureFetch } from '../../utils/secure-fetch.utils';
import {
    configureGlobalSsrfProtection,
    validateUrlSafety,
} from '../../utils/url-security.utils';
import { SecureFetchLifecycleService } from './secure-fetch-lifecycle.service';

describe('SecureFetchLifecycleService', () => {
    it('closes dispatchers and resets the process-global SSRF policy', async () => {
        const logger = { error: vi.fn() };
        const service = new SecureFetchLifecycleService({
            createLogger: vi.fn(() => logger),
        } as never);
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

        configureGlobalSsrfProtection({ disableSsrfProtection: true });
        await secureFetch('http://127.0.0.1/resource');
        await service.onApplicationShutdown();

        expect(fetchSpy).toHaveBeenCalledOnce();
        await expect(validateUrlSafety('http://127.0.0.1/resource')).resolves.toMatchObject({
            safe: false,
        });
        expect(logger.error).not.toHaveBeenCalled();
    });
});
