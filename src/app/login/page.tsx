import { Suspense } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import { LoginForm } from "@/modules/auth/components/LoginForm";
import "../auth.css";

export const metadata = {
  title: "Log in — Shoaib Traders",
};

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});

export default function LoginPage() {
  return (
    <div className={plexSans.variable}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
