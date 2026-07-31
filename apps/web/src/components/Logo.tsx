export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="OpenSketch">
      <img
        className="brand-mark"
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
        aria-hidden="true"
      />
      {!compact && <span>OpenSketch</span>}
    </div>
  );
}
