# Analytics Renderer Verification Checklist

- [ ] Open `admin/analytics` and submit a prompt that returns metrics, charts, and insights.
- [ ] Confirm the page renders through the spec renderer (not legacy fallback) when `spec` exists.
- [ ] Confirm fallback behavior still works when only `fallbackDashboard` is returned.
- [ ] Trigger a `Button` action in a rendered spec and verify UI state updates.
- [ ] Verify `toggleSection` changes visibility of a collapsible section.
- [ ] Verify `applyFilter` writes values under `uiState.filters`.
- [ ] Verify invalid AI JSON returns a handled API error (no page crash).
- [ ] Confirm unknown element types render a safe fallback warning block.
- [ ] Confirm no regressions in legacy `DynamicDashboard` loading skeleton and empty state.
