export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="OpenSketch">
      <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M8 10.5 19.5 4 32 10.5v13L20.5 30 8 23.5Z" />
        <path d="M8 16.8 20 23l12-6.2M20 23v13" />
        <circle cx="20" cy="13" r="3.3" />
      </svg>
      {!compact && (
        <span>
          Open<strong>Sketch</strong>
        </span>
      )}
    </div>
  );
}
