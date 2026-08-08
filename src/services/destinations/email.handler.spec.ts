import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as nodemailer from 'nodemailer';
import { deliverToEmail } from './email.handler';
import type { ResolvedEmailDestinationConfig } from './destination.types';
import { resolveSafeRemoteAddress } from '../../utils/remote-host-security.utils';

vi.mock('nodemailer', () => ({
    createTransport: vi.fn(),
}));
vi.mock('../../utils/remote-host-security.utils', () => ({
    resolveSafeRemoteAddress: vi.fn(),
}));

describe('deliverToEmail', () => {
    beforeEach(() => {
        vi.mocked(resolveSafeRemoteAddress).mockResolvedValue({
            hostname: 'smtp.example.com',
            address: '203.0.113.10',
            family: 4,
        });
    });

    it('fails closed when SMTP is not configured', async () => {
        const result = await deliverToEmail({
            type: 'EMAIL',
            id: 'email',
            name: 'Email',
            to: ['buyer@example.com'],
            subject: 'Catalog',
        } as unknown as ResolvedEmailDestinationConfig, Buffer.from('catalog'), 'catalog.csv');

        expect(result).toMatchObject({
            success: false,
            destinationType: 'EMAIL',
            error: 'SMTP configuration is required for email delivery',
        });
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('pins SMTP delivery to the DNS-approved address', async () => {
        const sendMail = vi.fn().mockResolvedValue({
            messageId: 'mail-1',
            accepted: ['buyer@example.com'],
            rejected: [],
        });
        const close = vi.fn();
        vi.mocked(nodemailer.createTransport).mockReturnValue({
            sendMail,
            close,
        } as never);

        const result = await deliverToEmail({
            type: 'EMAIL',
            id: 'email',
            name: 'Email',
            to: ['buyer@example.com'],
            subject: 'Catalog',
            smtp: {
                host: 'smtp.example.com',
                port: 587,
            },
        }, Buffer.from('catalog'), 'catalog.csv');

        expect(resolveSafeRemoteAddress).toHaveBeenCalledWith('smtp.example.com');
        expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
            host: '203.0.113.10',
            name: 'smtp.example.com',
            tls: { servername: 'smtp.example.com' },
        }));
        expect(result.success).toBe(true);
        expect(close).toHaveBeenCalledOnce();
    });

    it('closes the SMTP transport when sending fails', async () => {
        const close = vi.fn();
        vi.mocked(nodemailer.createTransport).mockReturnValue({
            sendMail: vi.fn().mockRejectedValue(new Error('SMTP rejected message')),
            close,
        } as never);

        const result = await deliverToEmail({
            type: 'EMAIL',
            id: 'email',
            name: 'Email',
            to: ['buyer@example.com'],
            subject: 'Catalog',
            smtp: {
                host: 'smtp.example.com',
                port: 587,
            },
        }, Buffer.from('catalog'), 'catalog.csv');

        expect(result).toMatchObject({
            success: false,
            error: 'SMTP rejected message',
        });
        expect(close).toHaveBeenCalledOnce();
    });
});
