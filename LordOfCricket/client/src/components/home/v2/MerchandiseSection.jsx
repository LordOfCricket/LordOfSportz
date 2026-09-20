import { Link } from 'react-router-dom'

const CATEGORIES = [
  { name: 'Cricket Bats', icon: '🏏' },
  { name: 'Cricket Balls', icon: '🥎' },
  { name: 'Cricket Jerseys', icon: '🎽' },
  { name: 'Cricket Shoes', icon: '👟' },
  { name: 'Cricket Accessories', icon: '🧢' },
  { name: 'Protective Gear', icon: '🧤' },
]

function CategoryCard({ name, icon }) {
  return (
    <Link
      to="/merchandise"
      className="flex h-full flex-col items-center rounded-2xl border border-loc-border bg-loc-surface p-5 no-underline shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
    >
      <div className="flex h-24 w-full items-center justify-center rounded-xl bg-loc-mint text-5xl">{icon}</div>
      <p className="mt-4 text-center text-sm font-bold text-loc-navy">{name}</p>
      <span className="mt-2 h-0.5 w-8 rounded bg-loc-green-bright" aria-hidden="true" />
    </Link>
  )
}

export default function MerchandiseSection() {
  return (
    <section className="w-full bg-loc-mint px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center gap-10 text-center">
        <h2 className="text-3xl font-black uppercase leading-tight text-loc-navy sm:whitespace-nowrap sm:text-4xl">
          Wear the Spirit of Cricket.
        </h2>

        <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((category) => (
            <CategoryCard key={category.name} name={category.name} icon={category.icon} />
          ))}
        </div>
      </div>
    </section>
  )
}
