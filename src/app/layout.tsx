import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { getStore } from "@/lib/database";

export const metadata: Metadata = {
  title: "Meridian Retail Accounting",
  description: "Double-entry accounting demo: ledger, trial balance, profit and loss, balance sheet (educational).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Shell mode={getStore().label}>{children}</Shell></body>
    </html>
  );
}
