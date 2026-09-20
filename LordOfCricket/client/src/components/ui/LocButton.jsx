import { Link } from 'react-router-dom'

// Shared LOC light-theme button. `variant`: 'solid' (default) | 'outline'.
// Renders an <a>/<Link> when `to`/`href` is given, else a <button>.
export default function LocButton({ variant = 'solid', to, href, className = '', children, ...rest }) {
  const cls = `${variant === 'outline' ? 'loc-btn-outline' : 'loc-btn'} ${className}`.trim()
  if (to) {
    return (
      <Link to={to} className={`${cls} no-underline`} {...rest}>
        {children}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={`${cls} no-underline`} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  )
}
