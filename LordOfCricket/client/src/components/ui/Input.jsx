import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// `light` opts into the shared LOC light theme (loc-input token + navy label);
// default keeps the legacy dark glass style used by non-migrated pages.
export default function Input({ label, className = '', type, light = false, ...props }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  const fieldClass = light
    ? `loc-input w-full px-4 py-3 text-base ${isPassword ? 'pr-14' : ''} ${className}`
    : `
        w-full
        rounded-2xl
        border
        border-white/15
        bg-white/5
        px-5
        py-4
        text-base
        text-white
        placeholder:text-slate-400
        backdrop-blur-md
        outline-none
        transition-all
        duration-300
        focus:border-green-400
        focus:bg-white/10
        focus:ring-4
        focus:ring-green-500/20
        ${isPassword ? 'pr-14' : ''}
        ${className}
      `

  return (
    <label className="block">
      {label && (
        <span className={`mb-3 block text-sm font-semibold tracking-wide ${light ? 'text-loc-ink' : 'text-slate-200'}`}>
          {label}
        </span>
      )}

      <div className="relative">
        <input type={isPassword && showPassword ? 'text' : type} className={fieldClass} {...props} />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className={`absolute inset-y-0 right-0 flex items-center px-4 transition-colors ${
              light ? 'text-loc-muted hover:text-loc-navy' : 'text-slate-400 hover:text-white'
            }`}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
    </label>
  )
}
