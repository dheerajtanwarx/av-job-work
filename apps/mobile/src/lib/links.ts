import { router, type Href } from "expo-router";

/**
 * The API hands out web paths (`/jobs/:id`, `/returns/:id`, `/bills/sub/:id`, `/jobs?status=overdue`,
 * `/reports?report=…`). App routes mirror those paths exactly, so they open as-is.
 */
export function openHref(href: string) {
  const path = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api(?=\/)/, "");
  router.push(path as Href);
}
