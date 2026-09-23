import { LayoutDashboard, Shield } from "lucide-react"
import { Link } from "react-router-dom"
import { USE_MOCK } from "@/api/client"

type AppHeaderProps = {
  scanId?: string
}

export function AppHeader({ scanId }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4">
      <Link to="/" className="flex items-center gap-2 text-zinc-100">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient shadow-[0_0_18px_rgba(99,102,241,0.35)]">
          <Shield className="h-4 w-4 text-white" />
        </span>
        <span className="text-sm font-semibold tracking-tight">SafeSec Agents</span>
      </Link>
      <div className="flex items-center gap-3">
        {scanId && (
          <span className="hidden font-mono text-xs text-zinc-500 sm:inline">{scanId}</span>
        )}
        <Link
          to="/dashboard"
          className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <LayoutDashboard className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        {USE_MOCK && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
            mock
          </span>
        )}
      </div>
    </header>
  )
}
