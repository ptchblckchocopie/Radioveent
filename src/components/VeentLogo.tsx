"use client";

type Props = {
  size?: number;
};

export default function VeentLogo({ size = 24 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <circle cx="16" cy="16" r="15" fill="#EF2D3A" />
      <circle cx="16" cy="16" r="13" fill="none" stroke="white" strokeWidth="0.8" strokeDasharray="2.5 2" opacity="0.4" />
      <polygon points="13,9 13,23 25,16" fill="white" />
    </svg>
  );
}
