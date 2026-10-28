export interface PageResponseDto<TItem> {
  items: TItem[];
  total: number;
  page: number;
  pageSize: number;
}
