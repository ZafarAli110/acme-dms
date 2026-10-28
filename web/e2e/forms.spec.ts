import {expect, test} from '@playwright/test';
import {signInAsync, throwawayName} from './support/demo-users';

test.describe('unsaved changes', () => {
  test.beforeEach(async ({page}) => {
    await signInAsync(page);
  });

  test('leaving a form with changes asks first', async ({page}) => {
    await page.goto('/customers/new');
    await page.getByTestId('customer-firstName').locator('input').fill('Pat');
    await page.getByRole('link', {name: 'Home'}).click();

    await expect(page.getByTestId('unsaved-changes-dialog')).toBeVisible();
    await page.getByTestId('unsaved-stay').click();
    await expect(page).toHaveURL(/\/customers\/new$/);
  });

  test('a successful save does not ask', async ({page}) => {
    await page.goto('/customers/new');
    await page.getByTestId('customer-firstName').locator('input').fill('Pat');
    await page.getByTestId('customer-surname').locator('input').fill(throwawayName('guard'));
    await page.getByTestId('save-customer').click();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('unsaved-changes-dialog')).toBeHidden();
  });
});
