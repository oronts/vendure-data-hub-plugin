import {
    CurrencyCode,
    LanguageCode,
    RequestContext,
    RequestContextService,
    Channel,
    ChannelService,
} from '@vendure/core';

export async function createChannelCodeRequestContext(
    requestContextService: RequestContextService,
    channelService: ChannelService,
    source: RequestContext,
    channelCode: string,
    languageCode?: LanguageCode,
    currencyCode?: CurrencyCode,
): Promise<RequestContext> {
    const channel = source.channel.code === channelCode
        ? source.channel
        : (await channelService.findAll(source, {
            filter: { code: { eq: channelCode } },
            take: 1,
        })).items[0];
    if (!channel) {
        throw new Error(`Channel code not found: ${channelCode}`);
    }
    return createChannelRequestContext(
        requestContextService,
        source,
        channel,
        languageCode,
        currencyCode,
    );
}

export async function createChannelRequestContext(
    requestContextService: RequestContextService,
    source: RequestContext,
    channelOrToken: Channel | string,
    languageCode?: LanguageCode,
    currencyCode?: CurrencyCode,
): Promise<RequestContext> {
    const resolved = await requestContextService.create({
        req: source.req,
        apiType: source.apiType,
        channelOrToken,
        languageCode,
        currencyCode,
    });
    if (
        languageCode !== undefined
        && Array.isArray(resolved.channel.availableLanguageCodes)
        && !resolved.channel.availableLanguageCodes.some(
            available => String(available) === String(languageCode),
        )
    ) {
        throw new Error(
            `Language ${String(languageCode)} is not available in channel ${resolved.channel.code}`,
        );
    }
    if (
        currencyCode !== undefined
        && Array.isArray(resolved.channel.availableCurrencyCodes)
        && !resolved.channel.availableCurrencyCodes.some(
            available => String(available) === String(currencyCode),
        )
    ) {
        throw new Error(
            `Currency ${String(currencyCode)} is not available in channel ${resolved.channel.code}`,
        );
    }
    const target = new RequestContext({
        req: source.req,
        apiType: source.apiType,
        channel: resolved.channel,
        session: source.session,
        languageCode: resolved.languageCode,
        currencyCode: resolved.currencyCode,
        isAuthorized: source.isAuthorized,
        authorizedAsOwnerOnly: source.authorizedAsOwnerOnly,
    });

    if (source.replicationMode) {
        target.setReplicationMode(source.replicationMode);
    }
    for (const symbol of Object.getOwnPropertySymbols(source)) {
        const descriptor = Object.getOwnPropertyDescriptor(source, symbol);
        if (descriptor) {
            Object.defineProperty(target, symbol, descriptor);
        }
    }

    return target;
}
