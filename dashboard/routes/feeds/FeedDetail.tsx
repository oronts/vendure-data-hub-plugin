import * as React from 'react';
import { useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    DashboardRouteDefinition,
    Page,
    PageActionBar,
    PageActionBarRight,
    PageBlock,
    PageLayout,
    PageTitle,
    PermissionGuard,
} from '@vendure/dashboard';
import { useForm } from 'react-hook-form';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { DataHubFeedFormat } from '../../gql/graphql';
import { DATAHUB_NAV_LABELS, DATAHUB_PERMISSIONS, DETAIL_ROUTES, ROUTES } from '../../constants';
import { EmptyState, ErrorState, LoadingState } from '../../components/shared';
import {
    useCreateFeed,
    useFeed,
    useFeedFormats,
    useUpdateFeed,
} from '../../hooks/api/use-feeds';
import { formatDateTime } from '../../utils';
import { getErrorMessage } from '../../../shared';
import { FeedActions } from './FeedActions';
import { FeedDefinitionFields } from './FeedDefinitionFields';
import {
    DEFAULT_FEED_FORM_VALUES,
    feedFormToInput,
    feedToFormValues,
    validateFeedForm,
} from './feed-form';
import type { FeedFormValues } from './feed-form';

const FEED_DETAIL_PAGE_ID = 'data-hub-feed-detail';

export const feedDetail: DashboardRouteDefinition = {
    path: DETAIL_ROUTES.FEED,
    loader: () => ({
        breadcrumb: DATAHUB_NAV_LABELS.FEED,
    }),
    component: route => (
        <PermissionGuard requires={[DATAHUB_PERMISSIONS.MANAGE_FEEDS]}>
            <FeedDetailPage route={route} />
        </PermissionGuard>
    ),
};

type DashboardRoute = Parameters<DashboardRouteDefinition['component']>[0];

function isFeedFormat(value: string): value is DataHubFeedFormat {
    return Object.values(DataHubFeedFormat).some(format => format === value);
}

function FeedDetailPage({ route }: Readonly<{ route: DashboardRoute }>) {
    const { i18n, t } = useLingui();
    const params = route.useParams();
    const navigate = useNavigate();
    const creating = params.id === 'new';
    const feedQuery = useFeed(creating ? undefined : params.id);
    const formatsQuery = useFeedFormats();
    const createFeed = useCreateFeed();
    const updateFeed = useUpdateFeed();
    const form = useForm<FeedFormValues>({
        defaultValues: DEFAULT_FEED_FORM_VALUES,
        mode: 'onChange',
    });

    React.useEffect(() => {
        if (feedQuery.data) form.reset(feedToFormValues(feedQuery.data));
    }, [feedQuery.data, form]);

    React.useEffect(() => {
        const subscription = form.watch((_values, info) => {
            if (info.name) form.clearErrors(info.name);
        });
        return () => subscription.unsubscribe();
    }, [form]);

    const formats = React.useMemo(() => {
        const serverFormats: Array<{
            code: DataHubFeedFormat;
            label: string;
            description: string;
        }> = (formatsQuery.data ?? []).flatMap(format => (
            isFeedFormat(format.code)
                ? [{
                    code: format.code,
                    label: format.label,
                    description: format.description,
                }]
                : []
        ));
        const configured = new Set(serverFormats.map(format => format.code));
        for (const format of Object.values(DataHubFeedFormat)) {
            if (!configured.has(format)) {
                serverFormats.push({
                    code: format,
                    label: String(format).split('_').join(' '),
                    description: format === DataHubFeedFormat.CUSTOM
                        ? t`Use a server-registered custom feed generator`
                        : t`Built-in feed generator`,
                });
            }
        }
        return serverFormats;
    }, [formatsQuery.data, t]);

    const saving = createFeed.isPending || updateFeed.isPending;
    const submitHandler = form.handleSubmit(values => {
        form.clearErrors();
        const validationErrors = validateFeedForm(
            values,
            (id, translationValues) => i18n._(id, translationValues),
        );
        const entries = Object.entries(validationErrors) as Array<
            [keyof FeedFormValues, string | undefined]
        >;
        for (const [field, message] of entries) {
            if (message) form.setError(field, { type: 'validate', message });
        }
        if (entries.some(([, message]) => Boolean(message))) {
            toast.error(t`Fix the highlighted feed fields`);
            return;
        }

        const input = feedFormToInput(values);
        if (creating) {
            createFeed.mutate(input, {
                onSuccess: async feed => {
                    toast.success(t`Feed created`);
                    form.reset(values);
                    await navigate({
                        to: `${ROUTES.FEEDS}/$id`,
                        params: { id: String(feed.id) },
                    });
                },
                onError: error => {
                    toast.error(t`Failed to create feed`, {
                        description: getErrorMessage(error),
                    });
                },
            });
            return;
        }
        updateFeed.mutate({ id: params.id, input }, {
            onSuccess: () => {
                toast.success(t`Feed updated`);
                form.reset(values);
            },
            onError: error => {
                toast.error(t`Failed to update feed`, {
                    description: getErrorMessage(error),
                });
            },
        });
    });

    if (!creating && feedQuery.isLoading) {
        return (
            <Page pageId={FEED_DETAIL_PAGE_ID}>
                <PageTitle>{t`Feed`}</PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="loading">
                        <LoadingState
                            type="form"
                            rows={6}
                            message={t`Loading feed...`}
                        />
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }
    if (!creating && feedQuery.isError) {
        return (
            <Page pageId={FEED_DETAIL_PAGE_ID}>
                <PageTitle>{t`Feed`}</PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="error">
                        <ErrorState
                            title={t`Failed to load feed`}
                            message={getErrorMessage(feedQuery.error)}
                            onRetry={() => void feedQuery.refetch()}
                        />
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }
    if (!creating && !feedQuery.data) {
        return (
            <Page pageId={FEED_DETAIL_PAGE_ID}>
                <PageTitle>{t`Feed`}</PageTitle>
                <PageLayout>
                    <PageBlock column="main" blockId="not-found">
                        <EmptyState
                            title={t`Feed not found`}
                            description={t`This feed does not exist in the active channel or has been deleted.`}
                        />
                    </PageBlock>
                </PageLayout>
            </Page>
        );
    }

    const feed = feedQuery.data;
    return (
        <Page
            pageId={FEED_DETAIL_PAGE_ID}
            form={form}
            submitHandler={submitHandler}
            entity={feed}
        >
            <PageTitle>
                {creating ? t`New feed` : feed?.name}
            </PageTitle>
            <PageActionBar>
                <PageActionBarRight>
                    {feed && (
                        <FeedActions
                            feed={feed}
                            onDeleted={() => void navigate({ to: ROUTES.FEEDS })}
                        />
                    )}
                    <Button
                        type="submit"
                        disabled={saving || !form.formState.isDirty}
                    >
                        {saving
                            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            : <Save className="h-4 w-4" aria-hidden="true" />}
                        {saving
                            ? t`Saving...`
                            : creating ? t`Create feed` : t`Save changes`}
                    </Button>
                </PageActionBarRight>
            </PageActionBar>
            <PageLayout>
                <PageBlock column="main" blockId="definition">
                    {formatsQuery.isError && (
                        <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                            {t`Format descriptions could not be loaded. Built-in format values remain available.`}
                        </div>
                    )}
                    <FeedDefinitionFields
                        form={form}
                        formats={formats}
                        disabled={saving}
                    />
                </PageBlock>
                {!creating && feed && (
                    <PageBlock column="side" blockId="artifact">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t`Current artifact`}</CardTitle>
                                <CardDescription>
                                    {t`Generation state for this channel-specific feed.`}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <dl className="space-y-4 text-sm">
                                    <div>
                                        <dt className="text-muted-foreground">
                                            {t`Last generated`}
                                        </dt>
                                        <dd>
                                            {feed.lastGeneratedAt
                                                ? formatDateTime(
                                                    feed.lastGeneratedAt,
                                                    undefined,
                                                    i18n.locale,
                                                )
                                                : t`Never`}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">
                                            {t`Item count`}
                                        </dt>
                                        <dd>{feed.lastItemCount ?? '—'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">
                                            {t`Availability`}
                                        </dt>
                                        <dd>
                                            {feed.downloadUrl
                                                ? t`Ready to download`
                                                : t`No stored artifact`}
                                        </dd>
                                    </div>
                                </dl>
                            </CardContent>
                        </Card>
                    </PageBlock>
                )}
            </PageLayout>
        </Page>
    );
}
