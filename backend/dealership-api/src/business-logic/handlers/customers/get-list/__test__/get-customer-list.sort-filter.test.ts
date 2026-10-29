import {BadRequestException} from '@nestjs/common';
import {describe, expect, it} from 'vitest';
import {AT_NORTHSIDE} from '#test-setup/users/test-users';
import {NORTHSIDE, RIVERSIDE} from '#test-setup/postgres/seed-kit';
import {useTestDatabase} from '#test-setup/postgres/use-test-database';
import {GetCustomerListQueryHandler} from '../get-customer-list.query-handler';

const date = (iso: string) => Temporal.PlainDate.from(iso);

describe('GetCustomerListQueryHandler: sorting and filtering as the data grid asks', () => {
  const database = useTestDatabase();

  it('sorts by any of its fields, both ways, ties kept in one order', async () => {
    const seed = database.seed;
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: 'Abbot',
      city: 'Leeds',
      lastContactDate: date('2026-10-01'),
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: 'Baker',
      city: 'York',
      lastContactDate: date('2026-10-20'),
    });
    await seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Carter', city: 'Leeds', lastContactDate: null});
    await seed.addCustomerAsync({
      locationId: RIVERSIDE,
      surname: 'Dunn',
      city: 'Bath',
      lastContactDate: date('2026-10-25'),
    });
    const handler = new GetCustomerListQueryHandler(database.unitOfWorkFactory);
    const page = {page: 1, pageSize: 25};

    const byContact = await handler.executeAsync(AT_NORTHSIDE, {...page, sort: 'lastContactDate', direction: 'desc'});
    const byCity = await handler.executeAsync(AT_NORTHSIDE, {...page, sort: 'city', direction: 'asc'});

    // Postgres puts "no last contact" first when sorting newest first.
    expect(byContact.items.map((c) => c.surname)).toEqual(['Carter', 'Baker', 'Abbot']);
    expect(byCity.items.map((c) => c.city)).toEqual(['Leeds', 'Leeds', 'York']);
    const leeds = byCity.items.filter((c) => c.city === 'Leeds').map((c) => c.id);
    expect(leeds).toEqual([...leeds].sort());
  });

  it("filters by one field with the grid's operators for text, dates and emptiness", async () => {
    const seed = database.seed;
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: 'Fielding',
      firstName: 'Ann',
      email: 'ann@x.test',
      lastContactDate: date('2026-09-01'),
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      surname: 'Fieldman',
      firstName: 'Bo',
      email: null,
      lastContactDate: date('2026-10-15'),
    });
    const handler = new GetCustomerListQueryHandler(database.unitOfWorkFactory);
    const page = {page: 1, pageSize: 25, search: 'field'};

    const named = await handler.executeAsync(AT_NORTHSIDE, {
      ...page,
      filterField: 'name',
      filterOperator: 'contains',
      filterValue: 'man, bo',
    });
    const recent = await handler.executeAsync(AT_NORTHSIDE, {
      ...page,
      filterField: 'lastContactDate',
      filterOperator: 'after',
      filterValue: '2026-10-01',
    });
    const noEmail = await handler.executeAsync(AT_NORTHSIDE, {
      ...page,
      filterField: 'email',
      filterOperator: 'isEmpty',
    });

    expect(named.items.map((c) => c.surname)).toEqual(['Fieldman']);
    expect(recent.items.map((c) => c.surname)).toEqual(['Fieldman']);
    expect(noEmail.items.map((c) => c.surname)).toEqual(['Fieldman']);
    expect(noEmail.total).toBe(1);
  });

  it('treats % and _ in a filter as the characters, not as wildcards', async () => {
    await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Percent', companyName: '50% Off Ltd'});
    await database.seed.addCustomerAsync({locationId: NORTHSIDE, surname: 'Wildcard', companyName: '500 Club'});
    const handler = new GetCustomerListQueryHandler(database.unitOfWorkFactory);

    const found = await handler.executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 25,
      filterField: 'companyName',
      filterOperator: 'startsWith',
      filterValue: '50%',
    });

    expect(found.items.map((c) => c.surname)).toEqual(['Percent']);
  });

  it("refuses a field the list doesn't have, an operator the field's type doesn't take, and a value that isn't one", async () => {
    const handler = new GetCustomerListQueryHandler(database.unitOfWorkFactory);
    const page = {page: 1, pageSize: 25};

    await expect(handler.executeAsync(AT_NORTHSIDE, {...page, sort: 'password'})).rejects.toThrow(BadRequestException);
    await expect(
      handler.executeAsync(AT_NORTHSIDE, {...page, filterField: 'city', filterOperator: '>', filterValue: 'a'}),
    ).rejects.toThrow(BadRequestException);
    await expect(
      handler.executeAsync(AT_NORTHSIDE, {
        ...page,
        filterField: 'lastContactDate',
        filterOperator: 'after',
        filterValue: 'yesterday',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      handler.executeAsync(AT_NORTHSIDE, {...page, filterField: 'city', filterOperator: 'contains'}),
    ).rejects.toThrow(BadRequestException);
  });
});
