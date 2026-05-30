# Local Supabase Architecture

This document contains Mermaid diagrams for the current local Docker Supabase testing setup.

## High-Level Architecture

```mermaid
flowchart LR
    User[User or Admin Browser]
    Vercel[Vercel Hosted Next.js App]
    CF[Cloudflare DNS and Tunnel Edge]
    Tunnel[cloudflared Process on Your PC]
    Kong[Supabase Kong API Gateway localhost:8000]
    Auth[Supabase Auth Container]
    Rest[PostgREST Container]
    Storage[Supabase Storage Container]
    DB[(Supabase Postgres Docker DB)]
    Studio[Supabase Studio localhost:3000]
    Amplify[AWS Amplify Existing Site]

    User -->|Visits app| Vercel
    User -->|Existing site traffic| Amplify
    Vercel -->|Supabase API calls| CF
    CF -->|Tunnel route supabase.ppbycw.com| Tunnel
    Tunnel -->|Forwards to http://localhost:8000| Kong
    Kong --> Auth
    Kong --> Rest
    Kong --> Storage
    Auth --> DB
    Rest --> DB
    Storage --> DB
    User -. local admin only .-> Studio
    Studio --> DB
```

## Request Flow From Vercel To Local Supabase

```mermaid
sequenceDiagram
    participant Browser as Browser
    participant App as Vercel Next.js App
    participant CF as Cloudflare Tunnel URL
    participant Local as cloudflared on PC
    participant Kong as Supabase Kong localhost:8000
    participant Auth as Supabase Auth
    participant DB as Local Postgres Docker DB

    Browser->>App: Open /admin/login
    Browser->>App: Submit email and password
    App-->>Browser: Serves login UI and app bundle
    Browser->>CF: auth.signInWithPassword via NEXT_PUBLIC_SUPABASE_URL
    CF->>Local: Forward request through tunnel
    Local->>Kong: Forward to http://localhost:8000/auth/v1/token
    Kong->>Auth: Route auth request
    Auth->>DB: Check auth.users credentials
    DB-->>Auth: User record and password result
    Auth-->>Kong: Session or error
    Kong-->>Local: Response
    Local-->>CF: Response
    CF-->>Browser: Session or login failure
```

## DNS Ownership

```mermaid
flowchart TD
    Registrar[GoDaddy Registrar]
    Nameservers[Cloudflare Nameservers]
    Root[ppbycw.com]
    WWW[www.ppbycw.com]
    SupabaseSub[supabase.ppbycw.com]
    Amplify[AWS Amplify]
    Tunnel[Cloudflare Tunnel]

    Registrar -->|Nameservers point to| Nameservers
    Nameservers --> Root
    Nameservers --> WWW
    Nameservers --> SupabaseSub
    Root -->|A/CNAME records| Amplify
    WWW -->|CNAME record| Amplify
    SupabaseSub -->|Tunnel route| Tunnel
```

## What Is Local Versus Cloud Hosted

```mermaid
flowchart TB
    subgraph Cloud[Cloud Hosted]
        Vercel[Vercel Next.js Deployment]
        Cloudflare[Cloudflare DNS and Tunnel Edge]
        AWS[AWS Amplify Existing Site]
    end

    subgraph Local[Your PC]
        Cloudflared[cloudflared Tunnel Process]
        Docker[Docker or WSL Docker Runtime]
        Supabase[Self-hosted Supabase Containers]
        Postgres[(Postgres Database)]
        Studio[Supabase Studio]
    end

    Vercel --> Cloudflare
    Cloudflare --> Cloudflared
    Cloudflared --> Supabase
    Supabase --> Postgres
    Studio --> Postgres
    AWS -. separate existing website .- Cloudflare
```

## URL Map

```mermaid
flowchart LR
    AppLogin[/Vercel app /admin/login/]
    SupabasePublic[/https://supabase.ppbycw.com/]
    SupabaseLocal[/http://localhost:8000/]
    StudioLocal[/http://localhost:3000/]
    NextLocal[/http://localhost:4000/]

    AppLogin -->|Human admin login page| Vercel[Vercel Next.js]
    SupabasePublic -->|Public API endpoint| CF[Cloudflare Tunnel]
    CF --> SupabaseLocal
    SupabaseLocal -->|Local API gateway| DockerSupabase[Docker Supabase]
    StudioLocal -->|Local dashboard only| Studio[Supabase Studio]
    NextLocal -->|Local development app| Dev[Next.js Dev Server]
```

## Availability Dependency

```mermaid
flowchart TD
    Works{Can Vercel use local Supabase?}
    PC{PC on?}
    Internet{Internet connected?}
    Docker{Docker running?}
    Containers{Supabase containers healthy?}
    Tunnel{cloudflared running?}
    DNS{Cloudflare DNS active?}
    OK[Yes, Vercel can reach local Supabase]
    Fail[No, app may fail to login or load data]

    Works --> PC
    PC -->|yes| Internet
    PC -->|no| Fail
    Internet -->|yes| Docker
    Internet -->|no| Fail
    Docker -->|yes| Containers
    Docker -->|no| Fail
    Containers -->|yes| Tunnel
    Containers -->|no| Fail
    Tunnel -->|yes| DNS
    Tunnel -->|no| Fail
    DNS -->|yes| OK
    DNS -->|no| Fail
```
