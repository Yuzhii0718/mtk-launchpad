export function Md5Line(props: {
  expectedLabel: string
  actualLabel: string
  expected?: string
  actual?: string
  passed: boolean | null
}) {
  const { expectedLabel, actualLabel, expected, actual, passed } = props
  return (
    <div className="md5-line">
      <div>
        {expectedLabel}: <code>{expected ?? '-'}</code>
      </div>
      <div>
        {actualLabel}: <code>{actual ?? '-'}</code>
      </div>
      {passed !== null && <div className={passed ? 'status ok' : 'status err'}>{passed ? '✔' : '✖'}</div>}
    </div>
  )
}
