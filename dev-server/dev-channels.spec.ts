import { describe, expect, it, vi } from 'vitest';
import { CurrencyCode, LanguageCode } from '@vendure/core';
import {
    ensureDevChannelAssignments,
    ensureDevChannels,
} from './dev-channels';

describe('dev channel provisioning', () => {
    it('creates the UK channel with matching Vendure defaults', async () => {
        const channelService = {
            findAll: vi.fn(async () => ({ items: [] })),
            create: vi.fn(async (_ctx, input) => ({ id: 2, ...input })),
            update: vi.fn(),
        };

        const channels = await ensureDevChannels(
            channelService as never,
            {} as never,
            7,
        );

        expect(channelService.create).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                code: 'uk-store',
                token: 'uk-store',
                defaultLanguageCode: LanguageCode.en,
                availableLanguageCodes: [LanguageCode.en],
                defaultCurrencyCode: CurrencyCode.GBP,
                availableCurrencyCodes: [CurrencyCode.GBP, CurrencyCode.EUR],
                defaultTaxZoneId: 7,
                defaultShippingZoneId: 7,
            }),
        );
        expect(channelService.update).not.toHaveBeenCalled();
        expect(channels).toEqual([
            expect.objectContaining({ id: 2, code: 'uk-store' }),
        ]);
    });

    it('updates an existing channel instead of duplicating it', async () => {
        const channelService = {
            findAll: vi.fn(async () => ({
                items: [{ id: 2, code: 'uk-store' }],
            })),
            create: vi.fn(),
            update: vi.fn(async (_ctx, input) => ({ ...input })),
        };

        await ensureDevChannels(channelService as never, {} as never, 7);

        expect(channelService.create).not.toHaveBeenCalled();
        expect(channelService.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ id: 2, code: 'uk-store' }),
        );
    });

    it('fails when Vendure rejects a channel mutation', async () => {
        const channelService = {
            findAll: vi.fn(async () => ({ items: [] })),
            create: vi.fn(async () => ({
                errorCode: 'CHANNEL_DEFAULT_LANGUAGE_ERROR',
                message: 'Invalid language',
            })),
        };

        await expect(ensureDevChannels(
            channelService as never,
            {} as never,
            7,
        )).rejects.toThrow('Failed to create channel uk-store: Invalid language');
    });

    it('assigns administrator access and stock locations to each dev channel', async () => {
        const channelService = { assignToChannels: vi.fn() };
        const roleService = {
            getSuperAdminRole: vi.fn(async () => ({ id: 'super-admin-role' })),
            assignRoleToChannel: vi.fn(),
        };
        const stockLocationService = {
            findAll: vi.fn(async () => ({
                items: [{ id: 'main' }, { id: 'overflow' }],
                totalItems: 2,
            })),
        };

        await ensureDevChannelAssignments(
            channelService as never,
            roleService as never,
            stockLocationService as never,
            {} as never,
            [{ id: 'uk-channel' }] as never,
        );

        expect(roleService.assignRoleToChannel).toHaveBeenCalledWith(
            expect.anything(),
            'super-admin-role',
            'uk-channel',
        );
        expect(channelService.assignToChannels).toHaveBeenCalledTimes(2);
        expect(channelService.assignToChannels).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(Function),
            'main',
            ['uk-channel'],
        );
    });
});
