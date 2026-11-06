import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './AuthGate'
import { AppLayout } from '../components/AppLayout'
import { SignInPage } from '../features/auth/SignInPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { VisitorsPage } from '../features/visitors/VisitorsPage'
import { DecisionRegistrationPage, DecisionsModule, DecisionsPage } from '../features/decisions/DecisionsPage'
import { PertencerPage } from '../features/pertencer/PertencerPage'
import { PublicVisitorPage } from '../features/visitors/PublicVisitorPage'
import { SchedulePage } from '../features/schedule/SchedulePage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<SignInPage />} />
      <Route path="/visitante" element={<PublicVisitorPage />} />
      <Route element={<AuthGate />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/visitantes" element={<VisitorsPage />} />
          <Route path="/decisoes" element={<DecisionsModule />}>
            <Route index element={<DecisionsPage />} />
            <Route path="nova" element={<DecisionRegistrationPage />} />
          </Route>
          <Route path="/pertencer" element={<PertencerPage />} />
          <Route path="/escala" element={<SchedulePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
