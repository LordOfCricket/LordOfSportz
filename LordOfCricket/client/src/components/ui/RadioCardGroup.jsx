// Generic labeled radio-card picker — same visual language as Input/Select
// (rounded-2xl, white/10 borders, emerald focus/selected state) so it drops
// into any existing profile-family form without introducing a second style.
// Used for every "pick exactly one of a short list" question in the Player
// Profile onboarding/edit forms (batting style, wicketkeeper, bowl y/n,
// bowling arm/type/spin type) instead of one flat dropdown per question.
export default function RadioCardGroup({ label, name, options, value, onChange, className = 'sm:grid-cols-2' }) {
  return (
    <div>
      {label && <span className="mb-3 block text-sm font-semibold tracking-wide text-slate-200">{label}</span>}
      <div className={`grid grid-cols-1 gap-3 ${className}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-5 py-3.5 backdrop-blur-md transition-all duration-200 ${
              value === option.value ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/15 bg-white/5 hover:border-white/30'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-emerald-400"
            />
            <span className="text-sm font-semibold text-white">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
