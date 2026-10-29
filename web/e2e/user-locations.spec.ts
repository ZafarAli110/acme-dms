import {expect, type Locator, type Page, test} from '@playwright/test';
import {MARIA, SAM, signInAsync} from './support/demo-users';

function assignment(page: Page, email: string, locationCode: string) {
  return page.getByTestId(`assignment-${email}-${locationCode}`).locator('input');
}

// The switch shows its new state before the save finishes, so wait for the save itself; otherwise a reload straight
// after cancels it.
async function toggleAndSaveAsync(page: Page, assignmentSwitch: Locator): Promise<void> {
  const saved = page.waitForResponse(
    (response) => /\/v1\/users\/[^/]+\/locations\/[^/]+$/.test(response.url()) && response.request().method() !== 'GET',
  );
  await assignmentSwitch.click();
  await saved;
}

test.describe('the Locations page', () => {
  test('the manager gives an advisor a second rooftop and takes it away again', async ({page}) => {
    await signInAsync(page, MARIA);
    await page.goto('/locations');
    const samAtRiverside = assignment(page, SAM, 'NWM-R');
    await expect(samAtRiverside).not.toBeChecked();

    await toggleAndSaveAsync(page, samAtRiverside);
    await expect(samAtRiverside).toBeChecked();
    await page.reload();
    await expect(samAtRiverside).toBeChecked();

    await toggleAndSaveAsync(page, samAtRiverside);
    await expect(samAtRiverside).not.toBeChecked();
  });

  test("an advisor's only rooftop can't be taken away, and the manager's own row is locked", async ({page}) => {
    await signInAsync(page, MARIA);
    await page.goto('/locations');

    await assignment(page, 'rita@northwind.test', 'NWM-R').click();

    await expect(page.getByTestId('assignment-error')).toHaveText(
      'Rita Service Advisor must keep at least one location.',
    );
    await expect(assignment(page, 'rita@northwind.test', 'NWM-R')).toBeChecked();
    await expect(assignment(page, MARIA, 'NWM-N')).toBeDisabled();
  });

  test('an advisor has no Locations page', async ({page}) => {
    await signInAsync(page, SAM);

    await expect(page.getByRole('link', {name: 'Locations'})).toHaveCount(0);
  });
});
