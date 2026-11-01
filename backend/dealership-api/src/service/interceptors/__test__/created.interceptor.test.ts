import type {CallHandler, ExecutionContext} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {lastValueFrom, of} from 'rxjs';
import {describe, expect, it} from 'vitest';
import {Created, CreatedInterceptor} from '../created.interceptor';

class CustomerEndpoint {
  @Created((customer: {id: string}) => `/v1/customers/${customer.id}`)
  public create(): void {}
}

describe('@Created()', () => {
  it('answers with Location built from the record the handler returned', async () => {
    const headers = new Map<string, string>();
    const context = {
      getHandler: () => CustomerEndpoint.prototype.create,
      switchToHttp: () => ({
        getResponse: () => ({setHeader: (name: string, value: string) => headers.set(name, value)}),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = {handle: () => of({id: '42'})};

    const body = await lastValueFrom(new CreatedInterceptor(new Reflector()).intercept(context, next));

    expect(body).toEqual({id: '42'});
    expect(headers.get('location')).toBe('/v1/customers/42');
  });
});
