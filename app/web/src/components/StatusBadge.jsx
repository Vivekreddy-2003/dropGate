export default function StatusBadge({ status }) {
  const label = status?.replace(/_/g, ' ') ?? 'unknown'
  return <span className={`badge badge-${status}`}>{label}</span>
}
