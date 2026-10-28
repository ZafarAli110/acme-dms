import {expect, test} from '@playwright/test';
import {signInAsync, throwawayName} from './support/demo-users';

test('a customer page shows nothing of another rooftop after a location switch', async ({page}) => {
  await signInAsync(page);
  await page.goto('/customers/new');
  await page.getByTestId('customer-firstName').locator('input').fill('Pat');
  await page.getByTestId('customer-surname').locator('input').fill(throwawayName('switch'));
  await page.getByTestId('save-customer').click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);

  await page.getByTestId('location-switcher').click();
  await page.getByTestId('location-option').filter({hasText: 'Riverside'}).click();

  await expect(page.getByTestId('customer-not-found')).toHaveText('This is not a customer of Riverside.');
});
