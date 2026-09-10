import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Triangle } from "lucide-react";
import "./globals.css";

import { GitHubIcon } from "@/components/icons/github";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Preview Reel",
  description:
    "Automatic demo videos of PR features, recorded on their Vercel preview deployment.",
};

function SiteFooter() {
  return (
    <footer className="sticky bottom-0 z-10 mt-auto border-t bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-10 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2 text-xs text-muted-foreground sm:px-8">
        <span>Authored by Evan Gabrielson</span>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://webreel.dev"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            WebReel
          </a>
          <a
            href="https://vercel.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <Triangle className="size-3 fill-current" aria-hidden="true" />
            Vercel
          </a>
          <a
            href="https://github.com/evangabe/preview-reel"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            aria-label="Preview Reel on GitHub"
          >
            <GitHubIcon className="size-3.5" aria-hidden="true" />
            Source
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
