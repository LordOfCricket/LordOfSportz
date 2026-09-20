import { Link } from 'react-router-dom'
import { PlusCircle, Search, ArrowRight } from 'lucide-react'
import Navbar from '../../components/home/Navbar.jsx'
import BackButton from '../../components/common/BackButton.jsx'

// §1 — the "Register Your Ground" CTA (FinalCtaSection.jsx) now lands here
// first, not directly on the form: a simple choice between starting a new
// registration and checking an existing one's status.
export default function RegisterGroundEntryPage() {
  return (
    <div className="loc-page overflow-x-hidden">
      <Navbar theme="light" />

      <main className="relative mx-auto flex max-w-3xl flex-col gap-8 px-6 pt-32 pb-20 lg:px-10">
        <BackButton label="Back to LOC" fallback="/" className="w-fit" />

        <div className="text-center">
          <span className="loc-eyebrow">Register Your Ground</span>
          <h1 className="mt-2 text-3xl font-bold text-loc-navy sm:text-4xl">List your ground on LordOfCricket</h1>
          <p className="mt-3 text-loc-muted">List your cricket ground on LordOfCricket and make it discoverable to players and cricket communities.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Link
            to="/register-ground/new"
            className="group flex flex-col gap-3 rounded-2xl loc-card p-7 text-left transition-all hover:-translate-y-1 hover:border-loc-green hover:bg-loc-mint"
          >
            <PlusCircle className="h-8 w-8 text-loc-green" aria-hidden="true" />
            <h2 className="text-xl font-bold text-loc-navy">New Registration</h2>
            <p className="text-sm text-loc-muted">Register a new cricket ground on LOC.</p>
            <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-loc-green">
              New Registration <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>

          <Link
            to="/register-ground/check"
            className="group flex flex-col gap-3 rounded-2xl loc-card p-7 text-left transition-all hover:-translate-y-1 hover:border-loc-green hover:bg-loc-mint"
          >
            <Search className="h-8 w-8 text-loc-green" aria-hidden="true" />
            <h2 className="text-xl font-bold text-loc-navy">Check Registration Status</h2>
            <p className="text-sm text-loc-muted">Already submitted a ground? Check your registration status.</p>
            <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-loc-green">
              Check Registration Status <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </main>
    </div>
  )
}
