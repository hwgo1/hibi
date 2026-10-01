import type { Metadata } from "next";
import { NotFound } from "@/components/NotFound";
import { RootDocument } from "@/components/RootDocument";

export const metadata: Metadata = {
  title: "404 · hibi 日々",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <RootDocument lang="en">
      <NotFound />
    </RootDocument>
  );
}
