import type { UIElement } from './types';

/**
 * Central registry of all UI elements (pages, tabs, buttons, sections, actions)
 * that can be permission-gated.
 *
 * HOW TO ADD A NEW UI ELEMENT:
 *   1. Add an entry below with the appropriate permissionKey, moduleSlug, elementType, and label.
 *   2. Run `node backend/scripts/sync-ui-registry.js` to sync to the database.
 *   3. Use <Can permission="your.key"> in your component to conditionally render.
 */
export const uiRegistry: UIElement[] = [
  // ==========================================================================
  // DASHBOARD MODULE
  // ==========================================================================
  { permissionKey: 'dashboard.view', moduleSlug: 'dashboard', elementType: 'page', elementLabel: 'View Dashboard', componentPath: 'pages/admin/AdminDashboard.tsx' },
  { permissionKey: 'dashboard.stats', moduleSlug: 'dashboard', elementType: 'section', elementLabel: 'Dashboard Statistics', componentPath: 'pages/admin/AdminDashboard.tsx' },
  { permissionKey: 'dashboard.trends', moduleSlug: 'dashboard', elementType: 'section', elementLabel: 'Dashboard Trends', componentPath: 'pages/admin/AdminDashboard.tsx' },

  // ==========================================================================
  // HOME MODULE (player app landing)
  // ==========================================================================
  { permissionKey: 'home.recent-activity', moduleSlug: 'home', elementType: 'section', elementLabel: 'Home Recent Activity', componentPath: 'pages/home/DashboardPage.tsx' },

  // ==========================================================================
  // USERS MODULE
  // ==========================================================================
  { permissionKey: 'users.view', moduleSlug: 'users', elementType: 'page', elementLabel: 'User Management Page', componentPath: 'pages/admin/users/UserListPage.tsx' },
  { permissionKey: 'users.create', moduleSlug: 'users', elementType: 'button', elementLabel: 'Create User', componentPath: 'pages/admin/users/UserListPage.tsx' },
  { permissionKey: 'users.edit', moduleSlug: 'users', elementType: 'button', elementLabel: 'Edit User', componentPath: 'pages/admin/users/UserListPage.tsx' },
  { permissionKey: 'users.delete', moduleSlug: 'users', elementType: 'button', elementLabel: 'Delete User', componentPath: 'pages/admin/users/UserListPage.tsx' },
  { permissionKey: 'users.assign-role', moduleSlug: 'users', elementType: 'action', elementLabel: 'Assign Roles to Users', componentPath: 'pages/admin/users/UserListPage.tsx' },
  { permissionKey: 'users.change-password', moduleSlug: 'users', elementType: 'action', elementLabel: 'Change User Password', componentPath: 'pages/admin/users/UserListPage.tsx' },
  { permissionKey: 'users.view-bookings', moduleSlug: 'users', elementType: 'tab', elementLabel: 'View User Bookings Tab', componentPath: 'components/admin/UserEditModal.tsx' },
  { permissionKey: 'users.view-orders', moduleSlug: 'users', elementType: 'tab', elementLabel: 'View User Orders Tab', componentPath: 'components/admin/UserEditModal.tsx' },
  { permissionKey: 'users.view-activity', moduleSlug: 'users', elementType: 'tab', elementLabel: 'View User Activity Tab', componentPath: 'components/admin/UserEditModal.tsx' },
  // User form fields
  { permissionKey: 'users.edit.first-name', moduleSlug: 'users', elementType: 'field', elementLabel: 'First Name Field', componentPath: 'components/admin/UserEditModal.tsx' },
  { permissionKey: 'users.edit.last-name', moduleSlug: 'users', elementType: 'field', elementLabel: 'Last Name Field', componentPath: 'components/admin/UserEditModal.tsx' },
  { permissionKey: 'users.edit.email', moduleSlug: 'users', elementType: 'field', elementLabel: 'Email Field', componentPath: 'components/admin/UserEditModal.tsx' },
  { permissionKey: 'users.edit.phone', moduleSlug: 'users', elementType: 'field', elementLabel: 'Phone Field', componentPath: 'components/admin/UserEditModal.tsx' },
  { permissionKey: 'users.edit.role', moduleSlug: 'users', elementType: 'field', elementLabel: 'Role Field', componentPath: 'components/admin/UserEditModal.tsx' },
  { permissionKey: 'users.edit.status', moduleSlug: 'users', elementType: 'field', elementLabel: 'Status Field', componentPath: 'components/admin/UserEditModal.tsx' },
  // Profile form fields
  { permissionKey: 'profile.edit.first-name', moduleSlug: 'users', elementType: 'field', elementLabel: 'Profile First Name Field', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.edit.last-name', moduleSlug: 'users', elementType: 'field', elementLabel: 'Profile Last Name Field', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.edit.email', moduleSlug: 'users', elementType: 'field', elementLabel: 'Profile Email Field', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.edit.phone', moduleSlug: 'users', elementType: 'field', elementLabel: 'Profile Phone Field', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.edit.avatar', moduleSlug: 'users', elementType: 'field', elementLabel: 'Avatar Field', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.edit.birth-date', moduleSlug: 'users', elementType: 'field', elementLabel: 'Profile Birth Date Field', componentPath: 'pages/profile/ProfilePage.tsx' },

  // ==========================================================================
  // ROLES MODULE
  // ==========================================================================
  { permissionKey: 'roles.view', moduleSlug: 'roles', elementType: 'page', elementLabel: 'Roles & Permissions Page', componentPath: 'pages/admin/roles/RoleListPage.tsx' },
  { permissionKey: 'roles.create', moduleSlug: 'roles', elementType: 'button', elementLabel: 'Create Role', componentPath: 'pages/admin/roles/RoleListPage.tsx' },
  { permissionKey: 'roles.edit', moduleSlug: 'roles', elementType: 'button', elementLabel: 'Edit Role', componentPath: 'pages/admin/roles/RoleListPage.tsx' },
  { permissionKey: 'roles.delete', moduleSlug: 'roles', elementType: 'button', elementLabel: 'Delete Role', componentPath: 'pages/admin/roles/RoleListPage.tsx' },
  { permissionKey: 'roles.restore', moduleSlug: 'roles', elementType: 'button', elementLabel: 'Restore Deleted Role', componentPath: 'pages/admin/roles/RoleListPage.tsx' },
  { permissionKey: 'roles.toggle-active', moduleSlug: 'roles', elementType: 'action', elementLabel: 'Toggle Role Active/Inactive', componentPath: 'pages/admin/roles/RoleListPage.tsx' },
  { permissionKey: 'roles.assign-permissions', moduleSlug: 'roles', elementType: 'action', elementLabel: 'Assign Permissions to Role', componentPath: 'pages/admin/roles/RoleListPage.tsx' },
  { permissionKey: 'roles.copy-permissions', moduleSlug: 'roles', elementType: 'action', elementLabel: 'Copy Permissions from Another Role', componentPath: 'pages/admin/roles/RoleListPage.tsx' },
  { permissionKey: 'permissions.view', moduleSlug: 'roles', elementType: 'page', elementLabel: 'Permissions Management Page', componentPath: 'pages/admin/permissions/PermissionsPage.tsx' },
  { permissionKey: 'permissions.create', moduleSlug: 'roles', elementType: 'button', elementLabel: 'Create Permission Key', componentPath: 'pages/admin/permissions/PermissionsPage.tsx' },
  { permissionKey: 'permissions.edit', moduleSlug: 'roles', elementType: 'button', elementLabel: 'Edit Permission Key', componentPath: 'pages/admin/permissions/PermissionsPage.tsx' },
  { permissionKey: 'permissions.delete', moduleSlug: 'roles', elementType: 'button', elementLabel: 'Delete Permission Key', componentPath: 'pages/admin/permissions/PermissionsPage.tsx' },

  // ==========================================================================
  // UI PERMISSIONS MODULE (self-referential — controls this feature itself)
  // ==========================================================================
  { permissionKey: 'ui-permissions.view', moduleSlug: 'settings', elementType: 'page', elementLabel: 'UI Permissions Screen', componentPath: 'pages/admin/ui-permissions/UIPermissionsPage.tsx' },
  { permissionKey: 'ui-permissions.toggle-role', moduleSlug: 'settings', elementType: 'action', elementLabel: 'Toggle Role Access on UI Element', componentPath: 'pages/admin/ui-permissions/UIPermissionsPage.tsx' },
  { permissionKey: 'ui-permissions.sync', moduleSlug: 'settings', elementType: 'button', elementLabel: 'Sync UI Registry Button', componentPath: 'pages/admin/ui-permissions/UIPermissionsPage.tsx' },

  // ==========================================================================
  // ORGANISATIONS MODULE
  // ==========================================================================
  { permissionKey: 'organisations.view', moduleSlug: 'organisations', elementType: 'page', elementLabel: 'Organisations Page', componentPath: 'pages/admin/organisations/OrganisationListPage.tsx' },
  { permissionKey: 'organisations.create', moduleSlug: 'organisations', elementType: 'button', elementLabel: 'Create Organisation', componentPath: 'pages/admin/organisations/OrganisationListPage.tsx' },
  { permissionKey: 'organisations.edit', moduleSlug: 'organisations', elementType: 'button', elementLabel: 'Edit Organisation', componentPath: 'pages/admin/organisations/OrganisationListPage.tsx' },
  { permissionKey: 'organisations.delete', moduleSlug: 'organisations', elementType: 'button', elementLabel: 'Delete Organisation', componentPath: 'pages/admin/organisations/OrganisationListPage.tsx' },
  { permissionKey: 'organisations.verify', moduleSlug: 'organisations', elementType: 'action', elementLabel: 'Verify Organisation', componentPath: 'pages/admin/organisations/OrganisationListPage.tsx' },
  { permissionKey: 'organisations.edit.basic', moduleSlug: 'organisations', elementType: 'tab', elementLabel: 'Edit Organisation Basic Info', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.docs', moduleSlug: 'organisations', elementType: 'tab', elementLabel: 'Edit Organisation Documents', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.cancellation', moduleSlug: 'organisations', elementType: 'tab', elementLabel: 'Cancellation Policy Tab', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.branches', moduleSlug: 'organisations', elementType: 'tab', elementLabel: 'Manage Organisation Branches', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.resources', moduleSlug: 'organisations', elementType: 'tab', elementLabel: 'View Organisation Resources Tab', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.org-type', moduleSlug: 'organisations', elementType: 'action', elementLabel: 'Change Organisation Type', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.country', moduleSlug: 'organisations', elementType: 'action', elementLabel: 'Change Organisation Country', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.logo', moduleSlug: 'organisations', elementType: 'action', elementLabel: 'Upload Organisation Logo', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.cover', moduleSlug: 'organisations', elementType: 'action', elementLabel: 'Upload Organisation Cover', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.cancellation-policy', moduleSlug: 'organisations', elementType: 'action', elementLabel: 'Cancellation Policy Level Toggle', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.storefront.view', moduleSlug: 'organisations', elementType: 'page', elementLabel: 'Organisation Storefront (player view)', componentPath: 'pages/organisations/OrgStorefrontPage.tsx' },
  { permissionKey: 'organisation-types.view', moduleSlug: 'organisations', elementType: 'page', elementLabel: 'Organisation Types Page', componentPath: 'pages/admin/organisation-types/OrganisationTypesPage.tsx' },
  { permissionKey: 'organisation-types.create', moduleSlug: 'organisations', elementType: 'button', elementLabel: 'Create Organisation Type', componentPath: 'pages/admin/organisation-types/OrganisationTypesPage.tsx' },
  { permissionKey: 'organisation-types.edit', moduleSlug: 'organisations', elementType: 'button', elementLabel: 'Edit Organisation Type', componentPath: 'pages/admin/organisation-types/OrganisationTypesPage.tsx' },
  { permissionKey: 'organisation-types.delete', moduleSlug: 'organisations', elementType: 'button', elementLabel: 'Delete Organisation Type', componentPath: 'pages/admin/organisation-types/OrganisationTypesPage.tsx' },
  // Organisation form fields
  { permissionKey: 'organisations.edit.name', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation Name Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.slug', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation Slug Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.description', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation Description Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.email', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation Email Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.phone', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation Phone Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.website', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation Website Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.address', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation Address Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.city', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation City Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'organisations.edit.timezone', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisation Timezone Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  // Organisation table display columns
  { permissionKey: 'organisations.table.is-verified', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisations Table: Verified Column', componentPath: 'pages/admin/organisations/OrganisationListPage.tsx' },
  { permissionKey: 'organisations.table.is-active', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Organisations Table: Active Column', componentPath: 'pages/admin/organisations/OrganisationListPage.tsx' },
  // Organisation type form fields
  { permissionKey: 'organisation-types.edit.name', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Org Type Name Field', componentPath: 'pages/admin/organisation-types/OrganisationTypesPage.tsx' },
  { permissionKey: 'organisation-types.edit.slug', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Org Type Slug Field', componentPath: 'pages/admin/organisation-types/OrganisationTypesPage.tsx' },
  { permissionKey: 'organisation-types.edit.description', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Org Type Description Field', componentPath: 'pages/admin/organisation-types/OrganisationTypesPage.tsx' },
  { permissionKey: 'organisation-types.edit.sort-order', moduleSlug: 'organisations', elementType: 'field', elementLabel: 'Org Type Sort Order Field', componentPath: 'pages/admin/organisation-types/OrganisationTypesPage.tsx' },

  // ==========================================================================
  // BRANCHES MODULE
  // ==========================================================================
  { permissionKey: 'branches.view', moduleSlug: 'branches', elementType: 'page', elementLabel: 'Branches Page', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.create', moduleSlug: 'branches', elementType: 'button', elementLabel: 'Create Branch', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit', moduleSlug: 'branches', elementType: 'button', elementLabel: 'Edit Branch', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.delete', moduleSlug: 'branches', elementType: 'button', elementLabel: 'Delete Branch', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.request-access', moduleSlug: 'branches', elementType: 'button', elementLabel: 'Request Branch Access (player)', componentPath: 'pages/booking/BrowseBranchesPage.tsx' },
  { permissionKey: 'branches.edit.basic', moduleSlug: 'branches', elementType: 'tab', elementLabel: 'Branch Basic Info Tab', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.financial', moduleSlug: 'branches', elementType: 'tab', elementLabel: 'Branch Financial Details Tab', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.cancellation', moduleSlug: 'branches', elementType: 'tab', elementLabel: 'Branch Cancellation Policy Tab', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'branches.edit.amenities', moduleSlug: 'branches', elementType: 'tab', elementLabel: 'Branch Amenities Tab', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.holidays', moduleSlug: 'branches', elementType: 'tab', elementLabel: 'Branch Holidays Tab', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  // Branch form fields
  { permissionKey: 'branches.edit.name', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Name Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.address', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Address Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.phone', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Phone Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.email', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Email Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.access-type', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Access Type Field', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'branches.edit.opening-hours', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Opening Hours Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.closing-hours', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Closing Hours Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.timezone', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Timezone Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.status', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Status Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.bank-account', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Bank Account Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },
  { permissionKey: 'branches.edit.tax-id', moduleSlug: 'branches', elementType: 'field', elementLabel: 'Branch Tax ID Field', componentPath: 'pages/admin/branches/BranchListPage.tsx' },

  // ==========================================================================
  // RESOURCES MODULE
  // ==========================================================================
  { permissionKey: 'resources.view', moduleSlug: 'resources', elementType: 'page', elementLabel: 'Resources Page', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.create', moduleSlug: 'resources', elementType: 'button', elementLabel: 'Create Resource', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit', moduleSlug: 'resources', elementType: 'button', elementLabel: 'Edit Resource', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.delete', moduleSlug: 'resources', elementType: 'button', elementLabel: 'Delete Resource', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.basic', moduleSlug: 'resources', elementType: 'tab', elementLabel: 'Resource Edit Basic Tab', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'resources.edit.pricing', moduleSlug: 'resources', elementType: 'tab', elementLabel: 'Resource Edit Pricing Tab', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'resources.edit.settings', moduleSlug: 'resources', elementType: 'tab', elementLabel: 'Resource Edit Settings Tab', componentPath: 'components/organisations/OrganisationForm.tsx' },
  { permissionKey: 'resources.edit.maintenance', moduleSlug: 'resources', elementType: 'tab', elementLabel: 'Resource Maintenance Tab', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.peak-hours', moduleSlug: 'resources', elementType: 'tab', elementLabel: 'Resource Peak Hours Tab', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  // Resource form fields
  { permissionKey: 'resources.edit.name', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Resource Name Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.description', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Resource Description Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.sport', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Resource Sport Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.capacity', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Resource Capacity Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.pricing-type', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Pricing Type Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.price', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Resource Price Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.duration', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Resource Duration Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.advance-booking', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Advance Booking Days Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.cancellation-policy', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Cancellation Policy Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },
  { permissionKey: 'resources.edit.status', moduleSlug: 'resources', elementType: 'field', elementLabel: 'Resource Status Field', componentPath: 'pages/admin/resources/ResourceListPage.tsx' },

  // ==========================================================================
  // BOOKINGS MODULE
  // ==========================================================================
  { permissionKey: 'bookings.view', moduleSlug: 'bookings', elementType: 'section', elementLabel: 'My Bookings Section', componentPath: 'pages/booking/MyBookingsPage.tsx' },
  { permissionKey: 'bookings.create', moduleSlug: 'bookings', elementType: 'button', elementLabel: 'Create Booking', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'bookings.cancel', moduleSlug: 'bookings', elementType: 'button', elementLabel: 'Cancel Booking', componentPath: 'pages/booking/MyBookingsPage.tsx' },
  { permissionKey: 'bookings.admin-view', moduleSlug: 'bookings', elementType: 'section', elementLabel: 'Admin Booking View', componentPath: 'pages/admin/AdminDashboard.tsx' },
  // Booking form fields
  { permissionKey: 'bookings.create.resource', moduleSlug: 'bookings', elementType: 'field', elementLabel: 'Booking Resource Field', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'bookings.create.date', moduleSlug: 'bookings', elementType: 'field', elementLabel: 'Booking Date Field', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'bookings.create.start-time', moduleSlug: 'bookings', elementType: 'field', elementLabel: 'Start Time Field', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'bookings.create.end-time', moduleSlug: 'bookings', elementType: 'field', elementLabel: 'End Time Field', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'bookings.create.duration', moduleSlug: 'bookings', elementType: 'field', elementLabel: 'Booking Duration Field', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'bookings.create.participants', moduleSlug: 'bookings', elementType: 'field', elementLabel: 'Participants Field', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'bookings.create.notes', moduleSlug: 'bookings', elementType: 'field', elementLabel: 'Booking Notes Field', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'bookings.create.addon-services', moduleSlug: 'bookings', elementType: 'field', elementLabel: 'Add-on Services Field', componentPath: 'pages/booking/BookingFormPage.tsx' },
  { permissionKey: 'matches.view', moduleSlug: 'bookings', elementType: 'page', elementLabel: 'Matches Page', componentPath: 'pages/booking/MatchListPage.tsx' },
  { permissionKey: 'matches.apply', moduleSlug: 'bookings', elementType: 'button', elementLabel: 'Apply to Match', componentPath: 'pages/booking/MatchListPage.tsx' },
  { permissionKey: 'matches.cancel', moduleSlug: 'bookings', elementType: 'button', elementLabel: 'Cancel Match Application', componentPath: 'pages/booking/MatchListPage.tsx' },
  { permissionKey: 'bookings.manage-applicants', moduleSlug: 'bookings', elementType: 'button', elementLabel: 'Manage Booking Applicants', componentPath: 'components/booking/ManageApplicantsPopup.tsx' },

  // ==========================================================================
  // MARKETPLACE MODULE
  // ==========================================================================
  { permissionKey: 'marketplace.view', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Marketplace Page', componentPath: 'pages/marketplace/MarketplacePage.tsx' },
  { permissionKey: 'marketplace.order.view', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Orders Page', componentPath: 'pages/marketplace/OrderListPage.tsx' },
  { permissionKey: 'marketplace.cart.view', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Cart Page', componentPath: 'pages/marketplace/CartPage.tsx' },
  { permissionKey: 'marketplace.seller.view', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Seller Dashboard', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },

  // ==========================================================================
  // FINANCIAL MODULE
  // ==========================================================================
  { permissionKey: 'financial.wallet.view', moduleSlug: 'financial', elementType: 'page', elementLabel: 'Wallet Page', componentPath: 'pages/profile/WalletPage.tsx' },
  { permissionKey: 'financial.settlements.view', moduleSlug: 'financial', elementType: 'page', elementLabel: 'Settlements Page', componentPath: 'pages/admin/settlements/SettlementListPage.tsx' },
  { permissionKey: 'financial.payment-methods.view', moduleSlug: 'financial', elementType: 'page', elementLabel: 'Payment Methods Page', componentPath: 'pages/admin/payment-methods/PaymentMethodsPage.tsx' },
  { permissionKey: 'financial.payment-gateways.view', moduleSlug: 'financial', elementType: 'page', elementLabel: 'Payment Gateways Page', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  // Payment method form fields
  { permissionKey: 'payment-methods.edit.name', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Payment Method Name Field', componentPath: 'pages/admin/payment-methods/PaymentMethodsPage.tsx' },
  { permissionKey: 'payment-methods.edit.code', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Payment Method Code Field', componentPath: 'pages/admin/payment-methods/PaymentMethodsPage.tsx' },
  { permissionKey: 'payment-methods.edit.type', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Payment Method Type Field', componentPath: 'pages/admin/payment-methods/PaymentMethodsPage.tsx' },
  { permissionKey: 'payment-methods.edit.instructions', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Payment Instructions Field', componentPath: 'pages/admin/payment-methods/PaymentMethodsPage.tsx' },
  { permissionKey: 'payment-methods.edit.status', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Payment Method Status Field', componentPath: 'pages/admin/payment-methods/PaymentMethodsPage.tsx' },
  { permissionKey: 'payment-methods.edit.sort-order', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Payment Method Sort Order Field', componentPath: 'pages/admin/payment-methods/PaymentMethodsPage.tsx' },
  // Payment gateway form fields
  { permissionKey: 'payment-gateways.edit.name', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Gateway Name Field', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  { permissionKey: 'payment-gateways.edit.code', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Gateway Code Field', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  { permissionKey: 'payment-gateways.edit.mode', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Gateway Mode Field', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  { permissionKey: 'payment-gateways.edit.public-key', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Gateway Public Key Field', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  { permissionKey: 'payment-gateways.edit.secret-key', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Gateway Secret Key Field', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  { permissionKey: 'payment-gateways.edit.webhook-secret', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Gateway Webhook Secret Field', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  { permissionKey: 'payment-gateways.edit.status', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Gateway Status Field', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  { permissionKey: 'payment-gateways.edit.sort-order', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Gateway Sort Order Field', componentPath: 'pages/admin/payment-gateways/PaymentGatewaysPage.tsx' },
  // Wallet form fields
  { permissionKey: 'financial.wallet.deposit', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Deposit Amount Field', componentPath: 'pages/profile/WalletPage.tsx' },
  { permissionKey: 'financial.wallet.deposit.payment-method', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Deposit Payment Method Field', componentPath: 'pages/profile/WalletPage.tsx' },
  { permissionKey: 'financial.wallet.withdraw', moduleSlug: 'financial', elementType: 'field', elementLabel: 'Withdraw Amount Field', componentPath: 'pages/profile/WalletPage.tsx' },
  // Withdrawal requests
  { permissionKey: 'financial.withdrawal-requests.view', moduleSlug: 'financial', elementType: 'page', elementLabel: 'Withdrawal Requests Page', componentPath: 'pages/admin/financial/WithdrawalRequestsPage.tsx' },
  { permissionKey: 'financial.withdrawal-requests.approve', moduleSlug: 'financial', elementType: 'button', elementLabel: 'Approve Withdrawal', componentPath: 'pages/admin/financial/WithdrawalRequestsPage.tsx' },
  { permissionKey: 'financial.withdrawal-requests.reject', moduleSlug: 'financial', elementType: 'button', elementLabel: 'Reject Withdrawal', componentPath: 'pages/admin/financial/WithdrawalRequestsPage.tsx' },
  // Coupons
  { permissionKey: 'coupons.view', moduleSlug: 'financial', elementType: 'page', elementLabel: 'Coupons Page', componentPath: 'pages/admin/coupons/CouponListPage.tsx' },
  { permissionKey: 'coupons.create', moduleSlug: 'financial', elementType: 'button', elementLabel: 'Create Coupon', componentPath: 'pages/admin/coupons/CouponListPage.tsx' },
  { permissionKey: 'coupons.edit', moduleSlug: 'financial', elementType: 'button', elementLabel: 'Edit Coupon', componentPath: 'pages/admin/coupons/CouponListPage.tsx' },
  { permissionKey: 'coupons.delete', moduleSlug: 'financial', elementType: 'button', elementLabel: 'Delete Coupon', componentPath: 'pages/admin/coupons/CouponListPage.tsx' },
  { permissionKey: 'coupons.publish', moduleSlug: 'financial', elementType: 'button', elementLabel: 'Publish Coupon', componentPath: 'pages/admin/coupons/CouponListPage.tsx' },

  // ==========================================================================
  // REPORTS MODULE
  // ==========================================================================
  { permissionKey: 'reports.view', moduleSlug: 'reports', elementType: 'page', elementLabel: 'Reports Page', componentPath: 'pages/admin/reports/ReportsPage.tsx' },
  { permissionKey: 'reports.export', moduleSlug: 'reports', elementType: 'button', elementLabel: 'Export Reports', componentPath: 'pages/admin/reports/ReportsPage.tsx' },

  // ==========================================================================
  // SETTINGS MODULE (platform + admin utilities)
  // ==========================================================================
  { permissionKey: 'app-settings.view', moduleSlug: 'settings', elementType: 'page', elementLabel: 'App Settings Page', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit', moduleSlug: 'settings', elementType: 'button', elementLabel: 'Save App Settings', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.site-name', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Site Name', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.support-email', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Support Email', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.favicon', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Favicon (Light Mode)', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.favicon-dark', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Favicon (Dark Mode)', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.site-logo', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Site Logo (Light Mode)', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.site-logo-dark', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Site Logo (Dark Mode)', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.pwa-images', moduleSlug: 'settings', elementType: 'field', elementLabel: 'PWA Images', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.domain-name', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Domain Name', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.site-tagline', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Site Tagline', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.meta-description', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Meta Description', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'app-settings.edit.maintenance-mode', moduleSlug: 'settings', elementType: 'field', elementLabel: 'Maintenance Mode', componentPath: 'pages/admin/app-settings/AppSettingsPage.tsx' },
  { permissionKey: 'subscription.view', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Subscription Page', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'feature-flags.view', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Feature Flags Page', componentPath: 'pages/admin/feature-flags/FeatureFlagsPage.tsx' },
  { permissionKey: 'feature-flags.toggle', moduleSlug: 'settings', elementType: 'action', elementLabel: 'Toggle Feature Flag', componentPath: 'pages/admin/feature-flags/FeatureFlagsPage.tsx' },

  // ==========================================================================
  // SPORTS MODULE
  // ==========================================================================
  { permissionKey: 'sports.view', moduleSlug: 'sports', elementType: 'page', elementLabel: 'Sports Management Page', componentPath: 'pages/admin/sports/SportsPage.tsx' },
  { permissionKey: 'sports.create', moduleSlug: 'sports', elementType: 'button', elementLabel: 'Create Sport', componentPath: 'pages/admin/sports/SportsPage.tsx' },
  { permissionKey: 'sports.edit', moduleSlug: 'sports', elementType: 'button', elementLabel: 'Edit Sport', componentPath: 'pages/admin/sports/SportsPage.tsx' },
  { permissionKey: 'sports.delete', moduleSlug: 'sports', elementType: 'button', elementLabel: 'Delete Sport', componentPath: 'pages/admin/sports/SportsPage.tsx' },
  // Sport form fields
  { permissionKey: 'sports.edit.name', moduleSlug: 'sports', elementType: 'field', elementLabel: 'Sport Name Field', componentPath: 'pages/admin/sports/SportsPage.tsx' },
  { permissionKey: 'sports.edit.description', moduleSlug: 'sports', elementType: 'field', elementLabel: 'Sport Description Field', componentPath: 'pages/admin/sports/SportsPage.tsx' },
  { permissionKey: 'sports.edit.icon', moduleSlug: 'sports', elementType: 'field', elementLabel: 'Sport Icon Field', componentPath: 'pages/admin/sports/SportsPage.tsx' },
  { permissionKey: 'sports.edit.status', moduleSlug: 'sports', elementType: 'field', elementLabel: 'Sport Status Field', componentPath: 'pages/admin/sports/SportsPage.tsx' },

  // ==========================================================================
  // LOCALIZATION MODULE
  // ==========================================================================
  { permissionKey: 'countries.view', moduleSlug: 'countries', elementType: 'page', elementLabel: 'Countries Page', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  { permissionKey: 'countries.create', moduleSlug: 'countries', elementType: 'button', elementLabel: 'Create Country', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  { permissionKey: 'countries.edit', moduleSlug: 'countries', elementType: 'button', elementLabel: 'Edit Country', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  { permissionKey: 'countries.delete', moduleSlug: 'countries', elementType: 'button', elementLabel: 'Delete Country', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  { permissionKey: 'currencies.view', moduleSlug: 'currencies', elementType: 'page', elementLabel: 'Currencies Page', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  { permissionKey: 'currencies.create', moduleSlug: 'currencies', elementType: 'button', elementLabel: 'Create Currency', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  { permissionKey: 'currencies.edit', moduleSlug: 'currencies', elementType: 'button', elementLabel: 'Edit Currency', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  { permissionKey: 'currencies.delete', moduleSlug: 'currencies', elementType: 'button', elementLabel: 'Delete Currency', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  { permissionKey: 'languages.view', moduleSlug: 'languages', elementType: 'page', elementLabel: 'Languages Page', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },
  { permissionKey: 'languages.create', moduleSlug: 'languages', elementType: 'button', elementLabel: 'Create Language', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },
  { permissionKey: 'languages.edit', moduleSlug: 'languages', elementType: 'button', elementLabel: 'Edit Language', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },
  { permissionKey: 'languages.delete', moduleSlug: 'languages', elementType: 'button', elementLabel: 'Delete Language', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },
  // Country form fields
  { permissionKey: 'countries.edit.name', moduleSlug: 'countries', elementType: 'field', elementLabel: 'Country Name Field', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  { permissionKey: 'countries.edit.code', moduleSlug: 'countries', elementType: 'field', elementLabel: 'Country Code Field', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  { permissionKey: 'countries.edit.phone-code', moduleSlug: 'countries', elementType: 'field', elementLabel: 'Country Phone Code Field', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  { permissionKey: 'countries.edit.currency', moduleSlug: 'countries', elementType: 'field', elementLabel: 'Country Currency Field', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  { permissionKey: 'countries.edit.status', moduleSlug: 'countries', elementType: 'field', elementLabel: 'Country Status Field', componentPath: 'pages/admin/countries/CountriesPage.tsx' },
  // Currency form fields
  { permissionKey: 'currencies.edit.name', moduleSlug: 'currencies', elementType: 'field', elementLabel: 'Currency Name Field', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  { permissionKey: 'currencies.edit.code', moduleSlug: 'currencies', elementType: 'field', elementLabel: 'Currency Code Field', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  { permissionKey: 'currencies.edit.symbol', moduleSlug: 'currencies', elementType: 'field', elementLabel: 'Currency Symbol Field', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  { permissionKey: 'currencies.edit.exchange-rate', moduleSlug: 'currencies', elementType: 'field', elementLabel: 'Exchange Rate Field', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  { permissionKey: 'currencies.edit.status', moduleSlug: 'currencies', elementType: 'field', elementLabel: 'Currency Status Field', componentPath: 'pages/admin/currencies/CurrenciesPage.tsx' },
  // Language form fields
  { permissionKey: 'languages.edit.name', moduleSlug: 'languages', elementType: 'field', elementLabel: 'Language Name Field', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },
  { permissionKey: 'languages.edit.code', moduleSlug: 'languages', elementType: 'field', elementLabel: 'Language Code Field', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },
  { permissionKey: 'languages.edit.locale', moduleSlug: 'languages', elementType: 'field', elementLabel: 'Language Locale Field', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },
  { permissionKey: 'languages.edit.is-default', moduleSlug: 'languages', elementType: 'field', elementLabel: 'Default Language Field', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },
  { permissionKey: 'languages.edit.status', moduleSlug: 'languages', elementType: 'field', elementLabel: 'Language Status Field', componentPath: 'pages/admin/languages/LanguagesPage.tsx' },

  // ==========================================================================
  // CMS MODULE
  // ==========================================================================
  { permissionKey: 'cms.view', moduleSlug: 'cms', elementType: 'page', elementLabel: 'CMS Page', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.create', moduleSlug: 'cms', elementType: 'button', elementLabel: 'Create CMS Entry', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.edit', moduleSlug: 'cms', elementType: 'button', elementLabel: 'Edit CMS Entry', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.delete', moduleSlug: 'cms', elementType: 'button', elementLabel: 'Delete CMS Entry', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  // CMS form fields
  { permissionKey: 'cms.edit.key', moduleSlug: 'cms', elementType: 'field', elementLabel: 'CMS Key Field', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.edit.title', moduleSlug: 'cms', elementType: 'field', elementLabel: 'CMS Title Field', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.edit.content', moduleSlug: 'cms', elementType: 'field', elementLabel: 'CMS Content Field', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.edit.status', moduleSlug: 'cms', elementType: 'field', elementLabel: 'CMS Status Field', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  // Blog management (tab inside CMS page)
  { permissionKey: 'cms.blog.view', moduleSlug: 'cms', elementType: 'tab', elementLabel: 'Blogs Tab', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.blog.create', moduleSlug: 'cms', elementType: 'button', elementLabel: 'Create Blog Post', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.blog.edit', moduleSlug: 'cms', elementType: 'button', elementLabel: 'Edit Blog Post', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.blog.delete', moduleSlug: 'cms', elementType: 'button', elementLabel: 'Delete Blog Post', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.blog.publish', moduleSlug: 'cms', elementType: 'button', elementLabel: 'Publish/Unpublish Blog Post', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.blog.edit.title', moduleSlug: 'cms', elementType: 'field', elementLabel: 'Blog Title Field', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.blog.edit.slug', moduleSlug: 'cms', elementType: 'field', elementLabel: 'Blog Slug Field', componentPath: 'pages/admin/cms/CmsPage.tsx' },
  { permissionKey: 'cms.blog.edit.content', moduleSlug: 'cms', elementType: 'field', elementLabel: 'Blog Content Field', componentPath: 'pages/admin/cms/CmsPage.tsx' },

  // ==========================================================================
  // ADS MODULE
  // ==========================================================================
  { permissionKey: 'ads.view', moduleSlug: 'ads', elementType: 'page', elementLabel: 'Ads Management Page', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.create', moduleSlug: 'ads', elementType: 'button', elementLabel: 'Create Ad', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.edit', moduleSlug: 'ads', elementType: 'button', elementLabel: 'Edit Ad', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.delete', moduleSlug: 'ads', elementType: 'button', elementLabel: 'Delete Ad', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  // Ad form fields
  { permissionKey: 'ads.edit.title', moduleSlug: 'ads', elementType: 'field', elementLabel: 'Ad Title Field', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.edit.content', moduleSlug: 'ads', elementType: 'field', elementLabel: 'Ad Content Field', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.edit.image', moduleSlug: 'ads', elementType: 'field', elementLabel: 'Ad Image Field', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.edit.link', moduleSlug: 'ads', elementType: 'field', elementLabel: 'Ad Link Field', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.edit.placement', moduleSlug: 'ads', elementType: 'field', elementLabel: 'Ad Placement Field', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.edit.start-date', moduleSlug: 'ads', elementType: 'field', elementLabel: 'Ad Start Date Field', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.edit.end-date', moduleSlug: 'ads', elementType: 'field', elementLabel: 'Ad End Date Field', componentPath: 'pages/admin/ads/AdsPage.tsx' },
  { permissionKey: 'ads.edit.status', moduleSlug: 'ads', elementType: 'field', elementLabel: 'Ad Status Field', componentPath: 'pages/admin/ads/AdsPage.tsx' },

  // ==========================================================================
  // TRANSLATIONS MODULE
  // ==========================================================================
  { permissionKey: 'translations.view', moduleSlug: 'translations', elementType: 'page', elementLabel: 'Translations Page', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },
  { permissionKey: 'translations.create', moduleSlug: 'translations', elementType: 'button', elementLabel: 'Create Translation Key', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },
  { permissionKey: 'translations.sync', moduleSlug: 'translations', elementType: 'button', elementLabel: 'Sync Translation Keys', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },
  { permissionKey: 'translations.edit', moduleSlug: 'translations', elementType: 'button', elementLabel: 'Edit Translation', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },
  { permissionKey: 'translations.delete', moduleSlug: 'translations', elementType: 'button', elementLabel: 'Delete Translation', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },
  // Translation form fields
  { permissionKey: 'translations.edit.key', moduleSlug: 'translations', elementType: 'field', elementLabel: 'Translation Key Field', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },
  { permissionKey: 'translations.edit.value', moduleSlug: 'translations', elementType: 'field', elementLabel: 'Translation Value Field', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },
  { permissionKey: 'translations.edit.language', moduleSlug: 'translations', elementType: 'field', elementLabel: 'Translation Language Field', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },
  { permissionKey: 'translations.edit.module', moduleSlug: 'translations', elementType: 'field', elementLabel: 'Translation Module Field', componentPath: 'pages/admin/translations/TranslationsPage.tsx' },

  // ==========================================================================
  // SECURITY MODULE
  // ==========================================================================
  { permissionKey: 'security.dashboard', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Security Dashboard', componentPath: 'pages/admin/security/SecurityDashboard.tsx' },
  { permissionKey: 'security.sessions', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Active Sessions', componentPath: 'pages/admin/security/SessionsPage.tsx' },
  { permissionKey: 'security.sessions.revoke', moduleSlug: 'settings', elementType: 'action', elementLabel: 'Revoke Session', componentPath: 'pages/admin/security/SessionsPage.tsx' },
  { permissionKey: 'security.failed-logins', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Failed Logins', componentPath: 'pages/admin/security/FailedLoginsPage.tsx' },
  { permissionKey: 'security.uploads', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Upload Security', componentPath: 'pages/admin/security/UploadSecurityPage.tsx' },
  { permissionKey: 'security.system-health', moduleSlug: 'settings', elementType: 'page', elementLabel: 'System Health', componentPath: 'pages/admin/security/SystemHealthPage.tsx' },
  { permissionKey: 'security.organisations', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Org Security Overview', componentPath: 'pages/admin/security/OrganisationSecurityPage.tsx' },
  { permissionKey: 'security.role-audit', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Role Permission Audit', componentPath: 'pages/admin/security/RoleAuditPage.tsx' },

  // ==========================================================================
  // AUDIT MODULE
  // ==========================================================================
  { permissionKey: 'audit.view', moduleSlug: 'audit', elementType: 'page', elementLabel: 'Audit Log Page', componentPath: 'pages/admin/AuditLogPage.tsx' },
  { permissionKey: 'audit.export', moduleSlug: 'audit', elementType: 'button', elementLabel: 'Export Audit Logs', componentPath: 'pages/admin/AuditLogPage.tsx' },

  // Tournament admin
  { permissionKey: 'admin-tournaments.view', moduleSlug: 'tournaments', elementType: 'page', elementLabel: 'Tournaments Admin Page', componentPath: 'pages/admin/tournaments/TournamentAdminPage.tsx' },
  { permissionKey: 'tournaments.edit', moduleSlug: 'tournaments', elementType: 'button', elementLabel: 'Edit Tournament', componentPath: 'pages/admin/tournaments/TournamentAdminPage.tsx' },
  { permissionKey: 'tournaments.delete', moduleSlug: 'tournaments', elementType: 'button', elementLabel: 'Delete Tournament', componentPath: 'pages/admin/tournaments/TournamentAdminPage.tsx' },

  // ==========================================================================
  // TOURNAMENTS MODULE
  // ==========================================================================
  { permissionKey: 'tournaments.view', moduleSlug: 'tournaments', elementType: 'page', elementLabel: 'Tournaments List Page', componentPath: 'pages/tournaments/TournamentListPage.tsx' },
  { permissionKey: 'tournaments.create', moduleSlug: 'tournaments', elementType: 'button', elementLabel: 'Create Tournament', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.join', moduleSlug: 'tournaments', elementType: 'button', elementLabel: 'Join Tournament', componentPath: 'pages/tournaments/TournamentDetailPage.tsx' },
  // Tournament form fields
  { permissionKey: 'tournaments.create.name', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Name Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.sport', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Sport Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.type', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Type Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.format', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Format Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.start-date', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Start Date Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.end-date', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament End Date Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.registration-deadline', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Registration Deadline Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.max-participants', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Max Participants Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.description', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Description Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.rules', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Rules Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.prize', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Prize Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.location', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Location Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },
  { permissionKey: 'tournaments.create.banner', moduleSlug: 'tournaments', elementType: 'field', elementLabel: 'Tournament Banner Field', componentPath: 'pages/tournaments/TournamentCreatePage.tsx' },

  // ==========================================================================
  // ACADEMIES MODULE
  // ==========================================================================
  // Academy admin
  { permissionKey: 'admin-academies.view', moduleSlug: 'academies', elementType: 'page', elementLabel: 'Academies Admin Page', componentPath: 'pages/admin/academies/AcademyAdminPage.tsx' },
  { permissionKey: 'academies.delete', moduleSlug: 'academies', elementType: 'button', elementLabel: 'Delete Academy', componentPath: 'pages/admin/academies/AcademyAdminPage.tsx' },
  { permissionKey: 'academies.view', moduleSlug: 'academies', elementType: 'page', elementLabel: 'Academies List Page', componentPath: 'pages/academies/AcademyListPage.tsx' },
  { permissionKey: 'academies.enroll', moduleSlug: 'academies', elementType: 'button', elementLabel: 'Enroll in Academy', componentPath: 'pages/academies/AcademyDetailPage.tsx' },

  // ==========================================================================
  // COACHES MODULE
  // ==========================================================================
  // Coach admin
  { permissionKey: 'admin-coaches.view', moduleSlug: 'coaches', elementType: 'page', elementLabel: 'Coaches Admin Page', componentPath: 'pages/admin/coaches/CoachAdminPage.tsx' },
  { permissionKey: 'coaches.verify', moduleSlug: 'coaches', elementType: 'button', elementLabel: 'Verify Coach', componentPath: 'pages/admin/coaches/CoachAdminPage.tsx' },
  { permissionKey: 'coaches.toggle', moduleSlug: 'coaches', elementType: 'button', elementLabel: 'Toggle Coach Availability', componentPath: 'pages/admin/coaches/CoachAdminPage.tsx' },
  { permissionKey: 'coaches.delete', moduleSlug: 'coaches', elementType: 'button', elementLabel: 'Delete Coach', componentPath: 'pages/admin/coaches/CoachAdminPage.tsx' },
  { permissionKey: 'coaches.approve', moduleSlug: 'coaches', elementType: 'button', elementLabel: 'Approve/Reject Coach Application', componentPath: 'pages/admin/coaches/CoachAdminPage.tsx' },
  { permissionKey: 'coaches.view', moduleSlug: 'coaches', elementType: 'page', elementLabel: 'Coach Directory Page', componentPath: 'pages/coaches/CoachDirectoryPage.tsx' },
  { permissionKey: 'coaches.sessions.view', moduleSlug: 'coaches', elementType: 'page', elementLabel: 'My Coach Sessions Page', componentPath: 'pages/coaches/CoachSessionsPage.tsx' },
  { permissionKey: 'coaches.book', moduleSlug: 'coaches', elementType: 'button', elementLabel: 'Book a Coach', componentPath: 'pages/coaches/CoachBookingPage.tsx' },
  { permissionKey: 'coaches.reviews.create', moduleSlug: 'coaches', elementType: 'button', elementLabel: 'Submit Coach Review', componentPath: 'pages/coaches/CoachDetailPage.tsx' },
  { permissionKey: 'coaches.availability.manage', moduleSlug: 'coaches', elementType: 'tab', elementLabel: 'Manage Coach Weekly Availability', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.invites.respond', moduleSlug: 'coaches', elementType: 'button', elementLabel: 'Accept/Reject Org Invite', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile', moduleSlug: 'coaches', elementType: 'page', elementLabel: 'Coach Profile Page', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.apply', moduleSlug: 'coaches', elementType: 'button', elementLabel: 'Apply to Become a Coach', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'coaches.assign', moduleSlug: 'coaches', elementType: 'action', elementLabel: 'Assign Coach Status (Admin)', componentPath: 'pages/admin/users/UserEditModal.tsx' },
  // Coach booking form fields
  { permissionKey: 'coaches.book.coach', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Select Coach Field', componentPath: 'pages/coaches/CoachBookingPage.tsx' },
  { permissionKey: 'coaches.book.date', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Session Date Field', componentPath: 'pages/coaches/CoachBookingPage.tsx' },
  { permissionKey: 'coaches.book.time', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Session Time Field', componentPath: 'pages/coaches/CoachBookingPage.tsx' },
  { permissionKey: 'coaches.book.duration', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Session Duration Field', componentPath: 'pages/coaches/CoachBookingPage.tsx' },
  { permissionKey: 'coaches.book.organisation', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Select Organisation Field', componentPath: 'pages/coaches/CoachBookingPage.tsx' },
  { permissionKey: 'coaches.book.notes', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Session Notes Field', componentPath: 'pages/coaches/CoachBookingPage.tsx' },
  // Coach profile edit fields
  { permissionKey: 'coaches.profile.edit.bio', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Bio Field', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile.edit.experience', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Experience Field', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile.edit.rate', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Hourly Rate Field', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile.edit.currency', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Currency Field', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile.edit.availability', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Availability Toggle', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile.edit.durations', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Session Durations', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile.edit.sports', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Sports Selection', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile.edit.certifications', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Certifications', componentPath: 'pages/coaches/CoachProfilePage.tsx' },
  { permissionKey: 'coaches.profile.edit.orgs', moduleSlug: 'coaches', elementType: 'field', elementLabel: 'Edit Organization Agreements', componentPath: 'pages/coaches/CoachProfilePage.tsx' },

  // ==========================================================================
  // COMMUNITY MODULE
  // ==========================================================================
  // Community admin
  { permissionKey: 'admin-events.view', moduleSlug: 'community', elementType: 'page', elementLabel: 'Community Events Admin Page', componentPath: 'pages/admin/community/CommunityEventsAdminPage.tsx' },
  { permissionKey: 'community.delete_events', moduleSlug: 'community', elementType: 'button', elementLabel: 'Delete Community Event', componentPath: 'pages/admin/community/CommunityEventsAdminPage.tsx' },
  { permissionKey: 'community.events.view', moduleSlug: 'community', elementType: 'page', elementLabel: 'Community Events Page', componentPath: 'pages/community/CommunityEventsPage.tsx' },
  { permissionKey: 'community.chat.view', moduleSlug: 'community', elementType: 'page', elementLabel: 'Messages / Chat Page', componentPath: 'pages/community/MessagesPage.tsx' },
  { permissionKey: 'community.chat.send', moduleSlug: 'community', elementType: 'button', elementLabel: 'Send Chat Message', componentPath: 'pages/community/MessagesPage.tsx' },
  // Contact form fields
  { permissionKey: 'contact.form.name', moduleSlug: 'community', elementType: 'field', elementLabel: 'Contact Name Field', componentPath: 'pages/landing/blocks/ContactFormBlock.tsx' },
  { permissionKey: 'contact.form.email', moduleSlug: 'community', elementType: 'field', elementLabel: 'Contact Email Field', componentPath: 'pages/landing/blocks/ContactFormBlock.tsx' },
  { permissionKey: 'contact.form.subject', moduleSlug: 'community', elementType: 'field', elementLabel: 'Contact Subject Field', componentPath: 'pages/landing/blocks/ContactFormBlock.tsx' },
  { permissionKey: 'contact.form.message', moduleSlug: 'community', elementType: 'field', elementLabel: 'Contact Message Field', componentPath: 'pages/landing/blocks/ContactFormBlock.tsx' },

  // ==========================================================================
  // SIDEBAR NAVIGATION ITEMS
  // ==========================================================================
  { permissionKey: 'sidebar.dashboard', moduleSlug: 'dashboard', elementType: 'tab', elementLabel: 'Sidebar: Dashboard', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.reports', moduleSlug: 'reports', elementType: 'tab', elementLabel: 'Sidebar: Reports', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.organisations', moduleSlug: 'organisations', elementType: 'tab', elementLabel: 'Sidebar: Organisations', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.organisation-types', moduleSlug: 'organisations', elementType: 'tab', elementLabel: 'Sidebar: Organisation Types', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.subscription', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Subscription', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.payment-methods', moduleSlug: 'financial', elementType: 'tab', elementLabel: 'Sidebar: Payment Methods', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.payment-gateways', moduleSlug: 'financial', elementType: 'tab', elementLabel: 'Sidebar: Gateway Config', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.roles', moduleSlug: 'roles', elementType: 'tab', elementLabel: 'Sidebar: All Roles', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.permissions', moduleSlug: 'roles', elementType: 'tab', elementLabel: 'Sidebar: Permissions', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.sports', moduleSlug: 'sports', elementType: 'tab', elementLabel: 'Sidebar: Sports', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.users', moduleSlug: 'users', elementType: 'tab', elementLabel: 'Sidebar: Users', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.app-settings-menu', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: App Settings Menu', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.app-settings', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Branding', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.countries', moduleSlug: 'countries', elementType: 'tab', elementLabel: 'Sidebar: Countries', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.currencies', moduleSlug: 'currencies', elementType: 'tab', elementLabel: 'Sidebar: Currencies', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.languages', moduleSlug: 'languages', elementType: 'tab', elementLabel: 'Sidebar: Languages', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.cms', moduleSlug: 'cms', elementType: 'tab', elementLabel: 'Sidebar: CMS', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.ads', moduleSlug: 'ads', elementType: 'tab', elementLabel: 'Sidebar: Ads', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.feature-flags', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Feature Flags', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.translations', moduleSlug: 'translations', elementType: 'tab', elementLabel: 'Sidebar: Translations', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.settlements', moduleSlug: 'financial', elementType: 'tab', elementLabel: 'Sidebar: Settlements', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.audit', moduleSlug: 'audit', elementType: 'tab', elementLabel: 'Sidebar: Audit Log', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.security-dashboard', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Security Dashboard', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.active-sessions', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Active Sessions', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.failed-logins', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Failed Logins', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.upload-security', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Upload Security', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.system-health', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: System Health', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.ui-permissions', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: UI Permissions', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.admin-bookings', moduleSlug: 'bookings', elementType: 'tab', elementLabel: 'Sidebar: Admin Bookings', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.branch-access', moduleSlug: 'bookings', elementType: 'tab', elementLabel: 'Sidebar: Branch Access', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.back-to-app', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Back to App Link', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.marketplace', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Marketplace', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.product-categories', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Product Categories', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.admin-settings', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Admin Settings', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.finance', moduleSlug: 'financial', elementType: 'tab', elementLabel: 'Sidebar: Finance', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.withdrawal-requests', moduleSlug: 'financial', elementType: 'tab', elementLabel: 'Sidebar: Withdrawal Requests', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.finance-transactions', moduleSlug: 'financial', elementType: 'tab', elementLabel: 'Sidebar: Finance (Transactions & Settlements)', componentPath: 'pages/admin/AdminFinancePage.tsx' },
  { permissionKey: 'sidebar.coupons', moduleSlug: 'financial', elementType: 'tab', elementLabel: 'Sidebar: Coupons', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.design-tokens', moduleSlug: 'settings', elementType: 'tab', elementLabel: 'Sidebar: Appearance Studio', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.tournaments-admin', moduleSlug: 'tournaments', elementType: 'tab', elementLabel: 'Sidebar: Tournaments Admin', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.academies-admin', moduleSlug: 'academies', elementType: 'tab', elementLabel: 'Sidebar: Academies Admin', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.coaches-admin', moduleSlug: 'coaches', elementType: 'tab', elementLabel: 'Sidebar: Coaches Admin', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.community-admin', moduleSlug: 'community', elementType: 'tab', elementLabel: 'Sidebar: Community Events Admin', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.layout.manage', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Sidebar Layout Management', componentPath: 'pages/admin/sidebar-layout/SidebarLayoutPage.tsx' },
  // Design tokens
  { permissionKey: 'design-tokens.view', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Design Tokens Page', componentPath: 'pages/admin/design-tokens/DesignTokensPage.tsx' },
  { permissionKey: 'design-tokens.create', moduleSlug: 'settings', elementType: 'button', elementLabel: 'Create Design Token', componentPath: 'pages/admin/design-tokens/DesignTokensPage.tsx' },
  { permissionKey: 'design-tokens.edit', moduleSlug: 'settings', elementType: 'button', elementLabel: 'Edit Design Token / Save Draft', componentPath: 'pages/admin/design-tokens/DesignTokensPage.tsx' },
  { permissionKey: 'design-tokens.delete', moduleSlug: 'settings', elementType: 'button', elementLabel: 'Delete Design Token', componentPath: 'pages/admin/design-tokens/DesignTokensPage.tsx' },
  { permissionKey: 'design-tokens.publish', moduleSlug: 'settings', elementType: 'button', elementLabel: 'Publish Appearance Theme', componentPath: 'pages/admin/design-tokens/DesignTokensPage.tsx' },
  { permissionKey: 'design-tokens.rollback', moduleSlug: 'settings', elementType: 'button', elementLabel: 'Revert Appearance Theme Version', componentPath: 'pages/admin/design-tokens/DesignTokensPage.tsx' },
  { permissionKey: 'appearance.role-customize', moduleSlug: 'settings', elementType: 'page', elementLabel: 'Role Appearance Customization', componentPath: 'pages/settings/RoleAppearancePage.tsx' },
  { permissionKey: 'appearance.role-customize.save', moduleSlug: 'settings', elementType: 'button', elementLabel: 'Save Role Appearance', componentPath: 'pages/settings/RoleAppearancePage.tsx' },

  // ==========================================================================
  // AMENITIES MODULE
  // ==========================================================================
  { permissionKey: 'amenities.view', moduleSlug: 'amenities', elementType: 'page', elementLabel: 'Amenities Management Page', componentPath: 'pages/admin/amenities/AmenitiesPage.tsx' },
  { permissionKey: 'amenities.create', moduleSlug: 'amenities', elementType: 'button', elementLabel: 'Create Amenity', componentPath: 'pages/admin/amenities/AmenitiesPage.tsx' },
  { permissionKey: 'amenities.edit', moduleSlug: 'amenities', elementType: 'button', elementLabel: 'Edit Amenity', componentPath: 'pages/admin/amenities/AmenitiesPage.tsx' },
  { permissionKey: 'amenities.delete', moduleSlug: 'amenities', elementType: 'button', elementLabel: 'Delete Amenity', componentPath: 'pages/admin/amenities/AmenitiesPage.tsx' },
  // Sidebar
  { permissionKey: 'sidebar.amenities', moduleSlug: 'amenities', elementType: 'tab', elementLabel: 'Sidebar: Amenities', componentPath: 'components/layout/AdminSidebar.tsx' },
  // Amenity form fields
  { permissionKey: 'amenities.edit.name', moduleSlug: 'amenities', elementType: 'field', elementLabel: 'Amenity Name Field', componentPath: 'pages/admin/amenities/AmenitiesPage.tsx' },
  { permissionKey: 'amenities.edit.description', moduleSlug: 'amenities', elementType: 'field', elementLabel: 'Amenity Description Field', componentPath: 'pages/admin/amenities/AmenitiesPage.tsx' },
  { permissionKey: 'amenities.edit.icon', moduleSlug: 'amenities', elementType: 'field', elementLabel: 'Amenity Icon Field', componentPath: 'pages/admin/amenities/AmenitiesPage.tsx' },
  { permissionKey: 'amenities.edit.status', moduleSlug: 'amenities', elementType: 'field', elementLabel: 'Amenity Status Field', componentPath: 'pages/admin/amenities/AmenitiesPage.tsx' },

  // ==========================================================================
  // BANKS MODULE
  // ==========================================================================
  { permissionKey: 'banks.view', moduleSlug: 'banks', elementType: 'page', elementLabel: 'Banks Page', componentPath: 'pages/admin/banks/BanksPage.tsx' },
  { permissionKey: 'banks.create', moduleSlug: 'banks', elementType: 'button', elementLabel: 'Create Bank', componentPath: 'pages/admin/banks/BanksPage.tsx' },
  { permissionKey: 'banks.edit', moduleSlug: 'banks', elementType: 'button', elementLabel: 'Edit Bank', componentPath: 'pages/admin/banks/BanksPage.tsx' },
  { permissionKey: 'banks.delete', moduleSlug: 'banks', elementType: 'button', elementLabel: 'Delete Bank', componentPath: 'pages/admin/banks/BanksPage.tsx' },
  { permissionKey: 'bank-branches.view', moduleSlug: 'banks', elementType: 'page', elementLabel: 'Bank Branches Page', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'bank-branches.create', moduleSlug: 'banks', elementType: 'button', elementLabel: 'Create Bank Branch', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'bank-branches.edit', moduleSlug: 'banks', elementType: 'button', elementLabel: 'Edit Bank Branch', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'bank-branches.delete', moduleSlug: 'banks', elementType: 'button', elementLabel: 'Delete Bank Branch', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'sidebar.banks', moduleSlug: 'banks', elementType: 'tab', elementLabel: 'Sidebar: Banks', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.bank-branches', moduleSlug: 'banks', elementType: 'tab', elementLabel: 'Sidebar: Bank Branches', componentPath: 'components/layout/AdminSidebar.tsx' },
  // Bank form fields
  { permissionKey: 'banks.edit.name', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Bank Name Field', componentPath: 'pages/admin/banks/BanksPage.tsx' },
  { permissionKey: 'banks.edit.code', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Bank Code Field', componentPath: 'pages/admin/banks/BanksPage.tsx' },
  { permissionKey: 'banks.edit.status', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Bank Status Field', componentPath: 'pages/admin/banks/BanksPage.tsx' },
  // Bank branch form fields
  { permissionKey: 'bank-branches.edit.name', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Branch Name Field', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'bank-branches.edit.bank', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Branch Bank Field', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'bank-branches.edit.code', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Branch Code Field', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'bank-branches.edit.address', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Branch Address Field', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'bank-branches.edit.phone', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Branch Phone Field', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },
  { permissionKey: 'bank-branches.edit.status', moduleSlug: 'banks', elementType: 'field', elementLabel: 'Branch Status Field', componentPath: 'pages/admin/banks/BankBranchesPage.tsx' },

  // ==========================================================================
  // PRODUCT CATEGORIES MODULE
  // ==========================================================================
  { permissionKey: 'product-categories.view', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Product Categories Page', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  { permissionKey: 'product-categories.create', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Create Category', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  { permissionKey: 'product-categories.edit', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Edit Category', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  { permissionKey: 'product-categories.delete', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Delete Category', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  // Product category form fields
  { permissionKey: 'product-categories.edit.name', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Category Name Field', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  { permissionKey: 'product-categories.edit.description', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Category Description Field', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  { permissionKey: 'product-categories.edit.icon', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Category Icon Field', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  { permissionKey: 'product-categories.edit.parent-category', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Parent Category Field', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  { permissionKey: 'product-categories.edit.sort-order', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Category Sort Order Field', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },
  { permissionKey: 'product-categories.edit.status', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Category Status Field', componentPath: 'pages/admin/product-categories/ProductCategoriesPage.tsx' },

  // ==========================================================================
  // MARKETPLACE ADMIN MODULE
  // ==========================================================================
  { permissionKey: 'marketplace.admin.products', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Admin Products Page', componentPath: 'pages/admin/marketplace/ProductsPage.tsx' },
  { permissionKey: 'marketplace.admin.products.edit', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Edit Any Product', componentPath: 'pages/admin/marketplace/ProductsPage.tsx' },
  { permissionKey: 'marketplace.admin.products.delete', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Delete Any Product', componentPath: 'pages/admin/marketplace/ProductsPage.tsx' },
  { permissionKey: 'marketplace.admin.orders', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Admin Orders Page', componentPath: 'pages/admin/marketplace/OrdersPage.tsx' },
  { permissionKey: 'marketplace.admin.orders.moderate', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Moderate Orders', componentPath: 'pages/admin/marketplace/OrdersPage.tsx' },
  { permissionKey: 'marketplace.admin.sellers', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Admin Sellers Page', componentPath: 'pages/admin/marketplace/SellersPage.tsx' },
  { permissionKey: 'marketplace.admin.sellers.toggle', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Activate/Suspend Seller', componentPath: 'pages/admin/marketplace/SellersPage.tsx' },
  { permissionKey: 'marketplace.admin.sellers.is-verified', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Sellers Table: Verified Column', componentPath: 'pages/admin/marketplace/SellersPage.tsx' },
  { permissionKey: 'marketplace.admin.sellers.is-active', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Sellers Table: Active Column', componentPath: 'pages/admin/marketplace/SellersPage.tsx' },
  { permissionKey: 'marketplace.admin.upgrades', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Upgrade Requests Page', componentPath: 'pages/admin/marketplace/UpgradeRequestsPage.tsx' },
  { permissionKey: 'marketplace.admin.upgrades.approve', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Approve Upgrade', componentPath: 'pages/admin/marketplace/UpgradeRequestsPage.tsx' },
  { permissionKey: 'marketplace.admin.upgrades.reject', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Reject Upgrade', componentPath: 'pages/admin/marketplace/UpgradeRequestsPage.tsx' },
  { permissionKey: 'marketplace.admin.approvals', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Registration Approvals Page', componentPath: 'pages/admin/marketplace/AdminApprovalsPage.tsx' },
  { permissionKey: 'marketplace.admin.approvals.approve', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Approve Registration', componentPath: 'pages/admin/marketplace/AdminApprovalsPage.tsx' },
  { permissionKey: 'marketplace.admin.approvals.reject', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Reject Registration', componentPath: 'pages/admin/marketplace/AdminApprovalsPage.tsx' },
  { permissionKey: 'marketplace.admin.reviews', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Admin Reviews Page', componentPath: 'pages/admin/marketplace/ReviewsPage.tsx' },
  { permissionKey: 'marketplace.admin.reviews.delete', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Delete Review', componentPath: 'pages/admin/marketplace/ReviewsPage.tsx' },

  // Sidebar items
  { permissionKey: 'sidebar.marketplace-products', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Products', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.marketplace-orders', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Orders', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.marketplace-sellers', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Sellers', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.marketplace-approvals', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Registration Approvals', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.marketplace-reviews', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Reviews', componentPath: 'components/layout/AdminSidebar.tsx' },

  // ==========================================================================
  // BACKEND-ENFORCED PERMISSION KEYS
  // These guard backend routes via requirePermission() middleware.
  // ==========================================================================
  { permissionKey: 'marketplace.sell', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Sell Products' },
  { permissionKey: 'marketplace.player-products.manage', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Manage Player Products' },
  { permissionKey: 'marketplace.moderate', moduleSlug: 'marketplace', elementType: 'action', elementLabel: 'Moderate Marketplace' },
  { permissionKey: 'financial.withdraw', moduleSlug: 'financial', elementType: 'action', elementLabel: 'Withdraw from Wallet' },
  { permissionKey: 'financial.reconcile', moduleSlug: 'financial', elementType: 'action', elementLabel: 'Reconcile Payments' },
  { permissionKey: 'financial.process_payouts', moduleSlug: 'financial', elementType: 'action', elementLabel: 'Process Payouts' },
  { permissionKey: 'financial.view', moduleSlug: 'financial', elementType: 'action', elementLabel: 'View Financial Data' },
  { permissionKey: 'community.create_events', moduleSlug: 'community', elementType: 'action', elementLabel: 'Create Community Events' },
  { permissionKey: 'audit.revert', moduleSlug: 'audit', elementType: 'action', elementLabel: 'Revert Audit Actions' },
  { permissionKey: 'tournaments.manage_brackets', moduleSlug: 'tournaments', elementType: 'action', elementLabel: 'Manage Tournament Brackets' },
  { permissionKey: 'tournaments.enter_scores', moduleSlug: 'tournaments', elementType: 'action', elementLabel: 'Enter Match Scores' },
  { permissionKey: 'academies.create', moduleSlug: 'academies', elementType: 'action', elementLabel: 'Create Academy' },
  { permissionKey: 'academies.edit', moduleSlug: 'academies', elementType: 'action', elementLabel: 'Edit Academy' },
  { permissionKey: 'academies.evaluate', moduleSlug: 'academies', elementType: 'action', elementLabel: 'Evaluate Academy Students' },
  { permissionKey: 'coaches.manage_profile', moduleSlug: 'coaches', elementType: 'action', elementLabel: 'Manage Coach Profile' },
  { permissionKey: 'coaches.manage_agreements', moduleSlug: 'coaches', elementType: 'action', elementLabel: 'Manage Coach Agreements' },
  { permissionKey: 'coaches.create_sessions', moduleSlug: 'coaches', elementType: 'action', elementLabel: 'Create Coach Sessions' },

  // ==========================================================================
  // SUBSCRIPTION MODULE
  // ==========================================================================
  { permissionKey: 'subscription.create', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Create Plan', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.edit', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Edit Plan', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.edit.price-monthly', moduleSlug: 'subscription', elementType: 'field', elementLabel: 'Plan Monthly Price', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.edit.price-yearly', moduleSlug: 'subscription', elementType: 'field', elementLabel: 'Plan Annual Price', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.edit.is-unlimited', moduleSlug: 'subscription', elementType: 'field', elementLabel: 'Unlimited Plan Flag', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.edit.is-internal', moduleSlug: 'subscription', elementType: 'field', elementLabel: 'Internal Plan Flag', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.plans.billing-period-toggle', moduleSlug: 'subscription', elementType: 'action', elementLabel: 'Billing Period Toggle (Monthly/Annual)', componentPath: 'components/subscription/BillingPeriodToggle.tsx' },
  { permissionKey: 'subscription.delete', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Delete Plan', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.toggle', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Toggle Plan', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.assign', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Assign Plan', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.assignments.is-verified', moduleSlug: 'subscription', elementType: 'field', elementLabel: 'Subscription Assignments: Verified Column', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.assignments.is-active', moduleSlug: 'subscription', elementType: 'field', elementLabel: 'Subscription Assignments: Active Column', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.activate', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Activate Subscription', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.features.view', moduleSlug: 'subscription', elementType: 'page', elementLabel: 'Plan Features Section', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.features.edit', moduleSlug: 'subscription', elementType: 'section', elementLabel: 'Edit Plan Features', componentPath: 'pages/admin/subscription/SubscriptionPage.tsx' },
  { permissionKey: 'subscription.upgrade.request', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Request Plan Upgrade', componentPath: 'components/subscription/UpgradeRequestModal.tsx' },
  { permissionKey: 'subscription.upgrade.view', moduleSlug: 'subscription', elementType: 'page', elementLabel: 'View Upgrade Requests', componentPath: 'pages/admin/subscription/SubscriptionUpgradeRequestsPage.tsx' },
  { permissionKey: 'subscription.upgrade.approve', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Approve Upgrade', componentPath: 'pages/admin/subscription/SubscriptionUpgradeRequestsPage.tsx' },
  { permissionKey: 'subscription.upgrade.reject', moduleSlug: 'subscription', elementType: 'button', elementLabel: 'Reject Upgrade', componentPath: 'pages/admin/subscription/SubscriptionUpgradeRequestsPage.tsx' },
  { permissionKey: 'sidebar.subscription-upgrades', moduleSlug: 'subscription', elementType: 'tab', elementLabel: 'Sidebar: Upgrade Requests', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'subscription-plans.view', moduleSlug: 'subscription', elementType: 'page', elementLabel: 'Subscription Plan Detail Page', componentPath: 'pages/subscription/SubscriptionPlanDetailPage.tsx' },

  // ==========================================================================
  // MARKETPLACE SELLER ACTIONS
  // ==========================================================================
  { permissionKey: 'marketplace.seller.create-product', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Create Product', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'marketplace.seller.branch-select', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Branch Selection on Product Form/Filter', componentPath: 'components/marketplace/SellerProductFormModal.tsx' },
  { permissionKey: 'marketplace.seller.delete-product', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Delete Product', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'marketplace.seller.manage-orders', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Manage Orders', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'marketplace.seller.stats', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Seller Stats Tab', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'marketplace.seller.products-tab', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Seller Products Tab', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'marketplace.seller.orders-tab', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Seller Orders Tab', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'marketplace.seller.settings', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Seller Settings Tab', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'marketplace.seller.settlements', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'View Settlements', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'marketplace.seller.request-settlement', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Request Settlement', componentPath: 'pages/marketplace/SellerDashboardPage.tsx' },
  { permissionKey: 'sidebar.brands', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Brands', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'sidebar.tags', moduleSlug: 'marketplace', elementType: 'tab', elementLabel: 'Sidebar: Tags', componentPath: 'components/layout/AdminSidebar.tsx' },
  { permissionKey: 'org.settings.shipping-rates-tab', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Settings: Shipping Rates Tab', componentPath: 'pages/org/OrgSettingsPage.tsx' },
  { permissionKey: 'brands.create', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Create Brand', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'brands.edit', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Edit Brand', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'brands.edit.name', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Brand: Name Field', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'brands.edit.slug', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Brand: Slug Field', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'brands.edit.description', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Brand: Description Field', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'brands.edit.website', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Brand: Website Field', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'brands.edit.country', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Brand: Country Field', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'brands.edit.sort-order', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Brand: Sort Order Field', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'brands.edit.logo', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Brand: Logo Field', componentPath: 'pages/admin/brands/BrandsPage.tsx' },
  { permissionKey: 'tags.create', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Create Tag', componentPath: 'pages/admin/tags/TagsPage.tsx' },
  { permissionKey: 'tags.edit', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Edit Tag', componentPath: 'pages/admin/tags/TagsPage.tsx' },
  { permissionKey: 'tags.edit.name', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Tag: Name Field', componentPath: 'pages/admin/tags/TagsPage.tsx' },
  { permissionKey: 'tags.edit.slug', moduleSlug: 'marketplace', elementType: 'field', elementLabel: 'Tag: Slug Field', componentPath: 'pages/admin/tags/TagsPage.tsx' },
  { permissionKey: 'tags.delete', moduleSlug: 'marketplace', elementType: 'button', elementLabel: 'Delete Tag', componentPath: 'pages/admin/tags/TagsPage.tsx' },

  // ==========================================================================
  // ADMIN BOOKINGS & BRANCH ACCESS
  // ==========================================================================
  { permissionKey: 'admin.bookings.view', moduleSlug: 'bookings', elementType: 'page', elementLabel: 'Admin Bookings Page', componentPath: 'pages/admin/bookings/BookingsPage.tsx' },
  { permissionKey: 'admin.bookings.update-status', moduleSlug: 'bookings', elementType: 'action', elementLabel: 'Update Booking Status', componentPath: 'pages/admin/bookings/BookingsPage.tsx' },
  { permissionKey: 'admin.branch-access.view', moduleSlug: 'bookings', elementType: 'page', elementLabel: 'Admin Branch Access Page', componentPath: 'pages/admin/branch-access/BranchAccessPage.tsx' },
  { permissionKey: 'admin.branch-access.approve', moduleSlug: 'bookings', elementType: 'action', elementLabel: 'Approve Branch Access', componentPath: 'pages/admin/branch-access/BranchAccessPage.tsx' },
  { permissionKey: 'admin.branch-access.reject', moduleSlug: 'bookings', elementType: 'action', elementLabel: 'Reject Branch Access', componentPath: 'pages/admin/branch-access/BranchAccessPage.tsx' },

  // ==========================================================================
  // ORGANISATION MANAGEMENT (club-admin / shop-admin)
  // ==========================================================================
  { permissionKey: 'org.dashboard.view', moduleSlug: 'org', elementType: 'page', elementLabel: 'Organisation Dashboard', componentPath: 'pages/org/OrgDashboardPage.tsx' },
  { permissionKey: 'org.sidebar.dashboard', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Dashboard', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.bookings', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Bookings', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.branches', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Branches', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.resources', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Resources', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.marketplace', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Products', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.orders', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Orders', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.settings', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Settings', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.staff', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Staff', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.members', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Members', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.sidebar.coaches', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Coaches', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.members.manage', moduleSlug: 'org', elementType: 'page', elementLabel: 'Manage Facility Members', componentPath: 'pages/org/OrgMembersPage.tsx' },
  { permissionKey: 'org.staff.manage', moduleSlug: 'org', elementType: 'page', elementLabel: 'Manage Organisation Staff', componentPath: 'pages/org/OrgStaffPage.tsx' },
  { permissionKey: 'org.coaches.manage', moduleSlug: 'org', elementType: 'page', elementLabel: 'Manage Organisation Coaches', componentPath: 'pages/org/OrgCoachesPage.tsx' },
  { permissionKey: 'org.bookings.manage', moduleSlug: 'org', elementType: 'page', elementLabel: 'Manage Organisation Bookings', componentPath: 'pages/org/OrgBookingsPage.tsx' },
  { permissionKey: 'org.bookings.update-status', moduleSlug: 'org', elementType: 'action', elementLabel: 'Update Booking Status / Payment', componentPath: 'components/booking/BookingsTable.tsx' },
  { permissionKey: 'org.branches.manage', moduleSlug: 'org', elementType: 'page', elementLabel: 'Manage Organisation Branches', componentPath: 'pages/org/OrgBranchesPage.tsx' },
  { permissionKey: 'org.resources.manage', moduleSlug: 'org', elementType: 'page', elementLabel: 'Manage Organisation Resources', componentPath: 'pages/org/OrgResourcesPage.tsx' },
  { permissionKey: 'org.marketplace.manage', moduleSlug: 'org', elementType: 'page', elementLabel: 'Manage Organisation Marketplace', componentPath: 'pages/org/OrgMarketplacePage.tsx' },
  { permissionKey: 'org.settings.edit', moduleSlug: 'org', elementType: 'page', elementLabel: 'Edit Organisation Settings', componentPath: 'pages/org/OrgSettingsPage.tsx' },
  { permissionKey: 'notifications.view', moduleSlug: 'notifications', elementType: 'page', elementLabel: 'View Notifications', componentPath: 'pages/notifications/NotificationsPage.tsx' },
  { permissionKey: 'notifications.send', moduleSlug: 'notifications', elementType: 'action', elementLabel: 'Send Notifications (Admin)', componentPath: 'modules/notifications/presentation/notification.routes.ts' },
  { permissionKey: 'notifications.preferences', moduleSlug: 'notifications', elementType: 'page', elementLabel: 'Notification Preferences', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'notifications.broadcast', moduleSlug: 'notifications', elementType: 'page', elementLabel: 'Admin Broadcast Notifications', componentPath: 'pages/notifications/AdminBroadcastPage.tsx' },
  { permissionKey: 'notifications.analytics', moduleSlug: 'notifications', elementType: 'page', elementLabel: 'Notification Analytics', componentPath: 'pages/notifications/AdminAnalyticsPage.tsx' },
  { permissionKey: 'notifications.dead-letters', moduleSlug: 'notifications', elementType: 'page', elementLabel: 'Dead Letter Queue', componentPath: 'pages/notifications/AdminDeadLettersPage.tsx' },
  { permissionKey: 'notifications.templates', moduleSlug: 'notifications', elementType: 'page', elementLabel: 'Manage Notification Templates', componentPath: 'pages/notifications/AdminTemplatesPage.tsx' },
  { permissionKey: 'notifications.schedule', moduleSlug: 'notifications', elementType: 'action', elementLabel: 'Schedule Notifications', componentPath: 'pages/notifications/AdminBroadcastPage.tsx' },
  { permissionKey: 'bookings.apply', moduleSlug: 'bookings', elementType: 'button', elementLabel: 'Apply to Match', componentPath: 'pages/booking/MatchListPage.tsx' },

  // Profile Wallet tab
  { permissionKey: 'profile.wallet.view', moduleSlug: 'users', elementType: 'tab', elementLabel: 'Profile Wallet Tab', componentPath: 'pages/profile/ProfilePage.tsx' },

  // Profile Settings tab
  { permissionKey: 'profile.settings.view', moduleSlug: 'users', elementType: 'tab', elementLabel: 'Profile Settings Tab', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.settings.language', moduleSlug: 'users', elementType: 'field', elementLabel: 'Settings Language Field', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.settings.theme', moduleSlug: 'users', elementType: 'field', elementLabel: 'Settings Theme Field', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.settings.visibility', moduleSlug: 'users', elementType: 'field', elementLabel: 'Settings Profile Visibility Toggle', componentPath: 'pages/profile/ProfilePage.tsx' },
  { permissionKey: 'profile.settings.notifications', moduleSlug: 'users', elementType: 'section', elementLabel: 'Settings Notifications Section', componentPath: 'pages/profile/ProfilePage.tsx' },

  // Shipping rates

  { permissionKey: 'marketplace.seller.shipping-rates', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Seller Shipping Rates', componentPath: 'pages/org/OrgShippingRatesPage.tsx' },
  { permissionKey: 'marketplace.admin.shipping-rates', moduleSlug: 'marketplace', elementType: 'page', elementLabel: 'Admin Shipping Rates', componentPath: 'pages/admin/marketplace/AdminShippingRatesPage.tsx' },

  // Finance
  { permissionKey: 'org.sidebar.finance', moduleSlug: 'org', elementType: 'tab', elementLabel: 'Org Sidebar: Finance', componentPath: 'components/layout/OrgSidebar.tsx' },
  { permissionKey: 'org.finance.view', moduleSlug: 'org', elementType: 'page', elementLabel: 'Organisation Finance', componentPath: 'pages/org/OrgFinancePage.tsx' },

  // ==========================================================================
  // SETTLEMENTS MODULE
  // ==========================================================================
  { permissionKey: 'settlements.view', moduleSlug: 'settlements', elementType: 'page', elementLabel: 'View Settlements', componentPath: 'pages/admin/settlements/SettlementListPage.tsx' },
  { permissionKey: 'settlements.request', moduleSlug: 'settlements', elementType: 'button', elementLabel: 'Request Settlement', componentPath: 'pages/admin/settlements/SettlementListPage.tsx' },
  { permissionKey: 'settlements.approve', moduleSlug: 'settlements', elementType: 'button', elementLabel: 'Approve Settlement', componentPath: 'pages/admin/settlements/SettlementListPage.tsx' },
  { permissionKey: 'settlements.pay', moduleSlug: 'settlements', elementType: 'button', elementLabel: 'Mark Settlement Paid', componentPath: 'pages/admin/settlements/SettlementListPage.tsx' },
  { permissionKey: 'settlements.complete', moduleSlug: 'settlements', elementType: 'button', elementLabel: 'Complete Settlement', componentPath: 'pages/admin/settlements/SettlementListPage.tsx' },
  { permissionKey: 'settlements.reject', moduleSlug: 'settlements', elementType: 'button', elementLabel: 'Reject Settlement', componentPath: 'pages/admin/settlements/SettlementListPage.tsx' },
  { permissionKey: 'settlements.cancel', moduleSlug: 'settlements', elementType: 'button', elementLabel: 'Cancel Settlement', componentPath: 'pages/admin/settlements/SettlementListPage.tsx' },
];

export const uiPermissionMap = new Map(uiRegistry.map(e => [e.permissionKey, e]));
