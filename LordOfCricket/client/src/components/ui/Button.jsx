export default function Button({
  type = 'button',
  children,
  className = '',
  ...rest
}) {
  return (
    <button
      type={type}
      className={`
        h-14
        rounded-2xl
        bg-gradient-to-r
        from-green-700
        via-green-500
        to-lime-500
        px-6
        font-semibold
        text-white
        shadow-xl
        shadow-green-900/40
        transition-all
        duration-300
        hover:scale-[1.02]
        hover:brightness-110
        active:scale-[0.98]
        disabled:cursor-not-allowed
        disabled:opacity-50
        ${className}
      `}
      {...rest}
    >
      {children}
    </button>
  )
}