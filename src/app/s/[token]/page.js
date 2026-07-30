import ShareView from "@/components/share-view";

// A shared link is meant for the people it was handed to, not for search
// engines: the token is the only thing standing between the table and the open
// internet, and an indexed copy would outlive a revoked link.
export const metadata = {
  title: "GameDB — ตารางที่แชร์",
  robots: { index: false, follow: false },
};

export default async function SharedQueryPage({ params }) {
  const { token } = await params;
  return <ShareView token={token} />;
}
