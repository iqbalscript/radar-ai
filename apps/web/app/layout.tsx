import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RADAR AI",
  description: "Research prototype for brain CT review assistance.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
