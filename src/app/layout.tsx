import type { Metadata } from "next";
import { Geist } from "next/font/google";

import "@/app/globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Gnosis Merch Shop",
  description: "CRC merch checkout for in-person booth sales.",
  icons: {
    icon: "/circles-logo.svg",
    shortcut: "/circles-logo.svg",
    apple: "/circles-logo.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={cn(geist.variable, "min-h-screen antialiased")}>
        {children}
      </body>
    </html>
  );
}
