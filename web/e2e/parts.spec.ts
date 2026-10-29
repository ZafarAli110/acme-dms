import {expect, test} from '@playwright/test';
import {createPartAsync, signInAsync} from './support/demo-users';

test.describe('parts', () => {
  test.beforeEach(async ({page}) => {
    await signInAsync(page);
  });

  test('the search goes into the URL and survives a reload', async ({page}) => {
    await page.goto('/parts');
    await page.getByTestId('grid-search').locator('input').fill('filter');

    await expect(page).toHaveURL(/\?search=filter/);
    await page.reload();
    await expect(page.getByTestId('grid-search').locator('input')).toHaveValue('filter');
    await expect(page.getByTestId('parts-table').locator('.MuiDataGrid-row').first()).toContainText(/filter/i);
  });

  test('a sort by a column goes into the URL and orders the rows', async ({page}) => {
    await page.goto('/parts');
    await page.getByRole('columnheader', {name: 'On hand'}).click();
    await page.getByRole('columnheader', {name: 'On hand'}).click();

    await expect(page).toHaveURL(/sort=onHand&direction=desc/);
    const onHand = page.getByTestId('parts-table').locator('[role="gridcell"][data-field="onHand"]');
    await expect(onHand.first()).toBeVisible();
    const quantities = (await onHand.allTextContents()).map((text) => Number(text.replace(/\D/g, '')));
    expect(quantities).toEqual([...quantities].sort((a, b) => b - a));
  });

  test('the next page goes into the URL', async ({page}) => {
    await page.goto('/parts?pageSize=10');
    await page.getByRole('button', {name: 'Go to next page'}).click();

    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator('.MuiTablePagination-displayedRows')).toContainText('11–20');
  });

  test('a part edit is saved', async ({page, request}) => {
    const part = await createPartAsync(request);
    await page.goto(`/parts/${part.id}`);

    await page.getByTestId('part-description').locator('input').fill('Throwaway part, edited');
    await page.getByTestId('save-part').click();

    await expect(page.getByTestId('save-success')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('part-description').locator('input')).toHaveValue('Throwaway part, edited');
  });
});
