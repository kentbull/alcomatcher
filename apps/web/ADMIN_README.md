# AlcoMatcher Admin Interface

## Overview

The admin interface is a modern React-based dashboard for compliance managers to review label applications, trigger re-scans, view audit trails, and make approval decisions.

## Accessing the Admin Interface

### Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to the admin interface:
   ```
   http://localhost:8100/admin.html
   ```

3. Sign in with a compliance_manager account.

### Production

The admin interface is built as a separate entry point and deployed alongside the main scanner app:

- Scanner app: `/` (index.html)
- Admin interface: `/admin.html`

## Routes

- `/admin` - Dashboard with KPI metrics and recent applications
- `/admin/applications` - Searchable, filterable list of all applications (Phase 2)
- `/admin/applications/:id` - Detailed view with event timeline and approval controls (Phase 3)
- `/login` - Authentication page (placeholder for now)

## Authentication

The admin interface requires:
- Valid authentication token (stored in `alcomatcher_token` cookie or localStorage)
- User role: `compliance_manager`

Users with `compliance_officer` role will be redirected to the login page.

## Development Status

### ✅ Phase 1: Complete
- Admin routes and navigation
- Authentication guards
- AdminNavbar component
- AdminDashboard with KPI metrics
- Admin API service

### 🚧 Phase 2: In Progress
- List view with pagination
- Filters and sorting
- Real-time updates via SSE

### ⏳ Phase 3: Pending
- Detail view with event timeline
- Compliance checks display
- Image viewer

### ⏳ Phase 4: Pending
- Re-scan functionality
- Image quality assessment

### ⏳ Phase 5: Pending
- Approval/rejection workflow
- Reviewer notes
- Manual override events

### ⏳ Phase 6: Pending
- Code splitting and optimization
- Accessibility improvements
- Mobile responsive design
- Performance optimization

## Architecture

### Tech Stack
- React 18 + TypeScript
- React Router 6
- Vite (build tool)
- Existing design system (brewery/wine aesthetic)

### File Structure
```
apps/web/src/
  pages/admin/
    AdminDashboard.tsx          # Landing page with metrics
    AdminListView.tsx           # Applications list (Phase 2)
    AdminDetailView.tsx         # Detail/review panel (Phase 3)
  components/admin/
    AdminNavbar.tsx             # Top navigation
    MetricsCard.tsx             # KPI metric display
    ApplicationTable.tsx        # Table component (Phase 2)
    EventTimeline.tsx           # Event history (Phase 3)
    ImageViewer.tsx             # Image display (Phase 4)
    ApprovalControls.tsx        # Approve/reject buttons (Phase 5)
  services/
    adminApi.ts                 # Admin API client
  types/
    admin.ts                    # Admin-specific types
```

## API Endpoints

### Existing Endpoints
- `GET /api/admin/kpis?windowHours=168` - KPI metrics
- `GET /api/admin/queue?status=needs_review` - Application queue
- `GET /api/applications/:applicationId/events` - Event history
- `GET /api/history/:applicationId` - Application detail
- `GET /api/history/:applicationId/images/:imageId?variant=thumb|full` - Images
- `GET /api/auth/me` - Current user info

### Planned Endpoints (Phase 5)
- `POST /api/admin/applications/:applicationId/approve` - Approve application
- `POST /api/admin/applications/:applicationId/reject` - Reject application
- `POST /api/admin/applications/:applicationId/images/:imageId/rescan` - Re-scan image

## Design System

The admin interface extends the existing brewery/wine aesthetic with additional status colors and components:

### Color Variables
```css
--status-pass: #41ab5b    /* Success/approved */
--status-fail: #c44737    /* Failure/rejected */
--status-review: #dfa33b  /* Needs review */
--status-pending: #6b7280 /* Pending */
```

### Components
- `.admin-card` - Card container with backdrop blur
- `.status-badge` - Color-coded status indicators
- `.admin-table` - Data table with hover states
- `.btn-admin` - Button variants (primary, secondary, danger)

## Testing

### Manual Testing Checklist

Phase 1:
- [ ] Navigate to `/admin.html`
- [ ] Verify navbar shows user email and sign-out button
- [ ] Verify "Sign In" button shows when not authenticated
- [ ] Verify dashboard loads KPI metrics
- [ ] Verify recent applications table displays
- [ ] Click "View All" navigates to applications list

## Troubleshooting

### "Unauthorized" or redirect to login
- Ensure you have a valid `alcomatcher_token` in cookies or localStorage
- Verify your user role is `compliance_manager`
- Try signing in again at `/login`

### KPIs not loading
- Check browser console for API errors
- Verify `/api/admin/kpis` endpoint is accessible
- Ensure server is running

### TypeScript errors
```bash
npm run typecheck
```

### Build errors
```bash
npm run build
```

## Contributing

When adding new features:
1. Follow the existing component structure
2. Use TypeScript with strict types
3. Maintain the brewery/wine design aesthetic
4. Add error handling for all API calls
5. Update this README with new routes/features
