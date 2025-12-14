import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";

export const metadata: Metadata = {
  title: "Manpower Attendance System",
  description: "Production-ready Manpower Attendance Automation System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

