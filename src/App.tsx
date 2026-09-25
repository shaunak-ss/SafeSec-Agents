import { AnimatePresence } from "framer-motion"
import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RouteFallback } from "@/components/RouteFallback"

// Route-level code splitting: each page (and anything only it pulls in, e.g.
// Report.tsx's recharts dependency) ships as its own chunk instead of one
// ~900 KB upfront bundle, so the initial load only pays for the route the
// user actually landed on.
const ScanForm = lazy(() => import("@/pages/ScanForm"))
const Dashboard = lazy(() => import("@/pages/Dashboard"))
const ScanRoute = lazy(() => import("@/pages/LiveScan"))

export default function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <AnimatedRoutes />
        <Toaster theme="dark" position="top-center" richColors />
      </BrowserRouter>
    </TooltipProvider>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<ScanForm />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/scans/:id" element={<ScanRoute />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  )
}
