export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  if (typeof window === "undefined") return "/login";
  const redirect = `${window.location.pathname}${window.location.search}`;
  return `/login?redirect=${encodeURIComponent(redirect)}`;
};
