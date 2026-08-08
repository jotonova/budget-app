interface Props {
  title: string
  subtitle?: string
}

export default function SceneHeader({ title, subtitle }: Props) {
  return (
    <div
      className="relative w-full flex flex-col items-center justify-center"
      style={{
        height: 140,
        backgroundColor: 'var(--color-parchment-light)',
        borderBottom: '1px solid var(--color-parchment-dark)',
      }}
    >
      <h1
        className="text-center leading-tight"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 700,
          color: 'var(--color-navy)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className="mt-2"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-ink-soft)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
