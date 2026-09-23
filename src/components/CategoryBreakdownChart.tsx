import { motion } from "framer-motion"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { CategoryBreakdown } from "@/api/types"
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/categories"

type CategoryBreakdownChartProps = {
  breakdown: CategoryBreakdown
}

export function CategoryBreakdownChart({ breakdown }: CategoryBreakdownChartProps) {
  const data = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_META[category].label,
    tested: breakdown[category].tested,
    broke_through: breakdown[category].broke_through,
    inconclusive: breakdown[category].inconclusive,
  }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="glass rounded-2xl p-5"
    >
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-200">Category breakdown</h3>
          <p className="mt-1 text-xs text-zinc-500">Tested vs broke through, by OWASP LLM category</p>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-indigo-500" /> tested
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-red-500" /> broke through
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber-500" /> inconclusive
          </span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={6} barCategoryGap="28%">
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="category"
              tick={{ fill: "#a1a1aa", fontSize: 12, fontFamily: "JetBrains Mono" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "#71717a", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
              contentStyle={{
                background: "#18181b",
                border: "1px solid #27272a",
                borderRadius: 12,
                fontFamily: "JetBrains Mono",
                fontSize: 12,
                color: "#e4e4e7",
              }}
            />
            <Bar dataKey="tested" fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive />
            <Bar dataKey="broke_through" fill="#FF3B3B" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive />
            <Bar dataKey="inconclusive" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}
