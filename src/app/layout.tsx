import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Afterword — commitments from a recorded discussion",
  description:
    "Upload a recorded project discussion and get the final agreed tasks, owners, deadlines and open questions, each with a playable timestamped quote.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}