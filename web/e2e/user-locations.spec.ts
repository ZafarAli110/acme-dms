import {expect, type Page, test} from '@playwright/test';
import {MARIA, SAM, signInAsync} from './support/demo-users';

function assignment(page: Page, email: string, locationCode: string) {
  return page.getByTestId(`assignment-${email}-${locationCode}`).locator('input');
}

test.describe('the Locations page', () => {
  test('the manager gives an advisor a second rooftop and takes it away again', async ({page}) => {
    await signInAsync(page, MARIA);
    await page.goto('/locations');
    const samAtRiverside = assignment(page, SAM, 'NWM-R');
    await expect(samAtRiverside).not.toBeChecked();

    await samAtRiverside.click();
    await expect(samAtRiverside).toBeChecked();
    await page.reload();
    await expect(samAtRiverside).toBeChecked();

    await samAtRiverside.click();
    await expect(samAtRiverside).not.toBeChecked();
  });

  test("an advisor's only rooftop can't be taken away, and the manager's own row is locked", async ({page}) => {
    await signInAsync(page, MARIA);
    await page.goto('/locations');

    await assignment(page, 'rita@northwind.test', 'NWM-R').click();

    await expect(page.getByTestId('assignment-error')).toHaveText('Rita Service Advisor must keep at least one location.');
    await expect(assignment(page, 'rita@northwind.test', 'NWM-R')).toBeChecked();
    await expect(assignment(page, MARIA, 'NWM-N')).toBeDisabled();
  });

  test('an advisor has no Locations page', async ({page}) => {
    await signInAsync(page, SAM);

    await expect(page.getByRole('link', {name: 'Locations'})).toHaveCount(0);
  });
});
