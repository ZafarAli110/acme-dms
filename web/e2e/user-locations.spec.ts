import {expect, type Locator, type Page, test} from '@playwright/test';
import {MARIA, RITA, SAM, signInAsync} from './support/demo-users';

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
  test('the manager gives an advisor a third rooftop and takes it away again', async ({page}) => {
    await signInAsync(page, MARIA);
    await page.goto('/locations');
    const samAtWestgate = assignment(page, SAM, 'NWM-W');
    await expect(samAtWestgate).not.toBeChecked();

    await toggleAndSaveAsync(page, samAtWestgate);
    await expect(samAtWestgate).toBeChecked();
    await page.reload();
    await expect(samAtWestgate).toBeChecked();

    await toggleAndSaveAsync(page, samAtWestgate);
    await expect(samAtWestgate).not.toBeChecked();
  });

  test("an advisor's only rooftop can't be taken away, and the manager's own row is locked", async ({page}) => {
    await signInAsync(page, MARIA);
    await page.goto('/locations');
    const ritaAtRiverside = assignment(page, RITA, 'NWM-R');
    const ritaAtWestgate = assignment(page, RITA, 'NWM-W');
    // Rita works at two rooftops; down to one, that one can't go.
    await toggleAndSaveAsync(page, ritaAtWestgate);

    await toggleAndSaveAsync(page, ritaAtRiverside);

    await expect(page.getByTestId('assignment-error')).toHaveText(
      'Rita Service Advisor must keep at least one location.',
    );
    await expect(ritaAtRiverside).toBeChecked();
    await expect(assignment(page, MARIA, 'NWM-N')).toBeDisabled();
    await toggleAndSaveAsync(page, ritaAtWestgate);
    await expect(ritaAtWestgate).toBeChecked();
  });

  test('an advisor has no Locations page', async ({page}) => {
    await signInAsync(page, SAM);

    await expect(page.getByRole('link', {name: 'Locations'})).toHaveCount(0);
  });
});
