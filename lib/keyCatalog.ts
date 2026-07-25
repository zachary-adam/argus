/**
 * Single catalog of every integration key ARGUS knows about.
 * Settings → Integrations and first-run setup both read from here.
 */

export type KeyField = {
  name: string
  label: string
  placeholder: string
  hint: string
  type?: 'password' | 'text' | 'email'
  /** Public token — also mirrored to localStorage so the map can use it without rebuild. */
  clientPublic?: boolean
  /** Hosted / cloud only — still shown so local users know what exists. */
  hostedOnly?: boolean
  /** Skip on first-run checklist (internal / flags). */
  skipSetup?: boolean
}

export type KeySection = {
  id: string
  title: string
  blurb: string
  fields: KeyField[]
}

export const KEY_SECTIONS: KeySection[] = [
  {
    id: 'map',
    title: 'Map',
    blurb: 'Optional. Without Mapbox, ARGUS uses a free OpenStreetMap basemap (MapLibre).',
    fields: [
      {
        name: 'NEXT_PUBLIC_MAPBOX_TOKEN',
        label: 'Mapbox (optional)',
        placeholder: 'pk.eyJ1...',
        hint: 'Richer basemap + 3D terrain. Free map works with no key. account.mapbox.com — set here or in .env.local (restart if using .env only).',
        type: 'password',
        clientPublic: true,
      },
      {
        name: 'GOOGLE_MAPS_KEY',
        label: 'Google Maps',
        placeholder: 'AIza...',
        hint: 'Place context / geocode enrichment on event detail — console.cloud.google.com',
        type: 'password',
      },
      {
        name: 'NEXT_PUBLIC_GOOGLE_MAPS_KEY',
        label: 'Google Maps (public)',
        placeholder: 'AIza...',
        hint: 'Same as above when the browser Maps JS library needs a public key. Optional if GOOGLE_MAPS_KEY is set server-side.',
        type: 'password',
        clientPublic: true,
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI (optional)',
    blurb: 'Not required. Without these, rules-based briefs and scoring still work.',
    fields: [
      {
        name: 'ANTHROPIC_API_KEY',
        label: 'Anthropic (Claude)',
        placeholder: 'sk-ant-api03-...',
        hint: 'Preferred for AI briefs and analysis — console.anthropic.com',
        type: 'password',
      },
      {
        name: 'OPENAI_API_KEY',
        label: 'OpenAI',
        placeholder: 'sk-proj-...',
        hint: 'Fallback AI + embeddings for semantic ranking — platform.openai.com',
        type: 'password',
      },
    ],
  },
  {
    id: 'search',
    title: 'Search & news',
    blurb: 'Recommended for rich event collect. Serper or Brave is enough; both is fine.',
    fields: [
      {
        name: 'SERPER_API_KEY',
        label: 'Serper',
        placeholder: 'Your Serper API key',
        hint: 'Google results for aimed collect — serper.dev',
        type: 'password',
      },
      {
        name: 'BRAVE_API_KEY',
        label: 'Brave Search',
        placeholder: 'BSA...',
        hint: 'Web search alternative / complement — api.search.brave.com',
        type: 'password',
      },
      {
        name: 'NEWSAPI_KEY',
        label: 'NewsAPI',
        placeholder: 'Your NewsAPI key',
        hint: 'Headlines connector — newsapi.org',
        type: 'password',
      },
      {
        name: 'GUARDIAN_API_KEY',
        label: 'The Guardian',
        placeholder: 'Your Guardian API key',
        hint: 'Guardian articles — open-platform.theguardian.com',
        type: 'password',
      },
      {
        name: 'FIRECRAWL_API_KEY',
        label: 'Firecrawl',
        placeholder: 'fc-...',
        hint: 'Full article text when adding sources — firecrawl.dev',
        type: 'password',
      },
      {
        name: 'SEMANTIC_SCHOLAR_API_KEY',
        label: 'Semantic Scholar',
        placeholder: 'Your S2 API key',
        hint: 'Higher rate limits for paper search — semanticscholar.org',
        type: 'password',
      },
    ],
  },
  {
    id: 'conflict',
    title: 'Conflict & crisis data',
    blurb: 'Optional structured feeds for political-risk / conflict missions.',
    fields: [
      {
        name: 'ACLED_EMAIL',
        label: 'ACLED Email',
        placeholder: 'you@example.com',
        hint: 'myACLED account email — acleddata.com',
        type: 'email',
      },
      {
        name: 'ACLED_PASSWORD',
        label: 'ACLED Password',
        placeholder: 'myACLED password',
        hint: 'OAuth login password (not a legacy API key)',
        type: 'password',
      },
      {
        name: 'NASA_FIRMS_KEY',
        label: 'NASA FIRMS',
        placeholder: 'Your FIRMS map key',
        hint: 'Wildfire / thermal hotspots — firms.modaps.eosdis.nasa.gov',
        type: 'password',
      },
    ],
  },
  {
    id: 'live',
    title: 'Live tracking',
    blurb: 'Optional vessels / aviation. OpenSky works anonymously with tighter limits.',
    fields: [
      {
        name: 'AISSTREAM_API_KEY',
        label: 'AISStream',
        placeholder: 'AISStream API key',
        hint: 'Live ship positions — aisstream.io',
        type: 'password',
      },
      {
        name: 'OPENSKY_USERNAME',
        label: 'OpenSky Username',
        placeholder: 'OpenSky username',
        hint: 'Authenticated ADS-B — opensky-network.org',
        type: 'text',
      },
      {
        name: 'OPENSKY_PASSWORD',
        label: 'OpenSky Password',
        placeholder: 'OpenSky password',
        hint: 'Used with OpenSky username',
        type: 'password',
      },
    ],
  },
  {
    id: 'security',
    title: 'Vault & local access',
    blurb: 'VAULT_MASTER_KEY must live in .env.local (enables encrypted Settings keys). Password is optional.',
    fields: [
      {
        name: 'VAULT_MASTER_KEY',
        label: 'Vault Master Key',
        placeholder: 'base64:… or 64 hex chars',
        hint: 'Required for Settings key storage. Generate once, put in .env.local, restart. Saving here alone is not enough for first boot.',
        type: 'password',
        skipSetup: true,
      },
      {
        name: 'ARGUS_PASSWORD',
        label: 'ARGUS Password',
        placeholder: 'your_password_here',
        hint: 'Locks the instance behind login — leave blank for open local access',
        type: 'password',
      },
      {
        name: 'ARGUS_SESSION_SECRET',
        label: 'Session Secret',
        placeholder: 'random 32+ char string',
        hint: 'Signs cookies when ARGUS_PASSWORD is set — openssl rand -hex 32',
        type: 'password',
      },
    ],
  },
  {
    id: 'cloud',
    title: 'Cloud / Supabase (hosted)',
    blurb: 'Not needed for local GitHub installs. Use on your hosted app for accounts + sync across devices.',
    fields: [
      {
        name: 'NEXT_PUBLIC_SUPABASE_URL',
        label: 'Supabase URL',
        placeholder: 'https://xxxx.supabase.co',
        hint: 'Hosted only — set in hosting env or .env.local, then restart. supabase.com',
        type: 'text',
        hostedOnly: true,
        clientPublic: true,
        skipSetup: true,
      },
      {
        name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        label: 'Supabase Anon Key',
        placeholder: 'eyJ…',
        hint: 'Hosted only — public anon key; protect with RLS. Restart after .env change.',
        type: 'password',
        hostedOnly: true,
        clientPublic: true,
        skipSetup: true,
      },
    ],
  },
]

export const ALL_KEY_FIELDS: KeyField[] = KEY_SECTIONS.flatMap(s => s.fields)

export const SETUP_KEY_FIELDS: KeyField[] = ALL_KEY_FIELDS.filter(f => !f.skipSetup && !f.hostedOnly)

export const SETUP_LS_KEY = 'argus-setup-keys-v1'
