'use client'
/**
 * Dual map engine: Mapbox when a token exists (env or Settings localStorage),
 * otherwise MapLibre + free tiles.
 */
import { forwardRef, useEffect, useState } from 'react'
import {
  default as MapboxMap,
  Marker as MapboxMarker,
  Popup as MapboxPopup,
  NavigationControl as MapboxNavigationControl,
  Source as MapboxSource,
  Layer as MapboxLayer,
} from 'react-map-gl/mapbox'
import {
  default as MaplibreMap,
  Marker as MaplibreMarker,
  Popup as MaplibrePopup,
  NavigationControl as MaplibreNavigationControl,
  Source as MaplibreSource,
  Layer as MaplibreLayer,
} from 'react-map-gl/maplibre'
import { getMapboxToken } from '@/lib/mapProvider'
import 'mapbox-gl/dist/mapbox-gl.css'
import 'maplibre-gl/dist/maplibre-gl.css'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComp = any

function usePreferMapbox(): boolean {
  const [prefer, setPrefer] = useState(() => !!getMapboxToken())
  useEffect(() => {
    const sync = () => setPrefer(!!getMapboxToken())
    sync()
    window.addEventListener('argus-mapbox-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('argus-mapbox-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return prefer
}

/** Map that switches engine when Mapbox token appears/disappears. */
export const Map = forwardRef(function ArgusMapGL(props: AnyComp, ref: AnyComp) {
  const preferMapbox = usePreferMapbox()
  const Comp = preferMapbox ? MapboxMap : MaplibreMap
  return <Comp ref={ref} {...props} />
}) as AnyComp

export const Marker: AnyComp = function MarkerSwitch(props: AnyComp) {
  const preferMapbox = usePreferMapbox()
  const Comp = preferMapbox ? MapboxMarker : MaplibreMarker
  return <Comp {...props} />
}

export const Popup: AnyComp = function PopupSwitch(props: AnyComp) {
  const preferMapbox = usePreferMapbox()
  const Comp = preferMapbox ? MapboxPopup : MaplibrePopup
  return <Comp {...props} />
}

export const NavigationControl: AnyComp = function NavSwitch(props: AnyComp) {
  const preferMapbox = usePreferMapbox()
  const Comp = preferMapbox ? MapboxNavigationControl : MaplibreNavigationControl
  return <Comp {...props} />
}

export const Source: AnyComp = function SourceSwitch(props: AnyComp) {
  const preferMapbox = usePreferMapbox()
  const Comp = preferMapbox ? MapboxSource : MaplibreSource
  return <Comp {...props} />
}

export const Layer: AnyComp = function LayerSwitch(props: AnyComp) {
  const preferMapbox = usePreferMapbox()
  const Comp = preferMapbox ? MapboxLayer : MaplibreLayer
  return <Comp {...props} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MapRef = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MapMouseEvent = any
