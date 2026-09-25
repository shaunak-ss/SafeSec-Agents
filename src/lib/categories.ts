import type { OwaspCategory } from "@/api/types"

export const CATEGORY_META: Record<
  OwaspCategory,
  { label: string; short: string; className: string }
> = {
  LLM01: {
    label: "Prompt Injection",
    short: "LLM01",
    className: "border-violet-400/30 bg-violet-500/10 text-violet-300",
  },
  LLM02: {
    label: "Sensitive Info Disclosure",
    short: "LLM02",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  },
  LLM06: {
    label: "Excessive Agency",
    short: "LLM06",
    className: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  },
  LLM07: {
    label: "System Prompt Leakage",
    short: "LLM07",
    className: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300",
  },
}

export const CATEGORY_ORDER: OwaspCategory[] = ["LLM01", "LLM02", "LLM06", "LLM07"]
