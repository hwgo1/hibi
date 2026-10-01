import type { ReactNode } from "react";
import { RootDocument } from "@/components/RootDocument";
import { pt } from "@/content/pt";
import { metadataFor } from "@/lib/site";

export { viewport } from "@/lib/site";
export const metadata = metadataFor(pt);

export default function Layout({ children }: { children: ReactNode }) {
  return <RootDocument lang={pt.htmlLang}>{children}</RootDocument>;
}
