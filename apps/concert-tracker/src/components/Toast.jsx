import { Icon } from './ui.jsx'

export function Toasts({ items }) {
  return (
    <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind || ''}`}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'info' ? 'info' : 'check-circle'} size={16} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
