import {expect, test} from '@playwright/test';
import {signInAsync} from './support/demo-users';

test('the customer form is in French, labels and errors alike', async ({page}) => {
  await page.addInitScript(() => window.localStorage.setItem('acme.language', 'fr'));
  await signInAsync(page);
  await page.goto('/customers/new');
  await page.getByTestId('save-customer').click();

  await expect(page.getByTestId('customer-firstName')).toContainText('Prénom');
  await expect(page.getByText('Saisissez un prénom.')).toBeVisible();
  await expect(page.getByTestId('save-customer')).toHaveText('Enregistrer');
});
