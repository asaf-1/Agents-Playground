import { useId, type ReactElement, type ReactNode, type SVGProps } from "react";

// Inline stroke icons on a 24px grid. Always aria-hidden and text-free, so they
// never add words to the elements the tests read.
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

// useId output may hold characters that are awkward inside url(#...).
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export const HomeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </Icon>
);

export const BankIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 21h18" />
    <path d="M5.5 18V11M10 18V11M14 18V11M18.5 18V11" />
    <path d="M2.5 9 12 3.5 21.5 9z" />
  </Icon>
);

export const CoinIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 7.5h3.75a2.25 2.25 0 0 1 0 4.5H9.5zM9.5 12h4.25a2.25 2.25 0 0 1 0 4.5H9.5zM9.5 7.5v9M11.5 6v1.5M11.5 16.5V18" />
  </Icon>
);

export const ShopIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </Icon>
);

export const OrdersIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Icon>
);

export const UsersIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 4.8a3.25 3.25 0 0 1 0 6.4M18 14.6c1.8.7 3 2.5 3 5.4" />
  </Icon>
);

export const AccountIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="10" r="3" />
    <path d="M6.6 18.4c1.2-2 3.2-3.1 5.4-3.1s4.2 1.1 5.4 3.1" />
  </Icon>
);

export const AboutIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.01" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 10v4.5M12 17.3v.01" />
  </Icon>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

const ComputeIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    <path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
  </Icon>
);

const StorageIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="4" width="17" height="15" rx="2.5" />
    <circle cx="12" cy="11.5" r="3.5" />
    <path d="M12 8v1M12 14v1M8.5 11.5h1M14.5 11.5h1M6.5 19v1.5M17.5 19v1.5" />
  </Icon>
);

const NetworkIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="5" cy="18" r="2.5" />
    <circle cx="19" cy="18" r="2.5" />
    <path d="M10.8 7.2 6.2 15.8M13.2 7.2l4.6 8.6M7.5 18h9" />
  </Icon>
);

const SecurityIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3 19.5 6v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
    <path d="m8.8 12.2 2.3 2.3 4.4-4.6" />
  </Icon>
);

const ObservabilityIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Icon>
);

const DataIcon = (props: IconProps) => (
  <Icon {...props}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.75" />
    <path d="M4.5 5.5v13c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75v-13" />
    <path d="M4.5 12c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75" />
  </Icon>
);

const CATEGORY_ICONS: Record<string, (props: IconProps) => ReactElement> = {
  Compute: ComputeIcon,
  Storage: StorageIcon,
  Network: NetworkIcon,
  Security: SecurityIcon,
  Observability: ObservabilityIcon,
  Data: DataIcon,
};

export function CategoryIcon({
  category,
  ...props
}: IconProps & { category: string }) {
  const Category = CATEGORY_ICONS[category] ?? ComputeIcon;
  return <Category {...props} />;
}

// The Playground Bank mark: a token-shaped hexagon in the brand gradient.
export function LogoMark(props: IconProps) {
  const gradient = useSvgId("logo");
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient
          id={gradient}
          x1="4"
          y1="3"
          x2="28"
          y2="29"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25z"
        fill={`url(#${gradient})`}
      />
      <path
        d="M16 9 22 12.5v7L16 23l-6-3.5v-7z"
        fill="none"
        stroke="#0a0d18"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M16 13v6"
        stroke="#0a0d18"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
