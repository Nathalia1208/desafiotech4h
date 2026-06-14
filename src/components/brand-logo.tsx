export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-baseline gap-1 font-display leading-none ${className}`}>
      <div className="flex flex-col items-start leading-none">
        <span className="text-[0.6em] font-semibold text-primary/80 tracking-wide -mb-[0.15em]">tech</span>
        <span className="text-[1.7em] font-extrabold text-primary leading-none">
          4<span className="text-primary-dark">um</span>
        </span>
      </div>
    </div>
  );
}
