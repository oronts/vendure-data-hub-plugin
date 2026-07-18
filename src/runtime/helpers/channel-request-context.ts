import {
    LanguageCode,
    RequestContext,
    RequestContextService,
} from '@vendure/core';

export async function createChannelRequestContext(
    requestContextService: RequestContextService,
    source: RequestContext,
    channelOrToken: string,
    languageCode?: LanguageCode,
): Promise<RequestContext> {
    const resolved = await requestContextService.create({
        req: source.req,
        apiType: source.apiType,
        channelOrToken,
        languageCode,
    });
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
