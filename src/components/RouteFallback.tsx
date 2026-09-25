import { Loader2 } from "lucide-react"

/** Suspense fallback shown while a lazy-loaded route chunk is fetched. */
export function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
    </div>
  )
}
