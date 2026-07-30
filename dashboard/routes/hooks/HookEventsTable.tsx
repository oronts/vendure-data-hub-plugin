import * as React from 'react';
import { Input, Json } from '@vendure/dashboard';
import { Trans, useLingui } from '@lingui/react/macro';
import { Clock, Info } from 'lucide-react';
import type { DataHubEventsApiQuery } from '../../gql/graphql';
import { POLLING_INTERVALS, UI_LIMITS } from '../../constants';
import { formatDateTime } from '../../utils';
import { filterHookEvents } from './hook-view-model';

type HookEvent = DataHubEventsApiQuery['dataHubEvents'][number];

interface HookEventsTableProps {
    readonly events: readonly HookEvent[];
}

export function HookEventsTable({ events }: HookEventsTableProps) {
    const { i18n, t } = useLingui();
    const [eventFilter, setEventFilter] = React.useState('');
    const filteredEvents = React.useMemo(
        () => filterHookEvents(events, eventFilter),
        [eventFilter, events],
    );
    const visibleEvents = filteredEvents.slice(0, UI_LIMITS.TABLE_PREVIEW_ROWS);

    return (
        <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h3 className="text-lg font-semibold">
                        <Trans>Recent events</Trans>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        <Trans>Channel-scoped Data Hub events (refreshes every {POLLING_INTERVALS.EVENTS / 1000} seconds)</Trans>
                    </p>
                </div>
                <Input
                    className="w-full sm:w-64"
                    placeholder={t`Filter events…`}
                    aria-label={t`Filter events by name`}
                    value={eventFilter}
                    onChange={event => setEventFilter(event.target.value)}
                />
            </div>

            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[44rem] text-sm">
                    <caption className="sr-only"><Trans>Recent Data Hub events</Trans></caption>
                    <thead>
                        <tr className="bg-muted">
                            <th scope="col" className="w-32 px-3 py-2 text-left"><Trans>Time</Trans></th>
                            <th scope="col" className="w-48 px-3 py-2 text-left"><Trans>Event</Trans></th>
                            <th scope="col" className="px-3 py-2 text-left"><Trans>Payload</Trans></th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleEvents.map((event, index) => (
                            <tr
                                key={`${event.createdAt}-${event.name}-${index}`}
                                className="border-t align-top hover:bg-muted/50"
                            >
                                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                                    <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                                    {formatDateTime(event.createdAt, undefined, i18n.locale)}
                                </td>
                                <td className="px-3 py-2">
                                    <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                                        {event.name}
                                    </code>
                                </td>
                                <td className="max-w-[40rem] overflow-x-auto px-3 py-2">
                                    <Json value={event.payload ?? null} />
                                </td>
                            </tr>
                        ))}
                        {filteredEvents.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                                    <Info className="mx-auto mb-2 h-5 w-5 opacity-50" aria-hidden="true" />
                                    {eventFilter.trim()
                                        ? <Trans>No matching events.</Trans>
                                        : <Trans>No events have been observed yet.</Trans>}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}
