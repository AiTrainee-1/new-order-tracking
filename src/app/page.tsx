import { redirect } from "next/navigation";

/** Never actually rendered: proxy.ts redirects "/" before it gets here. Kept
 *  as a fallback redirect so the route can't show a stray placeholder page. */
export default function Home() {
  redirect("/login");
}
