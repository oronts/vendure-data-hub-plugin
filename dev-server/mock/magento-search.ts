export type MagentoSearchRecord = Record<string, unknown>;

export interface MagentoSearchResult<T> {
  items: T[];
  search_criteria: MagentoSearchRecord;
  total_count: number;
}

function isSearchRecord(value: unknown): value is MagentoSearchRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toSearchList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return isSearchRecord(value) ? Object.values(value) : [];
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readField(item: object, field: string): unknown {
  return field.split('.').reduce<unknown>((value, segment) => (
    isSearchRecord(value) ? value[segment] : undefined
  ), item);
}

function compareValues(left: unknown, right: unknown): number | null {
  if (left === null || left === undefined) return null;
  const leftNumber = typeof left === 'number' ? left : Number(left);
  const rightNumber = typeof right === 'number' ? right : Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right ?? ''));
}

function createLikePattern(value: unknown): RegExp {
  const escaped = String(value ?? '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesFinset(actual: unknown, expectedItems: string[]): boolean {
  const actualItems = Array.isArray(actual)
    ? actual.map(entry => String(entry))
    : String(actual ?? '').split(',').map(entry => entry.trim());
  return expectedItems.some(entry => actualItems.includes(entry));
}

function matchesComparison(
  actual: unknown,
  expected: unknown,
  predicate: (comparison: number) => boolean,
): boolean {
  const comparison = compareValues(actual, expected);
  return comparison !== null && predicate(comparison);
}

export function matchesMagentoFilter(item: object, value: unknown): boolean {
  if (!isSearchRecord(value) || typeof value.field !== 'string') return false;
  const actual = readField(item, value.field);
  const expected = value.value;
  const rawCondition = value.condition_type ?? value.conditionType;
  const condition = typeof rawCondition === 'string' ? rawCondition.toLowerCase() : 'eq';
  const expectedItems = String(expected ?? '').split(',').map(entry => entry.trim());

  switch (condition) {
    case 'eq':
      return String(actual ?? '') === String(expected ?? '');
    case 'neq':
    case 'ne':
      return String(actual ?? '') !== String(expected ?? '');
    case 'in':
      return expectedItems.includes(String(actual ?? ''));
    case 'nin':
      return !expectedItems.includes(String(actual ?? ''));
    case 'gt':
      return matchesComparison(actual, expected, comparison => comparison > 0);
    case 'gteq':
    case 'gte':
    case 'moreq':
    case 'from':
      return matchesComparison(actual, expected, comparison => comparison >= 0);
    case 'lt':
      return matchesComparison(actual, expected, comparison => comparison < 0);
    case 'lteq':
    case 'lte':
    case 'to':
      return matchesComparison(actual, expected, comparison => comparison <= 0);
    case 'like':
      return createLikePattern(expected).test(String(actual ?? ''));
    case 'nlike':
      return !createLikePattern(expected).test(String(actual ?? ''));
    case 'finset':
      return matchesFinset(actual, expectedItems);
    case 'nfinset':
      return !matchesFinset(actual, expectedItems);
    case 'null':
      return actual === null || actual === undefined;
    case 'notnull':
      return actual !== null && actual !== undefined;
    default:
      return false;
  }
}

export function applyMagentoFilters<T extends object>(
  items: T[],
  searchCriteria: MagentoSearchRecord,
): T[] {
  const rawGroups = searchCriteria.filter_groups ?? searchCriteria.filterGroups;
  const groups = toSearchList(rawGroups);
  if (groups.length === 0) return items;

  return items.filter(item => groups.every(group => {
    if (!isSearchRecord(group)) return false;
    const filters = toSearchList(group.filters);
    return filters.length > 0 && filters.some(filter => matchesMagentoFilter(item, filter));
  }));
}

function applyMagentoSort<T extends object>(
  items: T[],
  searchCriteria: MagentoSearchRecord,
): T[] {
  const rawSortOrders = searchCriteria.sortOrders ?? searchCriteria.sort_orders;
  const sortOrders = toSearchList(rawSortOrders).filter(isSearchRecord);
  if (sortOrders.length === 0) return items;

  return [...items].sort((left, right) => {
    for (const sortOrder of sortOrders) {
      if (typeof sortOrder.field !== 'string') continue;
      const comparison = compareValues(
        readField(left, sortOrder.field),
        readField(right, sortOrder.field),
      );
      if (comparison === null || comparison === 0) continue;
      const direction = String(sortOrder.direction ?? 'ASC').toUpperCase();
      return direction === 'DESC' ? -comparison : comparison;
    }
    return 0;
  });
}

export function paginateWithSearchCriteria<T extends object>(
  items: T[],
  searchCriteria: unknown,
): MagentoSearchResult<T> {
  const criteria = isSearchRecord(searchCriteria) ? searchCriteria : {};
  const pageSize = readPositiveInteger(
    criteria.pageSize ?? criteria.page_size,
    Math.max(items.length, 1),
  );
  const currentPage = readPositiveInteger(
    criteria.currentPage ?? criteria.current_page,
    1,
  );
  const offset = (currentPage - 1) * pageSize;
  const filteredItems = applyMagentoFilters(items, criteria);
  const sortedItems = applyMagentoSort(filteredItems, criteria);

  return {
    items: sortedItems.slice(offset, offset + pageSize),
    search_criteria: criteria,
    total_count: filteredItems.length,
  };
}
