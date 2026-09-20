// Shared LOC light-theme surface. `as` picks the element, `hover` adds the
// lift interaction the homepage cards use, `padded` adds the standard inset.
export default function LocCard({ as: Tag = 'div', hover = false, padded = true, className = '', children, ...rest }) {
  const cls = [
    'loc-card',
    hover ? 'loc-card-hover' : '',
    padded ? 'p-5 sm:p-6' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  )
}
