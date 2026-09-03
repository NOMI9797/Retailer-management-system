import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  tone?: "default" | "primary" | "grain" | "consigned";
};

// The one component powering every metric card on the Dashboard,
// Reports, and Customer Accounts screens — see the dashboard mockup
// for how "today's sales" / "cash in hand" / "shop owes farmers" all
// come from this same component with a different tone.
const toneClasses: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-neutral-900",
  primary: "text-primary-600",
  grain: "text-grain-600",
  consigned: "text-consigned-600",
};

export function StatCard({ label, value, tone = "default" }: StatCardProps) {
  return (
    <div className="rounded bg-neutral-50 p-4">
      <p className="mb-1.5 text-[13px] text-neutral-400">{label}</p>
      <p className={cn("text-[22px] font-medium", toneClasses[tone])}>{value}</p>
    </div>
  );
}
