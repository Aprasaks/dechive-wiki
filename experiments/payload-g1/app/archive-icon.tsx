import type { ReactNode } from 'react'

type Props = { name: string; size?: number; className?: string }
export default function ArchiveIcon({ name, size = 22, className }: Props) {
  const contents: Record<string, ReactNode> = {
    library: <><path d="M3 7 12 3l9 4v11l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4M12 11v11M7 5l10 4"/></>,
    compass: <><circle cx="12" cy="12" r="9"/><path d="m16 8-3 7-5 2 3-7Z"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    timeline: <><path d="M4 19V5l8 7 8-7"/><circle cx="4" cy="19" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="5" r="2"/></>,
    book: <><path d="M12 6c-4-3-8-3-10-2v16c4-1 7-.7 10 2 3-2.7 6-3 10-2V4c-2-1-6-1-10 2ZM12 6v16"/></>,
    paper: <><path d="M6 2h9l5 5v15H6V2Z M15 2v6h5M9 12h8M9 16h8"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-3c0-4 3-6 7-6s7 2 7 6v3M17 4a3 3 0 0 1 0 6M18 13c3 1 4 3 4 6"/></>,
    tag: <><path d="m21 11-10 10-9-9V3h9l10 8Z"/><circle cx="7.5" cy="7.5" r="1.5"/></>,
    dice: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v7l5 3M3 4v5h5"/></>,
    bookmark: <path d="M5 3h14v19l-7-5-7 5V3Z"/>,
    bell: <><path d="M5 18h14l-2-3V9a5 5 0 0 0-10 0v6l-2 3ZM10 21h4"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 22v-3c0-4 3-6 8-6s8 2 8 6v3"/></>,
    atom: <><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/></>,
    cpu: <><rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 9h6v6H9zM2 8h4M2 12h4M2 16h4M18 8h4M18 12h4M18 16h4M8 2v4M12 2v4M16 2v4M8 18v4M12 18v4M16 18v4"/></>,
    pillar: <><path d="M4 5h16l-2 3H6L4 5ZM5 19h14v3H5zM7 9v9M12 9v9M17 9v9"/></>,
    landmark: <><path d="m2 9 10-6 10 6H2ZM4 20h16v2H4zM6 10v9M11 10v9M16 10v9"/></>,
    globe: <><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2c-6 6-6 14 0 20M12 2c6 6 6 14 0 20M5 5c4 4 10 4 14 0M5 19c4-4 10-4 14 0"/></>,
    chart: <><path d="M2 21h20M5 19v-7h4v7M11 19V4h4v15M17 19v-10h4v10"/></>,
    heart: <><path d="M12 21 3.7 12.7C-1 8 3 1 8.3 4.5L12 8l3.7-3.5C21 1 25 8 20.3 12.7L12 21Z"/><path d="M4 12h4l2-3 3 6 2-3h5"/></>,
    leaf: <><path d="M3 21c1-13 8-17 18-18-1 11-6 18-18 18ZM3 21l14-14"/></>,
    planet: <><circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-25 12 12)"/></>,
    mountain: <><path d="m1 21 8-14 4 7 3-5 7 12H1ZM8 9l3 2M17 10l-2 2"/></>,
    nodes: <><circle cx="4" cy="16" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="20" cy="9" r="2"/><circle cx="19" cy="20" r="2"/><path d="m5 14 4-7M12 6l6 2M19 11v7M6 17l11 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 2v6M16 2v6"/></>,
    verify: <><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></>,
    layers: <><path d="m12 3 10 6-10 6L2 9l10-6ZM2 15l10 6 10-6M2 12l10 6 10-6"/></>,
    arrow: <path d="M3 12h18m-6-6 6 6-6 6"/>,
    refresh: <><path d="M20 7v-5l-4 4M4 17v5l4-4"/><path d="M5 9a8 8 0 0 1 14-2M19 15a8 8 0 0 1-14 2"/></>,
    search: <><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></>,
  }
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false" className={className}>
    {contents[name] ?? contents.book}
  </svg>
}
