import { Outlet } from 'react-router-dom'
import OfflineBanner from './OfflineBanner.jsx'
import SmoothScrollProvider from './SmoothScrollProvider.jsx'

export default function Layout() {
  return (
    <SmoothScrollProvider>
      <div className="min-h-screen">
        <OfflineBanner />
        <Outlet />
      </div>
    </SmoothScrollProvider>
  )
}
