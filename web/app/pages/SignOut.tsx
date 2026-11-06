import { redirect } from "react-router";
import { authKernel } from "../core/kernel/authKernel";

/** Posted by the top bar's sign-out confirmation. Clears the session and the cache, ends the sign-in on the service, then shows the sign-in page. */
export async function clientAction() {
  await authKernel.signOutAsync();
  return redirect("/sign-in");
}

/** Nothing to show: the route only has its action. Visiting it goes back to Home. */
export async function clientLoader() {
  throw redirect("/");
}
