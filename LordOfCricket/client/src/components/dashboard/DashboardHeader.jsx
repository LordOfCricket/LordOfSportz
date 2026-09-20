function timeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardHeader({ name }) {
  const firstName = name?.split(' ')[0] || 'Player'

  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">
        {timeGreeting()}, {firstName} 👋
      </h1>
      <p className="mt-2 text-slate-300">Here's what's happening with your cricket.</p>
    </div>
  )
}
