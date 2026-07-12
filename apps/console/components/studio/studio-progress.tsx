export function StudioProgress({ completed, total, percent }: {
  completed: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="studio-progress">
      <div><strong>{percent}% complete</strong><span>{completed} of {total} sections ready</span></div>
      <div aria-label={`${percent}% complete`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} role="progressbar">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
