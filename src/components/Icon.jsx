const PATHS = {
  dashboard: <><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/></>,
  cart: <><circle cx="6" cy="14" r="1.2"/><circle cx="13" cy="14" r="1.2"/><path d="M2 2h2l2 9h8l1.5-6H5"/></>,
  box: <><path d="M2 5l7-3 7 3v8l-7 3-7-3V5z"/><path d="M2 5l7 3 7-3"/><path d="M9 8v8"/></>,
  receipt: <><path d="M3 2h12v14l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L3 16V2z"/><path d="M6 6h6M6 9h6M6 12h4"/></>,
  truck: <><rect x="1" y="5" width="9" height="7" rx="1"/><path d="M10 7h4l2 3v2h-6"/><circle cx="5" cy="14" r="1.3"/><circle cx="13" cy="14" r="1.3"/></>,
  users: <><circle cx="6" cy="6" r="2.5"/><path d="M2 14c0-2.5 2-4 4-4s4 1.5 4 4"/><circle cx="12.5" cy="7" r="2"/><path d="M11 14c0-2 1.5-3.5 3-3.5s2 1 2 2"/></>,
  warehouse: <><path d="M2 7l7-4 7 4v8H2V7z"/><path d="M5 15v-5h8v5"/><path d="M5 12h8"/></>,
  chart: <><path d="M2 14h14"/><rect x="3" y="9" width="2.5" height="5"/><rect x="7" y="6" width="2.5" height="8"/><rect x="11" y="3" width="2.5" height="11"/></>,
  search: <><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/></>,
  bell: <><path d="M4 11V8c0-2.5 2-4.5 5-4.5s5 2 5 4.5v3l1.5 2H2.5L4 11z"/><path d="M7 14h4"/></>,
  plus: <><path d="M9 3v12M3 9h12"/></>,
  minus: <><path d="M3 9h12"/></>,
  x: <><path d="M4 4l10 10M14 4L4 14"/></>,
  trash: <><path d="M3 5h12M7 5V3h4v2M5 5l1 10h7l1-10"/></>,
  edit: <><path d="M11 3l3 3-8 8H3v-3l8-8z"/></>,
  eye: <><path d="M2 9c2-3 4.5-4.5 7-4.5S14 6 16 9c-2 3-4.5 4.5-7 4.5S4 12 2 9z"/><circle cx="9" cy="9" r="2"/></>,
  download: <><path d="M9 2v9m-3-3l3 3 3-3M3 14h12"/></>,
  upload: <><path d="M9 12V3m-3 3l3-3 3 3M3 14h12"/></>,
  filter: <><path d="M2 3h14l-5 7v5l-4-2v-3L2 3z"/></>,
  chevronDown: <><path d="M4 6l5 5 5-5"/></>,
  chevronRight: <><path d="M6 4l5 5-5 5"/></>,
  chevronLeft: <><path d="M11 4L6 9l5 5"/></>,
  moon: <><path d="M14 10A6 6 0 1 1 8 4a5 5 0 0 0 6 6z"/></>,
  sun: <><circle cx="9" cy="9" r="3"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.5 3.5l1.5 1.5M13 13l1.5 1.5M3.5 14.5L5 13M13 5l1.5-1.5"/></>,
  settings: <><circle cx="9" cy="9" r="2.5"/><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3 3l1.5 1.5M13.5 13.5L15 15M3 15l1.5-1.5M13.5 4.5L15 3"/></>,
  logout: <><path d="M11 13v2H3V3h8v2M7 9h9m-3-3l3 3-3 3"/></>,
  check: <><path d="M3 9l4 4 8-8"/></>,
  alert: <><path d="M9 2L1 16h16L9 2z"/><path d="M9 7v4M9 13v.5"/></>,
  info: <><circle cx="9" cy="9" r="7"/><path d="M9 6v.5M9 8v5"/></>,
  user: <><circle cx="9" cy="6" r="3"/><path d="M3 16c0-3.5 3-5.5 6-5.5s6 2 6 5.5"/></>,
  building: <><rect x="3" y="2" width="12" height="14"/><path d="M6 5h2M10 5h2M6 8h2M10 8h2M6 11h2M10 11h2"/></>,
  money: <><rect x="2" y="5" width="14" height="9" rx="1"/><circle cx="9" cy="9.5" r="2"/><path d="M5 9h.5M12.5 9h.5"/></>,
  calendar: <><rect x="2" y="3" width="14" height="13" rx="1"/><path d="M2 7h14M6 1v3M12 1v3"/></>,
  print: <><path d="M5 6V2h8v4M5 13h-2V6h12v7h-2M5 11h8v5H5z"/></>,
  refresh: <><path d="M14 4v3h-3M4 14v-3h3"/><path d="M14 7a6 6 0 0 0-10-3M4 11a6 6 0 0 0 10 3"/></>,
  sortAsc: <><path d="M4 11l4-4 4 4M8 7v8M2 3h12"/></>,
  eyeOff: <><path d="M2 2l14 14M5 5C3 6.5 2 8 2 9c2 3 4.5 4.5 7 4.5 1.4 0 2.7-.4 4-1.2M9 4.5c2.5 0 5 1.5 7 4.5-.5.7-1 1.4-1.6 2"/></>,
  chat: <><path d="M2 2h14c.6 0 1 .5 1 1v9c0 .6-.4 1-1 1H5l-3 3V3c0-.5.4-1 1-1z"/><path d="M5 7h8M5 10h5"/></>,
  sparkle: <><path d="M9 1l1.5 4L14 7l-3.5 1.5L9 12l-1.5-3.5L4 7l3.5-1.5L9 1z"/><path d="M4 13l.6 1.4L6 15l-1.4.6L4 17l-.6-1.4L2 15l1.4-.6L4 13z"/></>,
  scale: <><path d="M9 2v14M5 16h8"/><path d="M3 6l6-2 6 2"/><path d="M1 10c0-2 2-4 5-4s5 2 5 4H1z"/><path d="M7 10c0-2 2-4 5-4s5 2 5 4H7z"/></>,
}

export default function Icon({ name, size = 16, className = "" }) {
  return (
    <svg
      viewBox="0 0 18 18"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name] || null}
    </svg>
  )
}
