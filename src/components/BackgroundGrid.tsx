export function BackgroundGrid() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[#0A0B0D]" />
      <div className="bg-grid absolute inset-0 opacity-100" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.12),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(168,85,247,0.08),transparent_50%)]" />
      <div className="scanline absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-transparent via-white/5 to-transparent opacity-40" />
    </div>
  )
}
