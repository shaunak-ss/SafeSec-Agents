export const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.25, ease: easeOutExpo },
}

export const feedListVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.04 },
  },
}

export const feedItemVariants = {
  hidden: { opacity: 0, y: -10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: easeOutExpo },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.18, ease: easeOutExpo },
  },
}
