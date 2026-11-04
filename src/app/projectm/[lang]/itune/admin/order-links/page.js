import ItuneOrderAccounts from "@/components/itune-order-accounts";
export default async function OrderLinksPage({ params }) { const { lang } = await params; return <ItuneOrderAccounts lang={lang} />; }
