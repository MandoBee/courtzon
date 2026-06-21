import { batchInsert } from '../run.mjs'

export default async function seed(conn) {
  let total = 0

  const modules = [
    { id: 1, slug: 'dashboard', is_active: 1, sort_order: 1 },
    { id: 2, slug: 'bookings', is_active: 1, sort_order: 2 },
    { id: 3, slug: 'resources', is_active: 1, sort_order: 3 },
    { id: 4, slug: 'users', is_active: 1, sort_order: 4 },
    { id: 5, slug: 'roles', is_active: 1, sort_order: 5 },
    { id: 6, slug: 'organisations', is_active: 1, sort_order: 6 },
    { id: 7, slug: 'marketplace', is_active: 1, sort_order: 7 },
    { id: 8, slug: 'payments', is_active: 1, sort_order: 8 },
    { id: 9, slug: 'coaching', is_active: 1, sort_order: 9 },
    { id: 10, slug: 'academies', is_active: 1, sort_order: 10 },
    { id: 11, slug: 'community', is_active: 1, sort_order: 11 },
    { id: 12, slug: 'notifications', is_active: 1, sort_order: 12 },
    { id: 13, slug: 'reports', is_active: 1, sort_order: 13 },
    { id: 14, slug: 'settings', is_active: 1, sort_order: 14 },
    { id: 15, slug: 'advertising', is_active: 1, sort_order: 15 },
    { id: 16, slug: 'cms', is_active: 1, sort_order: 16 },
    { id: 17, slug: 'subscriptions', is_active: 1, sort_order: 17 },
  ]
  total += await batchInsert(conn, 'permission_modules', ['id','slug','is_active','sort_order'], modules)

  const perms = []
  let pid = 1
  const actions = ['view', 'create', 'edit', 'delete', 'approve', 'export']
  const moduleSlugs = ['dashboard','bookings','resources','users','roles','organisations','marketplace','payments','coaching','academies','community','notifications','reports','settings','advertising','cms','subscriptions']
  for (const slug of moduleSlugs) {
    for (const action of actions) {
      perms.push({
        id: pid,
        module_id: modules.find(m => m.slug === slug).id,
        permission_key: `${slug}.${action}`,
        is_system: 0,
      })
      pid++
    }
  }
  total += await batchInsert(conn, 'permissions', ['id','module_id','permission_key','is_system'], perms)

  const roles = [
    { name: 'Super Admin', slug: 'super_admin', description: 'Full platform access', organisation_id: null, is_system: 1, is_active: 1 },
    { name: 'Player', slug: 'player', description: 'Regular player/customer', organisation_id: null, is_system: 1, is_active: 1 },
    { name: 'System Admin', slug: 'system_admin', description: 'Platform-level admin with system-wide access', organisation_id: null, is_system: 0, is_active: 1 },
    { name: 'Admin', slug: 'admin', description: 'Organisation-level admin', organisation_id: null, is_system: 0, is_active: 1 },
    { name: 'Coach', slug: 'coach', description: 'Coach with session management', organisation_id: null, is_system: 0, is_active: 1 },
    { name: 'Accountant', slug: 'accountant', description: 'Financial data access', organisation_id: null, is_system: 0, is_active: 1 },
    { name: 'Support Agent', slug: 'support_agent', description: 'Customer support access', organisation_id: null, is_system: 0, is_active: 1 },
  ]
  total += await batchInsert(conn, 'roles', ['name','slug','description','organisation_id','is_system','is_active'], roles)

  // Get actual IDs
  const [roleRows] = await conn.query('SELECT id, slug FROM roles ORDER BY id')
  const roleIdMap = {}
  for (const r of roleRows) roleIdMap[r.slug] = r.id

  const rp = []
  let rpid = 1
  const allPermIds = perms.map(p => p.id)
  const superAdminPermIds = allPermIds
  const orgAdminExcludeSlugs = ['roles.*', 'settings.*', 'advertising.*', 'subscriptions.*']
  const orgAdminPerms = perms.filter(p => !orgAdminExcludeSlugs.some(ex => {
    const [mod, act] = ex.split('.')
    return p.permission_key.startsWith(mod) && (act === '*' || p.permission_key.endsWith('.' + act))
  }))
  const bmPerms = perms.filter(p =>
    p.permission_key.startsWith('bookings.') ||
    p.permission_key.startsWith('resources.') ||
    p.permission_key.startsWith('users.view') ||
    p.permission_key.startsWith('dashboard.')
  )
  const coachPerms = perms.filter(p =>
    p.permission_key.startsWith('coaching.') ||
    p.permission_key === 'dashboard.view' ||
    p.permission_key === 'bookings.view'
  )
  const playerPerms = perms.filter(p =>
    p.permission_key === 'bookings.view' || p.permission_key === 'bookings.create' ||
    p.permission_key === 'marketplace.view' || p.permission_key === 'marketplace.create' ||
    p.permission_key === 'coaching.view' || p.permission_key === 'dashboard.view' ||
    p.permission_key === 'community.view' || p.permission_key === 'notifications.view'
  )
  const acctPerms = perms.filter(p =>
    p.permission_key.startsWith('payments.') ||
    p.permission_key.startsWith('reports.') ||
    p.permission_key === 'dashboard.view'
  )
  const supportPerms = perms.filter(p =>
    p.permission_key === 'users.view' || p.permission_key === 'bookings.view' ||
    p.permission_key.startsWith('notifications.')
  )

  const rolePermMap = {
    'super_admin': superAdminPermIds,
    'system_admin': orgAdminPerms.map(p => p.id),
    'admin': orgAdminPerms.map(p => p.id),
    'coach': coachPerms.map(p => p.id),
    'player': playerPerms.map(p => p.id),
    'accountant': acctPerms.map(p => p.id),
    'support_agent': supportPerms.map(p => p.id),
  }
  const NOW = new Date().toISOString().slice(0, 19).replace('T', ' ')
  for (const [slug, permIds] of Object.entries(rolePermMap)) {
    const roleId = roleIdMap[slug]
    if (!roleId) continue
    for (const permId of permIds) {
      rp.push({ id: rpid, role_id: roleId, permission_id: permId, created_at: NOW })
      rpid++
    }
  }
  total += await batchInsert(conn, 'role_permissions', ['id','role_id','permission_id','created_at'], rp)

  return total
}
