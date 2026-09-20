/** LordOfSportz hub (all sports). Dev fallback only outside production; empty hides the links. */
export const HUB_URL: string =
  process.env["NEXT_PUBLIC_HUB_URL"] || (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
