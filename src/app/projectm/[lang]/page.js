import { redirect } from "next/navigation";

export default async function ProjectmLangPage({ params }) {
  const { lang } = await params;
  redirect(`/projectm/${lang}/itune`);
}
