import type { ComponentType } from 'react'
import { Redirect, Route } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'

// Admin-only routes are hidden outright rather than login-prompted, same as
// other admin-only controls in the app (see CLAUDE.md, Product shape) —
// logging in as a random visitor would never grant admin, so there's nothing
// useful to prompt toward.
export function AdminRoute({
  path,
  exact,
  component: Component,
}: {
  path: string
  exact?: boolean
  component: ComponentType
}) {
  const { isAdmin } = useAuth()
  return (
    <Route
      exact={exact}
      path={path}
      render={() => (isAdmin ? <Component /> : <Redirect to="/account" />)}
    />
  )
}
