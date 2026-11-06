import { redirect } from "react-router";
import { authKernel } from "../core/kernel/authKernel";
import { systemQueries } from "../core/queries/systemQueries";

/**
 * Posted by the top bar's sign-out confirmation. Clears the session and the app's cache, asks the browser to drop what it
 * kept of the service's answers, then shows the sign-in page.
 */
export async function clientAction() {
  // Both at once: ending the sign-in on the service, and the browser dropping what it kept of the service's answers.
  await Promise.all([authKernel.signOutAsync(), systemQueries.clearBrowserCacheAsync()]);
  return redirect("/sign-in");
}

/** Nothing to show: the route only has its action. Visiting it goes back to Home. */
export async function clientLoader() {
  throw redirect("/");
}
