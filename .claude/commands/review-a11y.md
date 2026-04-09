# Accessibility Review Agent

Review ConceptMesh components for accessibility. The app is a visual graph canvas — inherently challenging for a11y — but all non-canvas UI must be fully accessible.

## Checks

### Modal & Dialogs (ConceptModal)
- [ ] Focus is trapped inside open modal
- [ ] Escape key closes the modal
- [ ] `role="dialog"` and `aria-modal="true"` present
- [ ] Modal has `aria-labelledby` pointing to the title
- [ ] Focus returns to trigger element on close

### Interactive Elements
- [ ] All buttons have accessible labels (text content or `aria-label`)
- [ ] Search input has associated label or `aria-label`
- [ ] Custom interactive elements have appropriate ARIA roles
- [ ] Keyboard navigation works (Tab, Enter, Escape, Arrow keys)
- [ ] Focus indicators are visible (not removed by CSS reset)

### Canvas (Best Effort)
- [ ] Canvas has `role="application"` or `aria-label` describing it
- [ ] A text alternative exists for the graph (concept list view or search)
- [ ] Zoom controls are keyboard accessible
- [ ] Screen reader announcement when new nodes appear

### Color & Contrast
- [ ] Text meets WCAG AA contrast ratio (4.5:1 for normal, 3:1 for large)
- [ ] Information is not conveyed by color alone (connection types have labels too)
- [ ] Focus indicators have sufficient contrast

### SerendipityBanner
- [ ] Banner uses `role="status"` or `aria-live="polite"`
- [ ] Dismiss button is keyboard accessible
- [ ] Auto-dismiss has sufficient time (>5 seconds) or can be paused

## Output

```
♿ [WCAG Level: A|AA|AAA] component:line — issue + fix
```
