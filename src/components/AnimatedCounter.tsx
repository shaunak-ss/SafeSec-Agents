import { useEffect } from "react"
import { useMotionValueEvent, useSpring } from "framer-motion"
import { useState } from "react"
import { cn } from "@/lib/utils"

type AnimatedCounterProps = {
  value: number
  className?: string
}

export function AnimatedCounter({ value, className }: AnimatedCounterProps) {
  const spring = useSpring(value, { stiffness: 140, damping: 22, mass: 0.6 })
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  useMotionValueEvent(spring, "change", (latest) => {
    setDisplay(Math.round(latest))
  })

  return <span className={cn("tabular-nums", className)}>{display}</span>
}
