import type {ValueTransformer} from 'typeorm';

/** Postgres returns numeric columns as strings; the API works with numbers. */
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
