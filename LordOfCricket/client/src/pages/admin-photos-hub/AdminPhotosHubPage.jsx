import { Link } from 'react-router-dom'
import { Image, GalleryHorizontal, Trees, Handshake } from 'lucide-react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'

const SECTIONS = [
  { to: '/admin/photos', icon: Image, title: 'Ground Photos', description: 'Homepage/ground photo carousel.' },
  { to: '/admin/gallery', icon: GalleryHorizontal, title: 'Gallery', description: 'Match, tournament and event gallery.' },
  { to: '/admin/amenities', icon: Trees, title: 'Amenities', description: 'Ground amenities showcased on the site.' },
  { to: '/admin/partners', icon: Handshake, title: 'Partners', description: 'Partner/sponsor logos.' },
]

export default function AdminPhotosHubPage() {
  return (
    <AdminLayout title="Edit Photos" subtitle="Manage the images shown across the website, organized by section.">
      <div className="grid gap-6 sm:grid-cols-2">
        {SECTIONS.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="flex items-start gap-4 rounded-[28px] border border-white/10 bg-white/10 p-6 shadow-lg shadow-slate-950/20 backdrop-blur-sm transition hover:border-green-300/40 hover:bg-white/15"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-500/20 text-green-300">
              <Icon size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{title}</h3>
              <p className="mt-2 text-sm text-slate-300">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </AdminLayout>
  )
}
