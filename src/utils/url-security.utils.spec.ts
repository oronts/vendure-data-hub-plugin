import { describe, expect, it } from 'vitest';
import { validateUrlSafety } from './url-security.utils';

describe('URL security IPv6 literals', () => {
    it('validates a public bracketed IPv6 URL as an IP literal', async () => {
        await expect(validateUrlSafety('https://[2606:4700:4700::1111]/')).resolves.toEqual({
            safe: true,
            resolvedIPs: ['2606:4700:4700::1111'],
        });
    });

    it('blocks a private bracketed IPv6 URL without attempting DNS resolution', async () => {
        await expect(validateUrlSafety('https://[::1]/')).resolves.toMatchObject({
            safe: false,
            reason: expect.stringContaining("Hostname '::1' is blocked"),
        });
    });
});
