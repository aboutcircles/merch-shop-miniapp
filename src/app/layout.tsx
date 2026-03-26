import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import "@/app/globals.css";
import { cn } from "@/lib/utils";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Circles EthCC shop",
  description: "Tablet-first CRC merch checkout for in-person booth sales.",
  icons: {
    icon: "/circles-logo.svg",
    shortcut: "/circles-logo.svg",
    apple: "/circles-logo.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={cn(spaceGrotesk.variable, jetBrainsMono.variable, "min-h-screen antialiased")}>
        {children}
      </body>
    </html>
  );
}
