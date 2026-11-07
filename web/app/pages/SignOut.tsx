import { redirect, redirectDocument } from "react-router";
import { authKernel } from "../core/kernel/authKernel";

/**
 * Posted by the top bar's sign-out confirmation, which says it is signing out until the sign-in page loads. Ends the sign-in,
 * then loads the sign-in page with a full navigation: nothing of the old sign-in (a query's data, a form's state) survives.
 * The form submits with `replace`, so Back does not return to the screen that was signed out of.
 */
export async function clientAction() {
  await authKernel.signOutAsync();
  return redirectDocument("/sign-in");
}

/** Nothing to show: the route only has its action. Visiting it goes back to Home. */
export async function clientLoader() {
  throw redirect("/");
}
