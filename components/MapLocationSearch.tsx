'use client'
import { useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'

export type GeoResult = {
  id: string
  place_name: string
  center: [number, number]
  bbox?: [number, number, number, number]
  geometry?: GeoJSON.Geometry
  note?: string
}

type Props = {
  onSelect: (result: GeoResult) => void
}

export default function MapLocationSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = (q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim() || q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
        if (!res.ok) return
        const data = await res.json()
        setResults(data)
        setOpen(data.length > 0)
      } catch { /* optional */ }
    }, 300)
  }

  const clear = () => {
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const pick = (r: GeoResult) => {
    onSelect(r)
    clear()
  }

  const panelOpen = open && results.length > 0

  return (
    <div className="ui-map-geo-anchor">
      <div className={`ui-map-geo-wrap${panelOpen ? ' ui-map-geo-wrap--open' : ''}`}>
        <div className={`ui-map-geo-bar${focused ? ' ui-map-geo-bar--focused' : ''}`}>
          <MapPin size={14} className="ui-map-geo-bar__icon" aria-hidden />
          <input
            value={query}
            onChange={e => search(e.target.value)}
            onFocus={() => { setFocused(true); results.length > 0 && setOpen(true) }}
            onBlur={() => setTimeout(() => { setFocused(false); setOpen(false) }, 150)}
            onKeyDown={e => { if (e.key === 'Escape') clear() }}
            placeholder="Find a place…"
            aria-label="Search location on map"
          />
          {query && (
            <button type="button" className="ui-map-geo-bar__clear" onClick={clear} aria-label="Clear">
              <X size={13} />
            </button>
          )}
        </div>

        {panelOpen && (
          <ul className="ui-map-geo-panel">
            {results.map(r => (
              <li key={r.id}>
                <button type="button" className="ui-map-geo-item" onMouseDown={() => pick(r)}>
                  <span className="ui-map-geo-item__label">{r.place_name}</span>
                  {r.note && <span className="ui-map-geo-item__note">{r.note}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
