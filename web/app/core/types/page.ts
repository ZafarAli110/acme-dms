/** One page of a list, as every list endpoint returns it. */
export interface Page<TItem> {
  items: TItem[];
  total: number;
  page: number;
  pageSize: number;
}
