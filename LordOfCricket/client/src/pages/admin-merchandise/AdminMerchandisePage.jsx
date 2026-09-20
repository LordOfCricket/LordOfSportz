import { Link } from 'react-router-dom'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { MERCHANDISE_CATEGORIES } from '../../lib/merchandiseCategories.js'

export default function AdminMerchandisePage() {
  return (
    <AdminLayout title="Merchandise" subtitle="Manage the LOC Store catalogue by category. Only Active and Out of Stock products appear publicly.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MERCHANDISE_CATEGORIES.map((category) => (
          <Link
            key={category.slug}
            to={`/admin/merchandise/${category.slug}`}
            className="flex flex-col gap-2 rounded-2xl border border-white/15 bg-slate-900/45 p-6 shadow-xl transition hover:border-emerald-400/40 hover:bg-slate-900/70"
          >
            <span className="text-4xl">{category.icon}</span>
            <span className="text-lg font-semibold text-white">{category.name}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Manage products →</span>
          </Link>
        ))}
      </div>
    </AdminLayout>
  )
}
