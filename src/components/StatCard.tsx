import { cn } from "@/lib/utils"

type StatCardProps = {
  label: string
  value: string
  danger?: boolean
  warning?: boolean
  muted?: boolean
}

export function StatCard({ label, value, danger, warning, muted }: StatCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-2xl font-semibold",
          danger && "text-breach-gradient",
          warning && "text-amber-300",
          muted && "text-zinc-400",
          !danger && !warning && !muted && "text-zinc-100",
        )}
      >
        {value}
      </p>
    </div>
  )
}
