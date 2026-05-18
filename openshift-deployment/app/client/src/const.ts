export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * No authentication in autonomous mode.
 * getLoginUrl returns "#" (no-op) since there is no OAuth provider.
 */
export const getLoginUrl = () => "#";
