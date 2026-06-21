/** Shared admin list / lookup shapes used across multiple pages. */

export interface IdName {
  id: number;
  name: string;
}

export interface Country extends IdName {
  iso_code: string;
  is_active: boolean;
}

export interface OrganisationType {
  id: number;
  slug: string;
  name?: string | null;
}

export interface OrganisationSummary extends IdName {
  slug: string;
  org_type_id?: number;
  org_type_slug?: string | null;
  is_active?: boolean;
  is_verified?: boolean;
  country_id?: number;
  country_iso?: string | null;
  country_name?: string | null;
  logo_url?: string | null;
  rating_avg?: number | null;
}

export interface BranchSummary extends IdName {
  organisation_id?: number;
  city?: string | null;
  is_active?: boolean;
}

export interface ResourceSummary extends IdName {
  branch_id: number;
  resource_type_id: number;
  is_active?: boolean;
  hourly_price?: number | string | null;
}

export interface SportOption extends IdName {
  slug?: string;
}

export interface AmenityOption extends IdName {
  slug?: string;
  is_active?: boolean;
}

export interface ProvinceOption extends IdName {
  is_active?: boolean;
}

export interface CityOption extends IdName {
  is_active?: boolean;
}

export interface BankOption extends IdName {
  is_active?: boolean;
}
