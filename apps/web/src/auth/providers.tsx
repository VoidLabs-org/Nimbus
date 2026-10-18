import { GitHubIcon, GoogleIcon } from "./ProviderIcons";

/**
 * What each sign-in provider id from the server looks like here, in the order to show them. An id not listed is not
 * shown.
 */
export const PROVIDERS = [
  { id: "google", name: "Google", icon: <GoogleIcon /> },
  { id: "github", name: "GitHub", icon: <GitHubIcon /> },
];
