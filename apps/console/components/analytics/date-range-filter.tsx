export function DateRangeFilter({ range, includeSimulation }: { range: { from: string; to: string }; includeSimulation: boolean }) {
  return <form className="analytics-filters" method="get"><label>From<input type="date" name="from" defaultValue={range.from} required /></label><label>To<input type="date" name="to" defaultValue={range.to} required /></label><label className="simulation-toggle"><input type="checkbox" name="include_simulation" value="true" defaultChecked={includeSimulation} /><span>Include simulation traffic</span></label><button type="submit">Update analytics</button></form>;
}
