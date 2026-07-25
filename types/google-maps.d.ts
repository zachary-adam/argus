// Minimal ambient declarations for Google Maps JS API (loaded dynamically)
declare namespace google {
  namespace maps {
    class Map {
      constructor(div: HTMLElement, opts?: object)
    }
    class StreetViewService {
      getPanorama(request: object, cb: (data: any, status: string) => void): void
    }
    class StreetViewPanorama {
      constructor(div: HTMLElement, opts?: object)
    }
    namespace places {
      class PlacesService {
        constructor(map: Map)
        nearbySearch(request: object, cb: (results: any[], status: string) => void): void
      }
    }
  }
}

interface Window {
  google: typeof google
}
