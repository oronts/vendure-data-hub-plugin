import {
    Channel,
    ChannelService,
    CurrencyCode,
    ID,
    LanguageCode,
    RequestContext,
    RoleService,
    StockLocation,
    StockLocationService,
} from '@vendure/core';

export interface DevChannelDefinition {
    readonly code: string;
    readonly token: string;
    readonly defaultLanguageCode: LanguageCode;
    readonly availableLanguageCodes: readonly LanguageCode[];
    readonly defaultCurrencyCode: CurrencyCode;
    readonly availableCurrencyCodes: readonly CurrencyCode[];
}

export const DEV_CHANNEL_DEFINITIONS: readonly DevChannelDefinition[] = [
    {
        code: 'uk-store',
        token: 'uk-store',
        defaultLanguageCode: LanguageCode.en,
        availableLanguageCodes: [LanguageCode.en],
        defaultCurrencyCode: CurrencyCode.GBP,
        availableCurrencyCodes: [CurrencyCode.GBP, CurrencyCode.EUR],
    },
] as const;

function getChannelMutationResult(
    action: string,
    result: Awaited<ReturnType<ChannelService['create']>>,
): Channel {
    if ('errorCode' in result) {
        throw new Error(`Failed to ${action}: ${result.message}`);
    }
    return result;
}

export async function ensureDevChannels(
    channelService: ChannelService,
    ctx: RequestContext,
    zoneId: ID,
): Promise<Channel[]> {
    const existing = await channelService.findAll(ctx, { take: 100 });
    const channels: Channel[] = [];
    for (const definition of DEV_CHANNEL_DEFINITIONS) {
        const input = {
            code: definition.code,
            token: definition.token,
            defaultLanguageCode: definition.defaultLanguageCode,
            availableLanguageCodes: [...definition.availableLanguageCodes],
            defaultCurrencyCode: definition.defaultCurrencyCode,
            availableCurrencyCodes: [...definition.availableCurrencyCodes],
            pricesIncludeTax: false,
            defaultTaxZoneId: zoneId,
            defaultShippingZoneId: zoneId,
        };
        const channel = existing.items.find(item => item.code === definition.code);
        if (channel) {
            const result = await channelService.update(ctx, {
                id: channel.id,
                ...input,
            });
            channels.push(getChannelMutationResult(
                `update channel ${definition.code}`,
                result,
            ));
        } else {
            const result = await channelService.create(ctx, input);
            channels.push(getChannelMutationResult(
                `create channel ${definition.code}`,
                result,
            ));
        }
    }
    return channels;
}

export async function ensureDevChannelAssignments(
    channelService: ChannelService,
    roleService: RoleService,
    stockLocationService: StockLocationService,
    ctx: RequestContext,
    channels: readonly Channel[],
): Promise<void> {
    const superAdminRole = await roleService.getSuperAdminRole(ctx);
    const stockLocations = await stockLocationService.findAll(ctx, { take: 100 });
    for (const channel of channels) {
        await roleService.assignRoleToChannel(ctx, superAdminRole.id, channel.id);
        for (const stockLocation of stockLocations.items) {
            await channelService.assignToChannels(
                ctx,
                StockLocation,
                stockLocation.id,
                [channel.id],
            );
        }
    }
}
