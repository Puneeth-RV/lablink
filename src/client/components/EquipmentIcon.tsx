import type { ReactElement } from 'react';

/**
 * Original line-art illustrations per equipment category (inline SVG: no network requests,
 * no licensing concerns, inherits text colour so it works in both themes).
 */
const instrument = (screen: ReactElement) => (
  <>
    <rect x="2.5" y="5" width="19" height="14" rx="1.5" />
    <rect x="4.5" y="7" width="10.5" height="8" rx="0.5" />
    {screen}
    <circle cx="18" cy="9" r="1.1" />
    <circle cx="18" cy="13" r="1.1" />
    <path d="M6 21.5h3M15 21.5h3" />
  </>
);

const chip = (
  <>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
    <path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" />
  </>
);

const flask = (
  <>
    <path d="M9.5 3h5M10.5 3v6L5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L13.5 9V3" />
    <path d="M7.5 15h9" />
  </>
);

const ICONS: Record<string, ReactElement> = {
  oscilloscope: instrument(<path d="M5 11.5c1.2-3 2.2-3 3.2 0s2 3 3.2 0 1.6-2 2.4 0" />),
  'function-generator': instrument(<path d="M5 13l2-4 2 4 2-4 2 4 1-2" />),
  'spectrum-analyzer': instrument(<path d="M6 14.5v-2M8 14.5v-4M10 14.5v-6M12 14.5v-3M14 14.5v-1.5" />),
  'logic-analyzer': instrument(<path d="M5 13h2V9h3v4h2V9h3" />),
  'power-supply': instrument(<path d="M7 11h3M8.5 9.5v3M11.5 11h2.5" />),
  'fpga-board': chip,
  'iot-kit': (
    <>
      {chip}
      <path d="M19.5 2.5a3 3 0 0 1 2 2M18.5 4a1.5 1.5 0 0 1 .9.9" />
    </>
  ),
  'embedded-ai-kit': chip,
  'sbc-cluster': (
    <>
      <rect x="3" y="4" width="18" height="4.5" rx="1" />
      <rect x="3" y="9.75" width="18" height="4.5" rx="1" />
      <rect x="3" y="15.5" width="18" height="4.5" rx="1" />
      <path d="M6 6.25h.01M6 12h.01M6 17.75h.01M15 6.25h3M15 12h3M15 17.75h3" />
    </>
  ),
  'gpu-workstation': (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="1.5" />
      <path d="M9 6h6M9 9h6" />
      <circle cx="12" cy="15" r="2.5" />
    </>
  ),
  '3d-printer': (
    <>
      <path d="M4 21V3h16v18M4 7h16" />
      <path d="M10 7v3l2 2 2-2V7" />
      <path d="M8 18h8M9 16h6" />
    </>
  ),
  'laser-cutter': (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="1.5" />
      <path d="M2.5 10h19M12 10v4M10.5 16.5l1.5-2.5 1.5 2.5" />
    </>
  ),
  'cnc-machine': (
    <>
      <path d="M4 21h16M6 21V4h12v17M6 8h12" />
      <path d="M12 8v5M10.5 13h3l-1.5 3z" />
    </>
  ),
  'soldering-station': (
    <>
      <path d="M3 21l5.5-5.5M8 16l7.5-7.5 2 2L10 18z" />
      <path d="M17.5 6.5l2-2M15.5 8.5l2 2" />
    </>
  ),
  microscope: (
    <>
      <path d="M6 21h12M9 21v-3M12 18a6 6 0 0 0 6-6" />
      <path d="M10 4l4 2-3 6-4-2z" />
      <path d="M8 13.5l2 1" />
    </>
  ),
  'pcr-machine': (
    <>
      <rect x="3" y="8" width="18" height="12" rx="1.5" />
      <path d="M3 12h18M7 16h.01M10 16h.01M13 16h.01M16 16h.01M7 8l2-4h6l2 4" />
    </>
  ),
  centrifuge: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </>
  ),
  spectrophotometer: (
    <>
      <rect x="3" y="9" width="18" height="11" rx="1.5" />
      <path d="M8 9V5h4v4M15 14.5h3M6 14.5h5" />
    </>
  ),
  'biosafety-cabinet': (
    <>
      <path d="M3 21V4h18v17M3 21h18M6 7h12v7H6z" />
      <path d="M8 17h8" />
    </>
  ),
  'vr-headset': (
    <>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4l-1.5-2.5h-3L9 17H5a2 2 0 0 1-2-2z" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="16" cy="12" r="1.5" />
    </>
  ),
  'robot-arm': (
    <>
      <path d="M4 21h8M8 21v-4l4-6 5 2" />
      <circle cx="8" cy="17" r="1.5" />
      <circle cx="12" cy="11" r="1.5" />
      <path d="M17 13l2-2M17 13l2 2" />
    </>
  ),
  'thermal-camera': (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="4" />
      <path d="M12 11.5v3" />
    </>
  ),
  'testing-machine': (
    <>
      <path d="M5 21h14M7 21V3M17 21V3M7 6h10M10 6v4h4V6M10 14h4v4h-4z" />
    </>
  ),
};

export function EquipmentIcon({ category, size = 28, large = false }: { category: string; size?: number; large?: boolean }) {
  return (
    <span className={`equipment-icon${large ? ' large' : ''}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width={large ? size * 1.7 : size}
        height={large ? size * 1.7 : size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {ICONS[category] ?? flask}
      </svg>
    </span>
  );
}
