// Collection of high-resolution sports badge and avatar SVG Data URIs for offline and hermetic reliability

const createSvgDataUrl = (svgContent: string): string => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.trim())}`;
};

export interface SportsPreset {
  id: string;
  name: string;
  category: 'team' | 'player';
  url: string;
}

export const TEAM_BADGE_PRESETS: SportsPreset[] = [
  {
    id: 'badge-aguilas',
    name: 'Águilas Voleibol',
    category: 'team',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0284c7" />
            <stop offset="100%" stop-color="#0369a1" />
          </linearGradient>
          <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#facc15" />
            <stop offset="100%" stop-color="#ca8a04" />
          </linearGradient>
        </defs>
        <polygon points="100,10 185,50 185,145 100,190 15,145 15,50" fill="url(#g1)" stroke="#38bdf8" stroke-width="6"/>
        <circle cx="100" cy="95" r="45" fill="#0f172a" stroke="url(#gold)" stroke-width="4"/>
        <path d="M70,95 Q100,55 130,95 Q100,135 70,95" fill="none" stroke="#f8fafc" stroke-width="4"/>
        <circle cx="100" cy="95" r="16" fill="url(#gold)"/>
        <path d="M85,55 L100,75 L115,55 L125,75 L100,115 L75,75 Z" fill="#ffffff" opacity="0.9"/>
        <text x="100" y="165" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="#facc15" text-anchor="middle" letter-spacing="2">AGUILAS VC</text>
      </svg>
    `)
  },
  {
    id: 'badge-titanes',
    name: 'Titanes Club',
    category: 'team',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="gRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#dc2626" />
            <stop offset="100%" stop-color="#7f1d1d" />
          </linearGradient>
        </defs>
        <path d="M100,15 L180,45 L165,150 L100,190 L35,150 L20,45 Z" fill="url(#gRed)" stroke="#f87171" stroke-width="6"/>
        <circle cx="100" cy="95" r="46" fill="#18181b" stroke="#ffffff" stroke-width="4"/>
        <path d="M100,55 L100,135 M60,95 L140,95" stroke="#ef4444" stroke-width="8" stroke-linecap="round"/>
        <circle cx="100" cy="95" r="28" fill="none" stroke="#facc15" stroke-width="5"/>
        <text x="100" y="168" font-family="Arial, sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle" letter-spacing="2">TITANES</text>
      </svg>
    `)
  },
  {
    id: 'badge-trueno',
    name: 'Trueno Spikers',
    category: 'team',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="gPurple" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#7c3aed" />
            <stop offset="100%" stop-color="#4c1d95" />
          </linearGradient>
        </defs>
        <polygon points="100,12 188,48 160,165 100,192 40,165 12,48" fill="url(#gPurple)" stroke="#a78bfa" stroke-width="6"/>
        <circle cx="100" cy="95" r="44" fill="#09090b" stroke="#facc15" stroke-width="3"/>
        <polygon points="108,55 85,95 105,95 92,138 122,90 102,90" fill="#facc15" stroke="#ffffff" stroke-width="2"/>
        <text x="100" y="168" font-family="Arial, sans-serif" font-weight="900" font-size="13" fill="#facc15" text-anchor="middle" letter-spacing="2">TRUENO VC</text>
      </svg>
    `)
  },
  {
    id: 'badge-halcones',
    name: 'Halcones Dorados',
    category: 'team',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="gGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#eab308" />
            <stop offset="100%" stop-color="#854d0e" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="88" fill="#0f172a" stroke="url(#gGold)" stroke-width="8"/>
        <circle cx="100" cy="100" r="70" fill="none" stroke="#fef08a" stroke-dasharray="8 6" stroke-width="3"/>
        <path d="M60,100 Q100,60 140,100 Q100,140 60,100" fill="url(#gGold)"/>
        <circle cx="100" cy="100" r="18" fill="#ffffff"/>
        <text x="100" y="42" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="#fef08a" text-anchor="middle" letter-spacing="3">HALCONES</text>
        <text x="100" y="172" font-family="Arial, sans-serif" font-weight="900" font-size="11" fill="#fef08a" text-anchor="middle" letter-spacing="2">VOLLEY CLUB</text>
      </svg>
    `)
  },
  {
    id: 'badge-fenix',
    name: 'Fénix Volley',
    category: 'team',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="gFlame" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ea580c" />
            <stop offset="50%" stop-color="#f97316" />
            <stop offset="100%" stop-color="#facc15" />
          </linearGradient>
        </defs>
        <path d="M100,10 C150,10 185,50 185,110 C185,160 145,190 100,190 C55,190 15,160 15,110 C15,50 50,10 100,10 Z" fill="#18181b" stroke="url(#gFlame)" stroke-width="6"/>
        <path d="M100,40 Q130,70 120,110 Q145,90 140,135 Q100,170 65,130 Q70,95 90,80 Q75,100 85,120 Q95,60 100,40 Z" fill="url(#gFlame)"/>
        <circle cx="100" cy="120" r="16" fill="#ffffff"/>
        <text x="100" y="172" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="#fb923c" text-anchor="middle" letter-spacing="2">FENIX</text>
      </svg>
    `)
  },
  {
    id: 'badge-lobos',
    name: 'Lobos del Norte',
    category: 'team',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="gCyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="100%" stop-color="#0e7490" />
          </linearGradient>
        </defs>
        <polygon points="100,12 185,60 155,165 100,192 45,165 15,60" fill="#0f172a" stroke="url(#gCyan)" stroke-width="6"/>
        <polygon points="65,65 100,120 135,65 120,65 100,100 80,65" fill="#38bdf8"/>
        <circle cx="100" cy="120" r="22" fill="url(#gCyan)" stroke="#ffffff" stroke-width="3"/>
        <text x="100" y="170" font-family="Arial, sans-serif" font-weight="900" font-size="13" fill="#e0f2fe" text-anchor="middle" letter-spacing="2">LOBOS</text>
      </svg>
    `)
  },
  {
    id: 'badge-espartanos',
    name: 'Espartanos VC',
    category: 'team',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="gBronze" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#b45309" />
            <stop offset="100%" stop-color="#451a03" />
          </linearGradient>
        </defs>
        <path d="M100,15 L180,45 C180,120 145,165 100,190 C55,165 20,120 20,45 Z" fill="url(#gBronze)" stroke="#f59e0b" stroke-width="6"/>
        <path d="M100,50 L125,90 L115,90 L120,125 L100,105 L80,125 L85,90 L75,90 Z" fill="#ffffff"/>
        <circle cx="100" cy="140" r="15" fill="#f59e0b" stroke="#ffffff" stroke-width="3"/>
        <text x="100" y="175" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="#fef3c7" text-anchor="middle" letter-spacing="2">ESPARTANOS</text>
      </svg>
    `)
  },
  {
    id: 'badge-huracan',
    name: 'Huracán Vóley',
    category: 'team',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="gEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#064e3b" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="88" fill="#022c22" stroke="url(#gEmerald)" stroke-width="7"/>
        <path d="M70,75 C95,45 145,55 145,95 C145,135 75,130 75,100 C75,85 110,85 115,95" fill="none" stroke="#34d399" stroke-width="8" stroke-linecap="round"/>
        <circle cx="100" cy="100" r="16" fill="#ffffff" stroke="#10b981" stroke-width="4"/>
        <text x="100" y="170" font-family="Arial, sans-serif" font-weight="900" font-size="13" fill="#a7f3d0" text-anchor="middle" letter-spacing="2">HURACAN</text>
      </svg>
    `)
  }
];

export const PLAYER_AVATAR_PRESETS: SportsPreset[] = [
  {
    id: 'avatar-spiker-m',
    name: 'Atacante / Rematador',
    category: 'player',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="70" fill="#1e293b" stroke="#38bdf8" stroke-width="4"/>
        <circle cx="75" cy="52" r="24" fill="#38bdf8"/>
        <path d="M35,120 C35,92 52,82 75,82 C98,82 115,92 115,120 Z" fill="#0284c7"/>
        <circle cx="108" cy="38" r="14" fill="#facc15" stroke="#ffffff" stroke-width="2"/>
        <text x="75" y="142" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#ffffff" text-anchor="middle">ATACANTE</text>
      </svg>
    `)
  },
  {
    id: 'avatar-setter',
    name: 'Armador / Pasador',
    category: 'player',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="70" fill="#1e1b4b" stroke="#818cf8" stroke-width="4"/>
        <circle cx="75" cy="52" r="24" fill="#818cf8"/>
        <path d="M35,120 C35,92 52,82 75,82 C98,82 115,92 115,120 Z" fill="#4f46e5"/>
        <path d="M45,45 Q75,25 105,45" stroke="#facc15" stroke-width="4" fill="none" stroke-linecap="round"/>
        <text x="75" y="142" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#ffffff" text-anchor="middle">ARMADOR</text>
      </svg>
    `)
  },
  {
    id: 'avatar-libero',
    name: 'Líbero / Defensivo',
    category: 'player',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="70" fill="#14532d" stroke="#4ade80" stroke-width="4"/>
        <circle cx="75" cy="52" r="24" fill="#4ade80"/>
        <path d="M35,120 C35,92 52,82 75,82 C98,82 115,92 115,120 Z" fill="#16a34a"/>
        <rect x="63" y="90" width="24" height="14" rx="4" fill="#ffffff"/>
        <text x="75" y="101" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#14532d" text-anchor="middle">L</text>
        <text x="75" y="142" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#ffffff" text-anchor="middle">LIBERO</text>
      </svg>
    `)
  },
  {
    id: 'avatar-blocker',
    name: 'Central / Bloqueador',
    category: 'player',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="70" fill="#450a0a" stroke="#f87171" stroke-width="4"/>
        <circle cx="75" cy="52" r="24" fill="#f87171"/>
        <path d="M35,120 C35,92 52,82 75,82 C98,82 115,92 115,120 Z" fill="#dc2626"/>
        <rect x="52" y="30" width="10" height="25" rx="3" fill="#ffffff"/>
        <rect x="88" y="30" width="10" height="25" rx="3" fill="#ffffff"/>
        <text x="75" y="142" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#ffffff" text-anchor="middle">CENTRAL</text>
      </svg>
    `)
  },
  {
    id: 'avatar-captain',
    name: 'Capitán de Equipo',
    category: 'player',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="70" fill="#3f2c00" stroke="#facc15" stroke-width="5"/>
        <circle cx="75" cy="52" r="24" fill="#facc15"/>
        <path d="M35,120 C35,92 52,82 75,82 C98,82 115,92 115,120 Z" fill="#ca8a04"/>
        <circle cx="110" cy="50" r="16" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
        <text x="110" y="55" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="#ffffff" text-anchor="middle">C</text>
        <text x="75" y="142" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#fef08a" text-anchor="middle">CAPITAN</text>
      </svg>
    `)
  },
  {
    id: 'avatar-coach',
    name: 'Director Técnico / Coach',
    category: 'player',
    url: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r="70" fill="#0f172a" stroke="#cbd5e1" stroke-width="4"/>
        <circle cx="75" cy="50" r="22" fill="#94a3b8"/>
        <path d="M35,120 C35,92 52,82 75,82 C98,82 115,92 115,120 Z" fill="#475569"/>
        <rect x="68" y="78" width="14" height="20" fill="#facc15" rx="2"/>
        <text x="75" y="142" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#ffffff" text-anchor="middle">COACH</text>
      </svg>
    `)
  }
];
