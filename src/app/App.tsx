import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './AuthGate'
import { AppLayout } from '../components/AppLayout'
import { SignInPage } from '../features/auth/SignInPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { VisitorsPage } from '../features/visitors/VisitorsPage'
import { DecisionsPage } from '../features/decisions/DecisionsPage'
import { PertencerPage } from '../features/pertencer/PertencerPage'
import { PublicVisitorPage } from '../features/visitors/PublicVisitorPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<SignInPage />} />
      <Route path="/visitante" element={<PublicVisitorPage />} />
      <Route element={<AuthGate />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/visitantes" element={<VisitorsPage />} />
          <Route path="/decisoes" element={<DecisionsPage />} />
          <Route path="/pertencer" element={<PertencerPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
