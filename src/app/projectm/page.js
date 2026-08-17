import { redirect } from "next/navigation";
import { DEFAULT_LANG } from "@/lib/projectm-i18n";

export default function ProjectmRootPage() {
  redirect(`/projectm/${DEFAULT_LANG}`);
}
