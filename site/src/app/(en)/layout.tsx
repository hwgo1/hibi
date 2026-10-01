import type { ReactNode } from "react";
import { RootDocument } from "@/components/RootDocument";
import { en } from "@/content/en";
import { metadataFor } from "@/lib/site";

export { viewport } from "@/lib/site";
export const metadata = metadataFor(en);

export default function Layout({ children }: { children: ReactNode }) {
  return <RootDocument lang={en.htmlLang}>{children}</RootDocument>;
}
