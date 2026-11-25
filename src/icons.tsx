const P: Record<string, string> = {
  heart: 'M12 20.5s-7.5-4.6-9.6-9.3C.9 7.6 3.3 4 6.9 4c2.1 0 3.5 1.2 5.1 3 1.6-1.8 3-3 5.1-3 3.6 0 6 3.6 4.5 7.2-2.1 4.7-9.6 9.3-9.6 9.3z',
  swap: 'M4 8h14l-4-4M20 16H6l4 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5',
  chart: 'M5 20V11M12 20V5M19 20v-6M3 20h18',
  more: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  sword: 'M14.5 4H20v5.5L9 20.5 3.5 15 14.5 4zM7 13l4 4M3 21l3-3',
  drop: 'M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z',
  trophy: 'M8 21h8M12 16.5V21M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3v1.5A3.5 3.5 0 0 1 16.6 11M7 6H4v1.5A3.5 3.5 0 0 0 7.4 11',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 7h16M4 12h16M4 17h16',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9.2A3.5 3.5 0 0 0 9 10.5v3a3.5 3.5 0 0 0 6 1.3M7.5 11h5M7.5 13.5h5',
  cards: 'M8 3h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM4 7v12a2 2 0 0 0 2 2h9',
  skull: 'M12 3c-4.4 0-8 3.2-8 7.5 0 2.6 1.3 4.4 3 5.5V20h2.5v-2h1.5v2h2v-2h1.5v2H17v-4c1.7-1.1 3-2.9 3-5.5C20 6.2 16.4 3 12 3zM9 13.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM15 13.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  chevron: 'M9 5l7 7-7 7',
  back: 'M15 5l-7 7 7 7',
  x: 'M6 6l12 12M18 6L6 18',
  dice: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  check: 'M5 12.5l4.5 4.5L19 7',
  play: 'M7 4.5v15l12-7.5-12-7.5z',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.5 2.9-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.5 2.4 3.5 5.2',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  tag: 'M3 12V4h8l9.5 9.5-8 8L3 12zM7.5 8.5h.01',
}

export function Icon({ name, size = 20, className = '' }: { name: keyof typeof P | string; size?: number; className?: string }) {
  const filled = name === 'skull' || name === 'play'
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      fillRule="evenodd"
    >
      <path d={P[name] ?? ''} />
    </svg>
  )
}
