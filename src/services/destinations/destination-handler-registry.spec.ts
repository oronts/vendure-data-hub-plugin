import { beforeEach, describe, expect, it, vi } from 'vitest';
import { secureFetch } from '../../utils/secure-fetch.utils';
import { assertUrlSafe } from '../../utils/url-security.utils';
import {
    DESTINATION_TEST_REGISTRY,
} from './destination-handler-registry';
import {
    DESTINATION_TYPE,
    type ResolvedHTTPDestinationConfig,
} from './destination.types';

vi.mock('../../utils/secure-fetch.utils', () => ({
    secureFetch: vi.fn(),
}));

vi.mock('../../utils/url-security.utils', () => ({
    assertUrlSafe: vi.fn(),
}));

const config: ResolvedHTTPDestinationConfig = {
    id: 'partner',
    name: 'Partner',
    type: 'HTTP',
    url: 'https://partner.example.com/import',
};

function getHttpTestHandler() {
    const handler = DESTINATION_TEST_REGISTRY.get(DESTINATION_TYPE.HTTP);
    if (!handler) throw new Error('HTTP destination test handler is not registered');
    return handler;
}

describe('HTTP destination connectivity test', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        { ok: true, status: 204, success: true, message: 'HTTP endpoint reachable (204)' },
        { ok: false, status: 503, success: false, message: 'HTTP endpoint returned 503' },
    ])('reports HTTP status $status and releases the response body', async expected => {
        const cancel = vi.fn(async () => undefined);
        vi.mocked(secureFetch).mockResolvedValue({
            body: { cancel },
            ok: expected.ok,
            status: expected.status,
        } as unknown as Response);

        await expect(getHttpTestHandler()(config, Date.now())).resolves.toMatchObject({
            success: expected.success,
            message: expected.message,
        });
        expect(assertUrlSafe).toHaveBeenCalledWith(config.url);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it('preserves transport errors for the service-level result', async () => {
        vi.mocked(secureFetch).mockRejectedValue(new Error('connect timed out'));

        await expect(getHttpTestHandler()(config, Date.now())).rejects.toThrow(
            'connect timed out',
        );
    });
});
