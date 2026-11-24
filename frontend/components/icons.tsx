import type { CSSProperties } from "react";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    compare: (
      <>
        <path d="M4 5h16v11H9l-5 4V5Z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    save: (
      <>
        <path d="M5 3h12l4 4v14H3V3h2Z" />
        <path d="M7 3v6h10V3M7 21v-8h10v8" />
      </>
    ),
    memory: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="3" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    history: (
      <>
        <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7a9 9 0 0 0-15-1L3 9m0-5v5h5M4 17a9 9 0 0 0 15 1l2-3m0 5v-5h-5" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7v1" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6M10 3v7L4 20c-.3.6 0 1 1 1h14c1 0 1.3-.4 1-1L14 10V3M7 15h10" />
        <path d="M10 17h.01M14 18h.01" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.info}
    </svg>
  );
}

export const themes = [
  {
    color: "#ac7410",
    soft: "#fff5cf",
    solid: "#efbf44",
    title: "明るさと好奇心",
  },
  {
    color: "#cb4e55",
    soft: "#ffebec",
    solid: "#ed7479",
    title: "情熱と行動力",
  },
  {
    color: "#3f72c8",
    soft: "#eaf1ff",
    solid: "#79a2ed",
    title: "冷静さと慎重さ",
  },
  {
    color: "#35816d",
    soft: "#e6f5ed",
    solid: "#76b69a",
    title: "優しさと共感",
  },
];

export const themeStyle = (index: number) => {
  const t = themes[index % 4];
  return {
    "--person-color": t.color,
    "--person-soft": t.soft,
    "--person-solid": t.solid,
  } as CSSProperties;
};

export function Avatar({ index, size = 64 }: { index: number; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      aria-hidden="true"
      className="avatar"
    >
      {index % 4 === 0 && (
        <g fill="var(--person-solid)">
          <path d="m40 2 6 10 11-3 1 12 12 3-5 11 9 8-9 8 2 12-12 1-5 12-11-5-9 8-7-10-12 1-1-12-11-4 5-11-7-9 10-7-1-12 12-1 5-10 11 5Z" />
          <circle cx="40" cy="40" r="25" fill="#ffda72" />
        </g>
      )}
      {index % 4 === 1 && (
        <>
          <path
            d="M39 4c8 15 25 22 25 42a25 25 0 0 1-50 0c0-13 8-19 12-27 0 10 6 12 7 9 5-7 4-15 6-24Z"
            fill="var(--person-solid)"
          />
          <path
            d="M40 25c4 8 15 14 15 24a16 16 0 0 1-32 0c0-9 11-17 17-24Z"
            fill="#ffafb0"
          />
        </>
      )}
      {index % 4 === 2 && (
        <>
          <path d="M20 13h39l12 29-13 29H20L8 42Z" fill="var(--person-solid)" />
          <path
            d="m20 13 20 10 19-10-4 29 3 29-18-9-20 9 4-29Z"
            fill="#a7c5ff"
          />
        </>
      )}
      {index % 4 === 3 && (
        <>
          <path
            d="M40 14C27 0 9 16 15 32-4 42 12 64 27 61c5 20 29 19 29 1 20 0 26-22 11-31 7-21-15-28-27-17Z"
            fill="var(--person-solid)"
          />
          <circle cx="40" cy="40" r="23" fill="#a9d7bb" />
        </>
      )}
      <g stroke="#34354b" strokeWidth="2.5" strokeLinecap="round" fill="none">
        {index % 4 === 1 ? (
          <>
            <path d="m27 34 8 3m10 0 8-3" />
            <path d="M30 40v3m20-3v3" />
          </>
        ) : (
          <>
            <path d="M30 34v5m20-5v5" />
          </>
        )}
        {index % 4 === 2 ? (
          <path d="M34 49h12" />
        ) : (
          <path d="M33 47q7 8 14 0" />
        )}
      </g>
      <g fill="var(--person-color)" opacity=".2">
        <ellipse cx="24" cy="44" rx="4" ry="2.5" />
        <ellipse cx="56" cy="44" rx="4" ry="2.5" />
      </g>
    </svg>
  );
}
