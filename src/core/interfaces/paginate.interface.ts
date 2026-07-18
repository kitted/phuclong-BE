// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface PaginateResponse<T> {
  items: any;
  paginate: PaginateMeta;
}

export interface PaginateMeta {
  count: number;
  page: number;
  size: number;
}

export class PaginationInput {
  limit: number;
  page: number;
  sortBy?: string;
  sortType?: string | number;
  searchBy?: string;
  searchType?: string | number;
}
