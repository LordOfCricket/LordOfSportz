import { useRoleSelect } from '../../hooks/useRoleSelect.js'

export default function RoleSelectPage() {
  const { name, submitting, error, choosePlayer } = useRoleSelect()

  return (
    <main
      className="min-h-screen bg-cover bg-center bg-no-repeat text-white"
      style={{
        backgroundImage: `
          linear-gradient(
            rgba(2,6,23,0.72),
            rgba(2,6,23,0.72)
          ),
          url('/images/cricket-stadium.jpg')
        `,
      }}
    >
      <section className="mx-auto flex min-h-screen max-w-7xl items-center px-8 lg:px-16">
        <div className="max-w-2xl">
          <h1 className="text-5xl font-extrabold">
            {name ? `Welcome, ${name}` : 'Welcome'}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-300">How will you be using LOC today?</p>

          <div className="mt-10 w-full max-w-2xl rounded-[36px] border border-white/20 bg-white/10 p-10 backdrop-blur-2xl shadow-2xl">
            {error && (
              <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-rose-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6">
              <button
                type="button"
                disabled={submitting}
                onClick={choosePlayer}
                className="rounded-3xl border border-white/10 bg-white/5 p-8 text-left transition-all duration-300 hover:border-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <h3 className="text-3xl font-bold">👤 Player</h3>
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
