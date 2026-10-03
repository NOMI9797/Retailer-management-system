import { IBM_Plex_Sans } from "next/font/google";
import { SignupForm } from "@/modules/auth/components/SignupForm";
import "../auth.css";

export const metadata = {
  title: "Sign up — Shoaib Traders",
};

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});

export default function SignupPage() {
  return (
    <div className={plexSans.variable}>
      <SignupForm />
    </div>
  );
}
