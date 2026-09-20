// Shared LOC light-theme form control. Renders a labelled input, textarea,
// or select (`as`). Uses the .loc-input token class.
export default function LocField({ label, as = 'input', className = '', children, ...props }) {
  const cls = `loc-input w-full ${className}`.trim()
  const control =
    as === 'textarea' ? (
      <textarea className={cls} {...props} />
    ) : as === 'select' ? (
      <select className={cls} {...props}>
        {children}
      </select>
    ) : (
      <input className={cls} {...props} />
    )

  if (!label) return control
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-loc-ink">{label}</span>
      {control}
    </label>
  )
}
