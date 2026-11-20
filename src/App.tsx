import { Navigate, Outlet, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/app-shell"
import { LoginForm } from "@/components/login-form"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AboutView } from "@/components/views/about-view"
import { AlertsView } from "@/components/views/alerts-view"
import { DashboardView } from "@/components/views/dashboard-view"
import { OltsView } from "@/components/views/olts-view"
import { OnusView } from "@/components/views/onus-view"
import { SettingsView } from "@/components/views/settings-view"
import { SystemView } from "@/components/views/system-view"
import { AuthProvider } from "@/context/auth-context"
import { MonitoringProvider } from "@/context/monitoring-context"
import { MapOnuPage } from "@/pages/map-onu-page"

function ProtectedLayout() {
  return (
    <MonitoringProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </MonitoringProvider>
  )
}

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DashboardView />} />
            <Route path="/olts" element={<OltsView />} />
            <Route path="/onus" element={<OnusView />} />
            <Route path="/map" element={<MapOnuPage />} />
            <Route path="/alerts" element={<AlertsView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="/system" element={<SystemView />} />
            <Route path="/about" element={<AboutView />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </TooltipProvider>
  )
}
