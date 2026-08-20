import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import {
    Badge,
    buttonVariants,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    DashboardRouteDefinition,
    Input,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
} from '@vendure/dashboard';
import { Plus, Search, ShoppingBasket } from 'lucide-react';
import { DATAHUB_NAV_LABELS, DATAHUB_NAV_SECTION, DATAHUB_PERMISSIONS, DETAIL_ROUTES, ROUTES } from '../../constants';
import { DetailRouteButton, EmptyState, ErrorState, LoadingState } from '../../components/shared';
import { useFeedFormats, useFeeds } from '../../hooks/api/use-feeds';
import { formatDateTime } from '../../utils';
import { getErrorMessage } from '../../../shared';
import { FeedActions } from './FeedActions';

export const feedsList: DashboardRouteDefinition = {
    navMenuItem: {
        sectionId: DATAHUB_NAV_SECTION,
        id: 'data-hub-feeds',
        url: ROUTES.FEEDS,
        title: DATAHUB_NAV_LABELS.FEEDS,
        requiresPermission: DATAHUB_PERMISSIONS.MANAGE_FEEDS,
    },
    path: ROUTES.FEEDS,
    loader: () => ({ breadcrumb: DATAHUB_NAV_LABELS.FEEDS }),
    component: () => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_FEEDS]}>
            <FeedsPage />
        </PermissionGuard>
    ),
};

function FeedsPage() {
    const { i18n, t } = useLingui();
    const feedsQuery = useFeeds();
    const formatsQuery = useFeedFormats();
    const [search, setSearch] = React.useState('');

    const formatLabels = React.useMemo(
        () => new Map((formatsQuery.data ?? []).map(format => [format.code, format.label])),
        [formatsQuery.data],
    );
    const feeds = React.useMemo(() => {
        const normalizedSearch = search.trim().toLocaleLowerCase(i18n.locale);
        if (!normalizedSearch) return feedsQuery.data ?? [];
        return (feedsQuery.data ?? []).filter(feed => (
            feed.code.toLocaleLowerCase(i18n.locale).includes(normalizedSearch)
            || feed.name.toLocaleLowerCase(i18n.locale).includes(normalizedSearch)
            || feed.format.toLocaleLowerCase(i18n.locale).includes(normalizedSearch)
        ));
    }, [feedsQuery.data, i18n.locale, search]);

    return (
        <Page pageId="data-hub-feeds-list">
            <PageTitle>{i18n._(DATAHUB_NAV_LABELS.FEEDS)}</PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    <Link
                        className={buttonVariants()}
                        to={DETAIL_ROUTES.FEED}
                        params={{ id: 'new' }}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {t`New feed`}
                    </Link>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="feeds">
                    <Card>
                    <CardHeader>
                        <CardTitle>{t`Managed product feeds`}</CardTitle>
                        <CardDescription>
                            {t`Generate channel-specific catalog artifacts for commerce and advertising platforms.`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {feedsQuery.isLoading && (
                            <LoadingState
                                type="table"
                                rows={5}
                                message={t`Loading feeds...`}
                            />
                        )}
                        {feedsQuery.isError && (
                            <ErrorState
                                title={t`Failed to load feeds`}
                                message={getErrorMessage(feedsQuery.error)}
                                onRetry={() => void feedsQuery.refetch()}
                            />
                        )}
                        {feedsQuery.data && feedsQuery.data.length === 0 && (
                            <EmptyState
                                icon={<ShoppingBasket className="h-12 w-12" aria-hidden="true" />}
                                title={t`No managed feeds`}
                                description={t`Create a feed to generate and schedule product catalog artifacts for this channel.`}
                            />
                        )}
                        {feedsQuery.data && feedsQuery.data.length > 0 && (
                            <div className="space-y-4">
                                <div className="relative max-w-sm">
                                    <Search
                                        className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    <Input
                                        value={search}
                                        onChange={event => setSearch(event.target.value)}
                                        placeholder={t`Search feeds`}
                                        aria-label={t`Search feeds`}
                                        className="pl-9"
                                    />
                                </div>
                                {feeds.length === 0 ? (
                                    <EmptyState
                                        title={t`No matching feeds`}
                                        description={t`Try a different name, code, or format.`}
                                    />
                                ) : (
                                    <div className="overflow-x-auto rounded-md border">
                                        <table className="w-full text-sm">
                                            <caption className="sr-only">
                                                {t`Managed product feeds`}
                                            </caption>
                                            <thead>
                                                <tr className="border-b bg-muted/60">
                                                    <th scope="col" className="px-3 py-2 text-left font-medium">{t`Feed`}</th>
                                                    <th scope="col" className="px-3 py-2 text-left font-medium">{t`Format`}</th>
                                                    <th scope="col" className="px-3 py-2 text-left font-medium">{t`Schedule`}</th>
                                                    <th scope="col" className="px-3 py-2 text-left font-medium">{t`Last generated`}</th>
                                                    <th scope="col" className="px-3 py-2 text-left font-medium">{t`Items`}</th>
                                                    <th scope="col" className="px-3 py-2 text-right font-medium">{t`Actions`}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {feeds.map(feed => (
                                                    <tr key={String(feed.id)} className="border-b last:border-b-0">
                                                        <td className="px-3 py-2">
                                                            <DetailRouteButton
                                                                route={DETAIL_ROUTES.FEED}
                                                                id={feed.id}
                                                                label={(
                                                                    <span className="flex flex-col items-start">
                                                                        <span>{feed.name}</span>
                                                                        <span className="font-mono text-xs text-muted-foreground">
                                                                            {feed.code}
                                                                        </span>
                                                                    </span>
                                                                )}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <Badge variant="outline">
                                                                {formatLabels.get(feed.format)
                                                                    ?? String(feed.format).split('_').join(' ')}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {feed.schedule?.enabled ? (
                                                                <div className="space-y-0.5">
                                                                    <span className="font-mono text-xs">{feed.schedule.cron}</span>
                                                                    {feed.schedule.timezone && (
                                                                        <div className="text-xs text-muted-foreground">
                                                                            {feed.schedule.timezone}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted-foreground">
                                                                    {t`Manual`}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="whitespace-nowrap px-3 py-2">
                                                            {feed.lastGeneratedAt
                                                                ? formatDateTime(
                                                                    feed.lastGeneratedAt,
                                                                    undefined,
                                                                    i18n.locale,
                                                                )
                                                                : (
                                                                    <span className="text-muted-foreground">
                                                                        {t`Never`}
                                                                    </span>
                                                                )}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {feed.lastItemCount ?? '—'}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex justify-end">
                                                                <FeedActions feed={feed} compact />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                    </Card>
                </PageBlock>
            </PageLayout>
        </Page>
    );
}
