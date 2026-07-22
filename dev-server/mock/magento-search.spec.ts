import { describe, expect, it } from 'vitest';
import {
  applyMagentoFilters,
  matchesMagentoFilter,
  paginateWithSearchCriteria,
} from './magento-search';

const items = [
  { id: 1, sku: 'SKU-001', name: 'Red Shirt', price: 20, tags: 'sale,new', status: null },
  { id: 2, sku: 'SKU-002', name: 'Blue Shirt', price: 40, tags: ['featured'], status: 'active' },
  { id: 3, sku: 'SKU-003', name: 'Green Hat', price: 30, tags: 'sale', status: 'active' },
];

describe('Magento search criteria', () => {
  it('ORs filters inside a group and ANDs separate groups', () => {
    const result = applyMagentoFilters(items, {
      filter_groups: {
        0: { filters: {
          0: { field: 'name', value: '%Shirt', condition_type: 'like' },
          1: { field: 'name', value: '%Hat', condition_type: 'like' },
        } },
        1: { filters: {
          0: { field: 'price', value: '25', condition_type: 'gt' },
        } },
      },
    });

    expect(result.map(item => item.id)).toEqual([2, 3]);
  });

  it.each([
    ['eq', '2', true],
    ['neq', '1', true],
    ['in', '1,2,3', true],
    ['nin', '1,3', true],
    ['gt', '1', true],
    ['gteq', '2', true],
    ['moreq', '2', true],
    ['from', '2', true],
    ['lt', '3', true],
    ['lteq', '2', true],
    ['to', '2', true],
  ])('supports the %s comparison condition', (condition, value, expected) => {
    expect(matchesMagentoFilter(items[1], {
      field: 'id',
      value,
      condition_type: condition,
    })).toBe(expected);
  });

  it('supports positive and negative pattern/set conditions', () => {
    expect(matchesMagentoFilter(items[1], {
      field: 'name', value: 'Blue Sh_rt', condition_type: 'like',
    })).toBe(true);
    expect(matchesMagentoFilter(items[1], {
      field: 'name', value: '%Hat', condition_type: 'nlike',
    })).toBe(true);
    expect(matchesMagentoFilter(items[0], {
      field: 'tags', value: 'sale', condition_type: 'finset',
    })).toBe(true);
    expect(matchesMagentoFilter(items[1], {
      field: 'tags', value: 'sale,new', condition_type: 'nfinset',
    })).toBe(true);
  });

  it('supports null and not-null conditions without treating null as zero', () => {
    expect(matchesMagentoFilter(items[0], {
      field: 'status', condition_type: 'null',
    })).toBe(true);
    expect(matchesMagentoFilter(items[1], {
      field: 'status', condition_type: 'notnull',
    })).toBe(true);
    expect(matchesMagentoFilter(items[0], {
      field: 'missing', value: -1, condition_type: 'gt',
    })).toBe(false);
  });

  it('sorts before applying camel-case pagination', () => {
    const result = paginateWithSearchCriteria(items, {
      sortOrders: [{ field: 'price', direction: 'DESC' }],
      pageSize: 1,
      currentPage: 2,
    });

    expect(result.items.map(item => item.id)).toEqual([3]);
    expect(result.total_count).toBe(3);
  });

  it('accepts snake-case query records and keeps filtered totals', () => {
    const result = paginateWithSearchCriteria(items, {
      filter_groups: [{ filters: [{ field: 'price', value: 20, condition_type: 'gteq' }] }],
      sort_orders: { 0: { field: 'id', direction: 'DESC' } },
      page_size: '2',
      current_page: '1',
    });

    expect(result.items.map(item => item.id)).toEqual([3, 2]);
    expect(result.total_count).toBe(3);
  });

  it('returns all items by default and rejects malformed filters', () => {
    const manyItems = Array.from({ length: 25 }, (_, index) => ({ id: index + 1 }));
    expect(paginateWithSearchCriteria(manyItems, {
      pageSize: -1,
      currentPage: 'invalid',
    }).items).toHaveLength(25);
    expect(applyMagentoFilters(items, {
      filter_groups: [{ filters: [{ value: 'missing field' }] }],
    })).toEqual([]);
  });
});
