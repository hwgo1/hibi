import type { Metadata, Viewport } from "next";
import type { Dictionary } from "@/content/types";

export const SITE_URL = "https://hibi.pages.dev";
export const REPO_URL = "https://github.com/hwgo1/hibi";

export const viewport: Viewport = { themeColor: "#141419" };

export function metadataFor(dict: Dictionary): Metadata {
  return {
    metadataBase: new URL(SITE_URL),
    title: dict.meta.title,
    description: dict.meta.description,
    icons: { icon: "/assets/favicon.png" },
    alternates: { canonical: dict.path, languages: { en: "/", "pt-BR": "/pt" } },
    openGraph: {
      type: "website",
      url: dict.path,
      locale: dict.ogLocale,
      title: dict.meta.title,
      description: dict.meta.description,
      images: [{ url: "/assets/og.png", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
  };
}
