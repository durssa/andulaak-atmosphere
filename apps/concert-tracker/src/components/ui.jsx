import { forwardRef, useEffect, useId, useRef, useState } from 'react'

const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><line x1="13" y1="5" x2="13" y2="7"/><line x1="13" y1="11" x2="13" y2="13"/><line x1="13" y1="17" x2="13" y2="19"/>',
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  sliders: '<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  crosshair: '<circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
}

export function Icon({ name, size = 16, className = '', style }) {
  const d = ICONS[name]
  if (!d) return null
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style} dangerouslySetInnerHTML={{ __html: d }} />
}

export const Button = forwardRef(function Button({ variant = 'default', size = 'md', icon, children, className = '', as: As = 'button', loading = false, ...rest }, ref) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size !== 'md' && `btn-${size}`, !children && 'btn-icon', className].filter(Boolean).join(' ')
  const type = As === 'button' && !rest.type ? 'button' : rest.type
  return (
    <As ref={ref} className={cls} type={type} {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined}>
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </As>
  )
})

export function Field({ label, id, help, children, className = '' }) {
  const auto = useId()
  const fid = id || auto
  return (
    <div className={`field ${className}`}>
      <label htmlFor={fid}>{label}</label>
      {typeof children === 'function' ? children(fid) : children}
      {help && <span className="help">{help}</span>}
    </div>
  )
}

/** Accessible dropdown menu: arrow-key navigation, Escape to close, focus returns to the trigger. */
export function Menu({ label, items, variant = 'default', size = 'sm', icon, align = 'right', testId, className = '' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const listRef = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    const first = listRef.current?.querySelector('[role="menuitem"]')
    first?.focus()
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc) }
  }, [open])

  const close = (restore = true) => { setOpen(false); if (restore) btnRef.current?.focus() }
  const onKey = (e) => {
    const els = [...(listRef.current?.querySelectorAll('[role="menuitem"]') || [])]
    const i = els.indexOf(document.activeElement)
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus() }
    else if (e.key === 'Tab') close(false)
  }

  return (
    <div className={`menu-wrap ${className}`} ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      <Button ref={btnRef} variant={variant} size={size} icon={icon} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-testid={testId}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}>
        {label} <Icon name="chevron-down" size={14} />
      </Button>
      {open && (
        <ul className={`menu ${align === 'left' ? 'left' : ''}`} role="menu" id={id} ref={listRef} onKeyDown={onKey}>
          {items.map((it, i) => it === 'sep' ? <li key={i} className="menu-sep" role="separator" /> : (
            <li key={it.key || it.label} role="none">
              {it.href ? (
                <a role="menuitem" href={it.href} target="_blank" rel="noopener noreferrer" tabIndex={-1} onClick={() => close(false)}>{it.icon && <Icon name={it.icon} size={15} />}{it.label}</a>
              ) : (
                <button type="button" role="menuitem" tabIndex={-1} className={it.danger ? 'danger' : ''} onClick={() => { close(); it.onSelect?.() }}>
                  {it.icon && <Icon name={it.icon} size={15} />}{it.label}{it.checked && <Icon name="check" size={14} className="check" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Segmented tab list with roving focus. `tabs`: [{ id, label, icon?, count? }] */
export function Segmented({ tabs, value, onChange, label, pressed = false }) {
  const refs = useRef([])
  const onKey = (e, i) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    const n = tabs.length
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : n - 1
    refs.current[next]?.focus(); onChange(tabs[next].id)
  }
  return (
    <div className="segmented" role={pressed ? 'group' : 'tablist'} aria-label={label}>
      {tabs.map((t, i) => {
        const active = t.id === value
        const a11y = pressed ? { 'aria-pressed': active } : { role: 'tab', 'aria-selected': active, tabIndex: active ? 0 : -1 }
        return (
          <button key={t.id} type="button" ref={(el) => (refs.current[i] = el)} {...a11y} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
            {t.icon && <Icon name={t.icon} size={14} />}{t.label}{t.count !== undefined && <span className="faint">({t.count})</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Tag({ tone, icon, children }) {
  return <span className={`tag ${tone ? `tag-${tone}` : ''}`}>{icon && <Icon name={icon} size={12} />}{children}</span>
}

export function Notice({ tone = 'info', children, className = '' }) {
  const icon = tone === 'danger' ? 'alert' : tone === 'warning' ? 'alert' : 'info'
  return <div className={`notice notice-${tone} ${className}`} role={tone === 'danger' ? 'alert' : 'status'}><Icon name={icon} size={16} /><div>{children}</div></div>
}

export function Empty({ icon = 'info', title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      {title && <h3>{title}</h3>}
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />
}
