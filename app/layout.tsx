import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Darul Aman Mentimeter",
  description: "Realtime interactive presentations powered by Supabase.",
  icons: {
    icon: "data:image/x-icon;base64,"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
