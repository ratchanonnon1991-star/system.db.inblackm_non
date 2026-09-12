import { redirect } from "next/navigation";
import { Noto_Sans_Thai } from "next/font/google";
import { getSessionUser } from "@/server/session-user";
import SocialFeedPage from "@/components/social-feed-page";

export const metadata = { title: "GameDB — Feed Social" };

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-social-feed",
});

export default async function FeedSocialRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  return (
    <div
      className={notoThai.variable}
      style={{ fontFamily: "var(--font-social-feed), system-ui, sans-serif" }}
    >
      <SocialFeedPage />
    </div>
  );
}
