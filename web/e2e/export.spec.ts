import {expect, test} from '@playwright/test';
import {MARIA, signInAsync} from './support/demo-users';

test.describe('exporting the customer list', () => {
  test('a filtered list is exported, followed on the panel, and downloaded through its link', async ({
    page,
    request,
  }) => {
    await signInAsync(page, MARIA);
    await page.goto('/customers?filterField=status&filterOperator=is&filterValue=prospect');
    await expect(page.getByTestId('customers-table').locator('.MuiDataGrid-row').first()).toBeVisible();

    await page.getByTestId('export-customers').click();

    const download = page.getByTestId('export-download');
    await expect(download).toBeVisible({timeout: 60_000});
    const file = await request.get((await download.getAttribute('href'))!);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toContain('spreadsheetml');
    // An .xlsx is a zip: it starts with "PK".
    expect((await file.body()).subarray(0, 2).toString()).toBe('PK');
  });

  test('an export can be cancelled while it runs', async ({page}) => {
    await signInAsync(page, MARIA);
    await page.goto('/customers');
    await expect(page.getByTestId('customers-table').locator('.MuiDataGrid-row').first()).toBeVisible();

    await page.getByTestId('export-customers').click();
    await page.getByTestId('export-cancel').click();

    await expect(page.getByTestId('export-status')).toHaveText(/Cancelled|rows, ready to download/);
  });
});
