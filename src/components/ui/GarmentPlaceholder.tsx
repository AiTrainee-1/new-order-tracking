export function GarmentPlaceholder({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M8.5 3.5 5 6l1.5 2.5L8 7.5V20h8V7.5l1.5 1 1.5-2.5-3.5-2.5c-.5.8-1.5 1.5-3 1.5s-2.5-.7-3-1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
