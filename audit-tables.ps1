$ErrorActionPreference = 'Stop'
$startTime = Get-Date

# ---- Configuration ----
$srcDir = "C:\Users\mniaz\Desktop\CourtZon-V2\backend\src"
$outFile = "C:\Users\mniaz\Desktop\CourtZon-V2\docs\database\audit-backend-usage.tsv"

# ---- All 274 table names ----
$tables = @(
"academies", "academy_attendance", "academy_curriculums", "academy_enrollments", "academy_evaluations",
"academy_group_sessions", "academy_groups", "academy_programs", "academy_session_attendance", "academy_sessions",
"accounting_periods", "activity_logs", "ad_campaigns", "ad_clicks", "ad_creatives", "ad_impressions", "ad_placements",
"ad_pricing", "ad_targeting_rules", "amenities", "announcement_comments", "announcement_likes", "announcements",
"api_keys", "app_settings", "app_versions", "application_settings_history", "audit_logs", "bank_branches", "banks",
"booking_cancellations", "booking_intents", "booking_invitations", "booking_matchmaking_requests", "booking_participants",
"booking_slots", "bookings", "branch_amenity_assignments", "branch_financial_details", "branch_player_access",
"branch_unavailability", "branches", "brands", "cancellation_policies", "cart_items", "chart_of_accounts", "cities",
"client_error_reports", "cms_blogs", "cms_contact_submission_attachments", "cms_contact_submissions", "cms_media",
"cms_pages", "cms_section_blocks", "cms_sections", "coach_availability", "coach_availability_blackouts",
"coach_org_agreements", "coach_profiles", "coach_reviews", "coach_session_events", "coach_sessions", "commission_rules",
"communication_log", "community_event_participants", "community_events", "community_tournaments",
"conversation_participants", "conversations", "countries", "coupon_assignments", "coupon_usage", "coupons", "cron_jobs",
"currencies", "customer_segments", "dead_letter_entries", "departments", "design_theme_reset_baseline",
"design_token_versions", "design_tokens", "elo_ratings", "email_verification_tokens", "employees", "employment_contracts",
"exchange_rates", "feature_flags", "financial_journal_entries", "general_ledger", "group_invitations", "holidays",
"inventory_logs", "invitations", "invoice_items", "invoices", "join_requests", "kpi_snapshots", "languages", "leads",
"league_divisions", "league_matches", "league_results", "league_standings", "league_teams", "leagues", "leave_balances",
"leave_requests", "leave_types", "ledger_entries", "loyalty_campaigns", "loyalty_points", "marketing_campaigns",
"marketplace_ledger_entries", "match_participants", "match_sessions", "matches", "media_uploads", "membership_benefits",
"membership_history", "membership_plans", "memberships", "messages", "migration_history", "notification_ab_results",
"notification_ab_tests", "notification_actions", "notification_alerts", "notification_analytics", "notification_audit_trail",
"notification_broadcasts", "notification_categories", "notification_cleanup_policies", "notification_dead_letter_queue",
"notification_delivery", "notification_digest_windows", "notification_feature_flags", "notification_providers",
"notification_queue", "notification_rate_limits", "notification_replay_log", "notification_template_versions",
"notification_templates", "notification_types", "notification_webhooks", "notifications", "operating_hours", "order_items",
"order_status_history", "orders", "org_announcements", "organisation_attribute_values", "organisation_subscriptions",
"organisation_type_attributes", "organisation_types", "organisation_upgrade_requests", "organisations", "outbox_cursors",
"password_reset_tokens", "payment_gateway_config", "payment_methods", "payment_transactions", "payroll_components",
"payroll_entries", "payroll_runs", "peak_hour_pricing", "permission_modules", "permissions", "platform_accounts",
"player_levels", "player_profiles", "player_ratings", "player_sport_interests", "player_statistics", "positions",
"pricing_rules", "pricing_seasons", "processed_commands", "processed_events", "product_categories", "product_images",
"product_reviews", "product_specifications", "product_tags", "product_variants", "products", "provinces",
"public_match_details", "published_events", "purchase_order_items", "purchase_orders", "push_log", "push_tokens",
"related_products", "resource_attribute_values", "resource_maintenance", "resource_peak_hours", "resource_type_attributes",
"resource_types", "resource_unavailability", "resources", "revert_logs", "reward_catalog", "reward_claims",
"role_permissions", "role_theme_overrides", "roles", "scheduled_jobs", "seasons", "segment_members", "seller_profiles",
"seller_shipping_rates", "settlement_batches", "settlement_orders", "settlement_transfers", "settlements", "sidebar_layout",
"sport_positions", "sports", "staff_attendance", "stock_transfers", "subscription_features", "subscription_plan_features",
"subscription_plan_rates", "subscription_plans", "suppliers", "support_ticket_messages", "support_tickets",
"system_settings", "tags", "tax_rates", "team_statistics", "tournament_bracket_types", "tournament_group_members",
"tournament_groups", "tournament_match_players", "tournament_match_results", "tournament_match_scores",
"tournament_matches", "tournament_participants", "tournament_registrations", "tournament_standings", "tournaments",
"transaction_entries", "transactions", "translation_keys", "translations", "uploads", "user_addresses", "user_branches",
"user_channel_preferences", "user_devices", "user_follows", "user_friends", "user_memberships",
"user_notification_preferences", "user_organisations", "user_quiet_hours", "user_role_scopes", "user_roles", "user_sessions",
"user_wallets", "users", "waiting_list", "wallet_transactions", "warehouses", "web_vitals_metrics", "wishlist_items",
"withdrawal_requests", "workflow_branch_instances", "workflow_definitions", "workflow_event_subscriptions",
"workflow_events", "workflow_instances", "workflow_steps"
)

Write-Host "Collecting all .ts files from $srcDir ..." -ForegroundColor Cyan
$allFiles = Get-ChildItem -Path $srcDir -Recurse -Filter "*.ts" -File | Select-Object -ExpandProperty FullName
Write-Host "  Found $($allFiles.Count) .ts files" -ForegroundColor Green

# Categorize files by type
$repoFiles = $allFiles | Where-Object { $_ -match '\.repository\.ts$' }
$serviceFiles = $allFiles | Where-Object { $_ -match '\.service\.ts$' }
$workerFiles = $allFiles | Where-Object { $_ -match '\.worker\.ts$' }
Write-Host "  $($repoFiles.Count) repo files, $($serviceFiles.Count) service files, $($workerFiles.Count) worker files" -ForegroundColor Green

# Build a list of all route files (basename without extension, normalized)
$routeFiles = Get-ChildItem -Path $srcDir -Recurse -Filter "*.routes.ts" -File | Select-Object -ExpandProperty Name
$routeBases = @()
foreach ($rf in $routeFiles) {
    # Remove .routes.ts suffix -> e.g. "booking.routes.ts" -> "booking"
    $base = $rf -replace '\.routes\.ts$', ''
    $base = $base -replace '\.', '_'  # normalize dots to underscores
    $routeBases += $base
    # Also add plural variations
    if ($base -notmatch 's$') { $routeBases += $base + 's' }
    if ($base -match 'ys$') { $routeBases += $base -replace 'ys$', 'y' }
}
$routeBases = $routeBases | Select-Object -Unique

# Build a lookup: for each route base, list the table names it might cover
# We'll do a simple heuristic: if the route name is contained in the table name (as a prefix like booking_*)
# or if the table name is the route name

function Test-ApiRoute {
    param([string]$tableName)
    # Direct match
    if ($routeBases -contains $tableName) { return $true }
    # Prefix match: e.g. route "booking" covers "bookings", "booking_slots", etc.
    $prefix = $tableName -replace '_.*$', ''  # e.g. "booking_slots" -> "booking"
    if ($routeBases -contains $prefix) { return $true }
    # Plural match: e.g. route "booking" covers "bookings"
    $singular = $tableName -replace 's$', ''
    if ($routeBases -contains $singular) { return $true }
    # Check if table name matches a route file name (back-and-forth)
    foreach ($rb in $routeBases) {
        if ($tableName -eq $rb -or $tableName -eq "$rb" -or $tableName -like "$rb*") { return $true }
    }
    # Manual mapping for known patterns
    $manualMap = @{
        'notification_templates' = 'notification-type'
        'notification_types' = 'notification-type'
        'notification_delivery' = 'notification'
        'notification_broadcasts' = 'notification'
        'notification_analytics' = 'notification'
        'notification_queue' = 'notification'
        'notification_rate_limits' = 'notification'
        'notification_providers' = 'notification'
        'notification_webhooks' = 'notification'
        'notification_audit_trail' = 'notification'
        'notification_feature_flags' = 'notification'
        'notification_cleanup_policies' = 'notification'
        'notification_replay_log' = 'notification'
        'notification_dead_letter_queue' = 'notification'
        'notification_ab_tests' = 'notification'
        'notification_ab_results' = 'notification'
        'notification_template_versions' = 'template-management'
        'notification_categories' = 'notification'
        'notification_digest_windows' = 'notification'
        'notification_actions' = 'notification'
        'notification_alerts' = 'notification'
        'user_notification_preferences' = 'communication-preference'
        'user_devices' = 'communication-preference'
        'user_channel_preferences' = 'communication-preference'
        'user_quiet_hours' = 'communication-preference'
        'user_wallets' = 'wallet'
        'wallet_transactions' = 'wallet'
        'withdrawal_requests' = 'wallet'
        'organisation_types' = 'organisation'
        'organisation_type_attributes' = 'organisation'
        'organisation_attribute_values' = 'organisation'
        'organisation_subscriptions' = 'organisation'
        'organisation_upgrade_requests' = 'organisation'
        'user_organisations' = 'organisation'
        'branches' = 'organisation'
        'branch_financial_details' = 'organisation'
        'branch_amenity_assignments' = 'organisation'
        'branch_player_access' = 'organisation'
        'branch_unavailability' = 'organisation'
        'resources' = 'organisation'
        'resource_types' = 'organisation'
        'resource_type_attributes' = 'organisation'
        'resource_attribute_values' = 'organisation'
        'resource_maintenance' = 'organisation'
        'resource_peak_hours' = 'organisation'
        'resource_unavailability' = 'organisation'
        'cancellation_policies' = 'organisation'
        'user_roles' = 'rbac'
        'user_role_scopes' = 'rbac'
        'role_permissions' = 'rbac'
        'permissions' = 'rbac'
        'permission_modules' = 'rbac'
        'roles' = 'rbac'
        'product_categories' = 'admin-categories'
        'brands' = 'admin-brand'
        'tags' = 'admin-tag'
        'products' = 'marketplace'
        'product_images' = 'marketplace'
        'product_variants' = 'marketplace'
        'product_reviews' = 'marketplace'
        'product_specifications' = 'marketplace'
        'product_tags' = 'marketplace'
        'related_products' = 'marketplace'
        'cart_items' = 'marketplace'
        'orders' = 'marketplace'
        'order_items' = 'marketplace'
        'order_status_history' = 'marketplace'
        'wishlist_items' = 'marketplace'
        'inventory_logs' = 'inventory'
        'stock_transfers' = 'inventory'
        'suppliers' = 'inventory'
        'warehouses' = 'inventory'
        'purchase_orders' = 'inventory'
        'purchase_order_items' = 'inventory'
        'seller_profiles' = 'marketplace'
        'seller_shipping_rates' = 'marketplace'
        'marketplace_ledger_entries' = 'marketplace'
        'user_addresses' = 'marketplace'
        'membership_plans' = 'membership'
        'membership_benefits' = 'membership'
        'memberships' = 'membership'
        'user_memberships' = 'membership'
        'membership_history' = 'membership'
        'match_participants' = 'match'
        'match_sessions' = 'match'
        'matches' = 'match'
        'waiting_list' = 'match'
        'join_requests' = 'match'
        'invitations' = 'match'
        'player_statistics' = 'match'
        'player_ratings' = 'match'
        'elo_ratings' = 'match'
        'public_match_details' = 'match'
        'team_statistics' = 'match'
        'session' = 'match'
        'tournaments' = 'tournament'
        'tournament_participants' = 'tournament'
        'tournament_registrations' = 'tournament'
        'tournament_matches' = 'tournament'
        'tournament_match_players' = 'tournament'
        'tournament_match_results' = 'tournament'
        'tournament_match_scores' = 'tournament'
        'tournament_standings' = 'tournament'
        'tournament_groups' = 'tournament'
        'tournament_group_members' = 'tournament'
        'tournament_bracket_types' = 'tournament'
        'leagues' = 'league'
        'league_divisions' = 'league'
        'league_teams' = 'league'
        'league_matches' = 'league'
        'league_results' = 'league'
        'league_standings' = 'league'
        'seasons' = 'season'
        'player_profiles' = 'player-experience'
        'player_levels' = 'player-experience'
        'player_sport_interests' = 'player-experience'
        'sport_positions' = 'sports-engine'
        'positions' = 'player-experience'
        'booking_slots' = 'booking'
        'booking_participants' = 'booking'
        'booking_cancellations' = 'booking'
        'booking_invitations' = 'booking'
        'booking_intents' = 'booking'
        'booking_matchmaking_requests' = 'booking'
        'coach_profiles' = 'coaches'
        'coach_sessions' = 'coaches'
        'coach_session_events' = 'coaches'
        'coach_reviews' = 'coaches'
        'coach_availability' = 'coaches'
        'coach_availability_blackouts' = 'coaches'
        'coach_org_agreements' = 'coaches'
        'academy_programs' = 'academy'
        'academy_groups' = 'academy'
        'academy_group_sessions' = 'academy'
        'academy_enrollments' = 'academy'
        'academy_sessions' = 'academy'
        'academy_session_attendance' = 'academy'
        'academy_attendance' = 'academy'
        'academy_curriculums' = 'academy'
        'academy_evaluations' = 'academy'
        'cms_pages' = 'cms'
        'cms_sections' = 'cms'
        'cms_section_blocks' = 'cms'
        'cms_media' = 'cms'
        'cms_blogs' = 'cms'
        'cms_contact_submissions' = 'cms'
        'cms_contact_submission_attachments' = 'cms'
        'upload' = 'upload'
        'media_uploads' = 'upload'
        'uploads' = 'upload'
        'coupons' = 'coupon'
        'coupon_assignments' = 'coupon'
        'coupon_usage' = 'coupon'
        'activity_logs' = 'activities'
        'audit_logs' = 'audit-log'
        'app_settings' = 'app-settings'
        'app_versions' = 'app-settings'
        'application_settings_history' = 'app-settings'
        'countries' = 'countries'
        'cities' = 'cities'
        'provinces' = 'provinces'
        'currencies' = 'currencies'
        'languages' = 'languages'
        'banks' = 'banks'
        'bank_branches' = 'banks'
        'amenities' = 'amenities'
        'translations' = 'translations'
        'translation_keys' = 'translations'
        'design_tokens' = 'design-tokens'
        'design_token_versions' = 'design-tokens'
        'design_theme_reset_baseline' = 'design-tokens'
        'sidebar_layout' = 'sidebar-layout'
        'pricing_rules' = 'pricing'
        'pricing_seasons' = 'pricing'
        'peak_hour_pricing' = 'pricing'
        'tax_rates' = 'pricing'
        'commission_rules' = 'pricing'
        'settlements' = 'settlement'
        'settlement_batches' = 'settlement'
        'settlement_orders' = 'settlement'
        'settlement_transfers' = 'settlement'
        'payment_gateway_config' = 'payment'
        'payment_methods' = 'payment'
        'payment_transactions' = 'payment'
        'transactions' = 'transaction'
        'transaction_entries' = 'transaction'
        'ledger_entries' = 'ledger'
        'general_ledger' = 'ledger'
        'chart_of_accounts' = 'ledger'
        'financial_journal_entries' = 'ledger'
        'accounting_periods' = 'accounting'
        'feature_flags' = 'feature-flags'
        'api_keys' = 'integration'
        'support_tickets' = 'support'
        'support_ticket_messages' = 'support'
        'employees' = 'hr'
        'departments' = 'hr'
        'employment_contracts' = 'hr'
        'payroll_runs' = 'hr'
        'payroll_components' = 'hr'
        'payroll_entries' = 'hr'
        'leave_types' = 'hr'
        'leave_balances' = 'hr'
        'leave_requests' = 'hr'
        'staff_attendance' = 'hr'
        'holidays' = 'hr'
        'sports' = 'sports-engine'
        'sport_positions' = 'sports-engine'
        'operating_hours' = 'scheduling'
        'scheduled_jobs' = 'admin'
        'cron_jobs' = 'admin'
        'system_settings' = 'admin'
        'leads' = 'crm'
        'marketing_campaigns' = 'crm'
        'customer_segments' = 'crm'
        'segment_members' = 'crm'
        'loyalty_points' = 'crm'
        'loyalty_campaigns' = 'crm'
        'reward_catalog' = 'crm'
        'reward_claims' = 'crm'
        'kpi_snapshots' = 'bi'
        'client_error_reports' = 'admin'
        'web_vitals_metrics' = 'admin'
        'notifications' = 'notification'
        'user_sessions' = 'auth'
        'password_reset_tokens' = 'auth'
        'email_verification_tokens' = 'auth'
        'users' = 'auth'
        'processed_commands' = 'command'
        'published_events' = 'event-store'
        'processed_events' = 'event-bus'
        'dead_letter_entries' = 'dead-letter'
        'workflow_definitions' = 'workflow'
        'workflow_instances' = 'workflow'
        'workflow_steps' = 'workflow'
        'workflow_events' = 'workflow'
        'workflow_event_subscriptions' = 'workflow'
        'workflow_branch_instances' = 'workflow'
        'community_events' = 'community'
        'community_event_participants' = 'community'
        'community_tournaments' = 'community'
        'conversations' = 'community'
        'conversation_participants' = 'community'
        'messages' = 'community'
        'user_follows' = 'community'
        'user_friends' = 'community'
        'announcements' = 'community'
        'announcement_comments' = 'community'
        'announcement_likes' = 'community'
        'org_announcements' = 'organisation'
        'group_invitations' = 'community'
        'ad_campaigns' = 'community'
        'ad_placements' = 'community'
        'ad_creatives' = 'community'
        'ad_clicks' = 'community'
        'ad_impressions' = 'community'
        'ad_pricing' = 'community'
        'ad_targeting_rules' = 'community'
    }
    if ($manualMap.ContainsKey($tableName)) {
        $mapped = $manualMap[$tableName]
        foreach ($rf in $routeFiles) {
            $base = $rf -replace '\.routes\.ts$', ''
            if ($base -eq $mapped) { return $true }
        }
    }
    return $false
}

# Build regex alternation for all table names (escaped for regex)
# We'll search for SQL context: FROM|JOIN|INTO|UPDATE|DELETE FROM|REFERENCES followed by optional backtick then tablename
$tablePatterns = @()
foreach ($t in $tables) {
    $tablePatterns += [regex]::Escape($t)
}
$tableAlt = ($tablePatterns -join '|')

# Full regex: SQL keyword + optional backtick/quotes + table name + optional backtick
# We need to match: (FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|REFERENCES)\s+`?table_name`?
# But also handle table_name surrounded by backticks in other contexts
$sqlRegex = "(?i)(?:(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|REFERENCES|TABLE|TEMPORARY\s+TABLE|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE|INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO|ON\s+DUPLICATE\s+KEY|FOREIGN\s+KEY\s+REFERENCES|REFERENCES)\s+[`'""]?(?:$tableAlt)[`'""]?)"

Write-Host "`nSearching for SQL table references across $($allFiles.Count) files..." -ForegroundColor Cyan

# Process in batches to avoid memory issues
$batchSize = 50
$numTables = $tables.Count
$results = @{}

for ($i = 0; $i -lt $numTables; $i += $batchSize) {
    $end = [Math]::Min($i + $batchSize, $numTables)
    $batch = $tables[$i..($end-1)]
    $batchPatterns = @()
    foreach ($t in $batch) {
        $batchPatterns += [regex]::Escape($t)
    }
    $batchAlt = ($batchPatterns -join '|')
    $batchSqlRegex = "(?i)(?:(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|REFERENCES|TABLE|TEMPORARY\s+TABLE|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE|INSERT\s+(?:IGNORE\s+)?INTO|REPLACE\s+INTO|ON\s+DUPLICATE\s+KEY|FOREIGN\s+KEY\s+REFERENCES|REFERENCES)\s+[`'""]?(?:$batchAlt)[`'""]?)"
    
    $batchResults = Select-String -Path $allFiles -Pattern $batchSqlRegex -CaseSensitive:$false -SimpleMatch:$false | Group-Object { $_.Pattern } | ForEach-Object {
        $pattern = $_.Name
        $matchingFiles = $_.Group | Select-Object -ExpandProperty Path -Unique
        # Determine which table name matched in this pattern
        foreach ($tbl in $batch) {
            $escaped = [regex]::Escape($tbl)
            if ($pattern -match $escaped) {
                $key = $tbl
                if (-not $results.ContainsKey($key)) {
                    $results[$key] = @{
                        Files = @()
                    }
                }
                $results[$key].Files += $matchingFiles | Where-Object { $results[$key].Files -notcontains $_ }
            }
        }
    }
    
    $pct = [Math]::Round(($end / $numTables) * 100)
    Write-Host "  Progress: $end / $numTables ($pct%)" -ForegroundColor Yellow
}

# Now, for each table that wasn't found in batch search, do a targeted check
$notFound = @()
foreach ($t in $tables) {
    if (-not $results.ContainsKey($t)) {
        $notFound += $t
    }
}

# For not-found tables, do direct search to confirm zero matches
foreach ($t in $notFound) {
    $escaped = [regex]::Escape($t)
    $regex = "(?i)(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|REFERENCES)\s+[`'""]?$escaped[`'""]?"
    $matches = Select-String -Path $allFiles -Pattern $regex -CaseSensitive:$false -SimpleMatch:$false | Select-Object -ExpandProperty Path -Unique
    if ($matches) {
        $results[$t] = @{ Files = @($matches) }
    } else {
        # No matches found
        $results[$t] = @{ Files = @() }
    }
}

Write-Host "`nWriting results to $outFile ..." -ForegroundColor Cyan

# Create TSV header
$header = "table_name`tbackend_refs`trepo_files`tservice_files`tworker_files`thas_api_route"
$lines = @($header)

foreach ($t in $tables) {
    $info = $results[$t]
    if (-not $info) { $info = @{ Files = @() } }
    
    $files = $info.Files
    $backendRefs = $files.Count
    
    $repoCount = @($files | Where-Object { $_ -match '\.repository\.ts$' }).Count
    $serviceCount = @($files | Where-Object { $_ -match '\.service\.ts$' }).Count
    $workerCount = @($files | Where-Object { $_ -match '\.worker\.ts$' }).Count
    $hasRoute = if (Test-ApiRoute -tableName $t) { "YES" } else { "NO" }
    
    $line = "$t`t$backendRefs`t$repoCount`t$serviceCount`t$workerCount`t$hasRoute"
    $lines += $line
}

$lines -join "`r`n" | Set-Content -Path $outFile -Encoding UTF8

$elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
Write-Host "`nDone! Elapsed: $elapsed seconds" -ForegroundColor Green
Write-Host "Output: $outFile" -ForegroundColor Green
Write-Host "Total tables with refs: $($results.Values | Where-Object { $_.Files.Count -gt 0 } | Measure-Object | Select-Object -ExpandProperty Count)" -ForegroundColor Green
