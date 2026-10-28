import {expect, test} from '@playwright/test';
import {signInAsync, throwawayName} from './support/demo-users';

test.describe('customers', () => {
  test.beforeEach(async ({page}) => {
    await signInAsync(page);
  });

  test('a new prospect is created and shown on its own page', async ({page}) => {
    const surname = throwawayName('customer');
    await page.goto('/customers/new');
    await page.getByTestId('customer-firstName').locator('input').fill('Pat');
    await page.getByTestId('customer-surname').locator('input').fill(surname);
    await page.getByTestId('save-customer').click();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', {name: `Pat ${surname}`})).toBeVisible();
  });

  test('missing names are shown on their fields', async ({page}) => {
    await page.goto('/customers/new');
    await page.getByTestId('save-customer').click();

    await expect(page.getByText('Enter a first name.')).toBeVisible();
    await expect(page.getByText('Enter a surname.')).toBeVisible();
    await expect(page).toHaveURL(/\/customers\/new$/);
  });

  test('an edit is saved', async ({page}) => {
    await page.goto('/customers/new');
    await page.getByTestId('customer-firstName').locator('input').fill('Pat');
    await page.getByTestId('customer-surname').locator('input').fill(throwawayName('edit'));
    await page.getByTestId('save-customer').click();
    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);

    await page.getByTestId('customer-city').locator('input').fill('Hillcrest');
    await page.getByTestId('save-customer').click();

    await expect(page.getByTestId('save-success')).toHaveText('Saved.');
  });
});
