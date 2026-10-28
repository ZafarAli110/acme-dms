import {customType} from 'drizzle-orm/pg-core';

/** `numeric(12,2)` as a number. Postgres sends numerics as text so nothing is lost on the way; amounts fit a double. */
export const money = customType<{data: number; driverData: string}>({
  dataType() {
    return 'numeric(12, 2)';
  },
  toDriver(value) {
    return value.toFixed(2);
  },
  fromDriver(value: string) {
    return Number(value);
  },
});
