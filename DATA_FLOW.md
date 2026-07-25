# ARGUS — Intelligence Data Flow

```mermaid
flowchart TD
    subgraph EXTERNAL["External Data Sources"]
        direction TB
        G[GDELT v2 API\n48h conflict articles]
        U[USGS GeoJSON\nearthquakes M2.5+]
        GD[GDACS REST\ndisaster alerts]
        RW[ReliefWeb API\nhumanitarian reports]
        UC[UCDP GED API\narmed conflict events]
        WH[WHO JSON / RSS\ndisease outbreaks]
        NF[NASA FIRMS CSV\nVIIRS fire hotspots]
        RSS[RSS Aggregator\n7 news feeds]
        AC[ACLED API\n— optional —]
        YF[Yahoo Finance v8\ncommodity prices]
        OS[adsb.fi / OpenSky\naircraft positions]
        OFC[OFAC SDN CSV\nsanctions list]
        WB[World Bank API\neconomic indicators]
        WP[Wikipedia REST\ncountry context RAG]
        OAI[OpenAI GPT-4o-mini\nbrief generation]
        MB[Mapbox Geocoding\nreverse geo lookup]
    end

    subgraph PIPELINE["Server-Side Processing  (Next.js API Routes)"]
        direction TB
        EV["/api/events\nfetchGDELT + fetchUSGS + fetchGDACS\n+ fetchReliefWeb + fetchUCDP\n+ fetchWHO + fetchNASAFIRMS\n+ fetchRSSFeeds + fetchACLED"]
        DEDUP["Deduplication\nword-overlap + geo-proximity filter"]
        GEO["Geo Inference\ntitle → country/lat/lon mapping"]
        CLUSTER["Haversine Clustering\nNASA FIRMS hotspots → zones"]
        CORR["/api/correlations\n9-pattern correlation engine\nhaversine distance, time window,\ncountry-neighbor graph"]
        COM["/api/commodities\nreal prices → fallback procedural"]
        AV["/api/aviation\nadsb.fi → OpenSky → 25 procedural"]
        VES["/api/vessels\nOFAC SDN check → 22 procedural"]
        RAG["/api/rag\nWikipedia + World Bank context"]
        BRIEF["/api/brief\nRAG context + events → GPT-4o-mini\n→ structured JSON brief"]
        SIT["/api/situations\nOpenAI situation assessment"]
        SEARCH["/api/search\nfull-text event search"]
        STATUS["/api/status\ncache health + source counts"]
        CACHE["In-Memory TTL Cache\nevents: 5min  commodities: 2min\naviation: 30s  vessels: 60s"]
        AUTH["Supabase SSR\nauth + plot persistence"]
    end

    subgraph STORE["Client State  (Zustand mapStore)"]
        direction TB
        MS["Map Viewport\nlat/lon/zoom/pitch/bearing"]
        LS["Layer Toggles\nevents/disasters/chokepoints\nalerts/cables/aviation/vessels/plots"]
        PS["Panel State\nselectedEvent / selectedCountry\nplottingMode / openPanels"]
        EV2["Events Cache\nTanStack Query 5min refetch"]
        COR2["Correlations\nTanStack Query 5min refetch"]
    end

    subgraph UI["Frontend Components"]
        direction TB
        AM["ArgusMap\nMapbox GL globe\nchokepoints / cables / event markers\ncountry click → reverse geocode"]
        LC["LayerControls\ntoggle layers + plot tools"]
        EF["EventFeed\nfiltered + sorted events\nseverity / source / category"]
        CP["CountryPanel\neconomic indicators\nactive events list"]
        BP["BriefPanel\nAI-generated intel brief\nPDF export / history"]
        CMP["ComparePanel\nside-by-side country analysis"]
        PL["PlotsLayer\npoint / zone / draw / area\nSupabase-persisted"]
        HDR["Header\ncommodity ticker\nreal-time prices"]
        CMD["CommandBar\nglobal search"]
    end

    %% External → Pipeline
    G -->|articles JSON| EV
    U -->|GeoJSON features| EV
    GD -->|disaster features| EV
    RW -->|report list| EV
    UC -->|conflict events| EV
    WH -->|outbreak items| EV
    NF -->|CSV fire pixels| CLUSTER
    RSS -->|XML items| EV
    AC -->|conflict data| EV
    CLUSTER --> EV

    EV --> GEO
    GEO --> DEDUP
    DEDUP --> CACHE
    DEDUP --> CORR

    YF -->|price + change| COM
    COM --> CACHE

    OS -->|aircraft states| AV
    AV --> CACHE

    OFC -->|sanctions CSV| VES
    VES --> CACHE

    WP -->|article text| RAG
    WB -->|indicators JSON| RAG
    RAG --> BRIEF
    BRIEF -->|events context| OAI
    OAI -->|structured brief JSON| BRIEF

    MB -->|country name + ISO| AM

    %% Pipeline → Store
    CACHE -->|TanStack Query poll| EV2
    CACHE -->|TanStack Query poll| COR2
    CACHE -->|direct fetch| HDR

    AUTH --> PL

    %% Store → UI
    EV2 --> EF
    EV2 --> AM
    COR2 --> CP
    MS --> AM
    LS --> AM
    LS --> EF
    PS --> CP
    PS --> BP
    PS --> CMP

    %% UI interactions
    AM -->|click marker| PS
    AM -->|click country| MB
    MB --> PS
    EF -->|select event| PS
    CMD -->|search query| SEARCH
    SEARCH --> EF
    BP -->|request brief| BRIEF
    CP -->|request brief| BRIEF
    LC -->|toggle| LS
    PL -->|save plot| AUTH

    %% Status
    CACHE --> STATUS
```

## Data source reliability tiers

| Tier | Sources | Fallback |
|------|---------|----------|
| **Live** | USGS earthquakes, Yahoo Finance | — always works |
| **Usually live** | GDELT (48h window + GKG fallback), ReliefWeb, UCDP | 25-event static fallback |
| **Intermittent** | WHO (JSON → RSS → hardcoded), GDACS, RSS feeds | Hardcoded fallback arrays |
| **Key-gated** | NASA FIRMS, ACLED | Skipped if env vars absent |
| **Procedural** | Aviation (25 aircraft), Vessels (22 ships) | Always shown, position-jittered |

## Correlation patterns detected

| # | Pattern | Signal |
|---|---------|--------|
| 1 | Geographic cluster | 3+ events within 500 km / 24 h |
| 2 | Multi-source convergence | Same location reported by 3+ sources |
| 3 | Escalation cascade | Severity rising across sequential events |
| 4 | Economic-conflict coupling | Commodity spike near conflict zone |
| 5 | Disaster-displacement | Disaster + humanitarian events co-located |
| 6 | Cyber-kinetic | Cyber event precedes physical attack |
| 7 | Chokepoint threat | Event within 200 km of strategic chokepoint |
| 8 | Cascading failure | Critical event cluster → broader region |
| 9 | Cross-border spillover | Events in neighboring countries within 48 h |
