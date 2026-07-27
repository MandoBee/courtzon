-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  name            VARCHAR(200) NOT NULL,
  parent_id       INT UNSIGNED DEFAULT NULL,
  head_employee_id INT UNSIGNED DEFAULT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_org (organisation_id),
  KEY idx_parent (parent_id),
  CONSTRAINT fk_dept_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_dept_parent FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Positions
CREATE TABLE IF NOT EXISTS positions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED NOT NULL,
  department_id   INT UNSIGNED DEFAULT NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_org (organisation_id),
  KEY idx_dept (department_id),
  CONSTRAINT fk_pos_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_pos_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Employees (extends users with HR-specific data)
CREATE TABLE IF NOT EXISTS employees (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  organisation_id   INT UNSIGNED NOT NULL,
  department_id     INT UNSIGNED DEFAULT NULL,
  position_id       INT UNSIGNED DEFAULT NULL,
  employee_code     VARCHAR(50) DEFAULT NULL,
  employment_status ENUM('draft','onboarding','active','on_leave','suspended','terminated','archived') NOT NULL DEFAULT 'draft',
  hire_date         DATE DEFAULT NULL,
  termination_date  DATE DEFAULT NULL,
  termination_reason VARCHAR(500) DEFAULT NULL,
  reports_to        INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_org (user_id, organisation_id),
  KEY idx_org (organisation_id),
  KEY idx_dept (department_id),
  KEY idx_status (employment_status),
  CONSTRAINT fk_emp_user   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_emp_org    FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_emp_dept   FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_pos    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
  CONSTRAINT fk_emp_reports FOREIGN KEY (reports_to) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Employment Contracts
CREATE TABLE IF NOT EXISTS employment_contracts (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id       INT UNSIGNED NOT NULL,
  contract_type     ENUM('permanent','fixed_term','probation','internship','freelance') NOT NULL DEFAULT 'permanent',
  start_date        DATE NOT NULL,
  end_date          DATE DEFAULT NULL,
  salary_amount     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  currency          CHAR(3) NOT NULL DEFAULT 'USD',
  payment_frequency ENUM('monthly','biweekly','weekly','daily','hourly') NOT NULL DEFAULT 'monthly',
  status            ENUM('draft','active','expired','terminated') NOT NULL DEFAULT 'draft',
  document_url      VARCHAR(500) DEFAULT NULL,
  notes             TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_employee (employee_id),
  CONSTRAINT fk_ec_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leave Types (configurable)
CREATE TABLE IF NOT EXISTS leave_types (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id   INT UNSIGNED NOT NULL,
  name              VARCHAR(200) NOT NULL,
  default_days      DECIMAL(5,1) NOT NULL DEFAULT 0,
  is_paid           TINYINT(1) NOT NULL DEFAULT 1,
  requires_approval TINYINT(1) NOT NULL DEFAULT 1,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_org (organisation_id),
  CONSTRAINT fk_lt_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id       INT UNSIGNED NOT NULL,
  leave_type_id     INT UNSIGNED NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  duration_days     DECIMAL(5,1) NOT NULL,
  reason            TEXT,
  status            ENUM('draft','submitted','approved','rejected','cancelled','completed') NOT NULL DEFAULT 'draft',
  approved_by       INT UNSIGNED DEFAULT NULL,
  approved_at       TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_employee (employee_id),
  KEY idx_status (status),
  CONSTRAINT fk_lr_emp   FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_lr_type  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  CONSTRAINT fk_lr_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Leave Balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id       INT UNSIGNED NOT NULL,
  leave_type_id     INT UNSIGNED NOT NULL,
  total_days        DECIMAL(5,1) NOT NULL DEFAULT 0,
  used_days         DECIMAL(5,1) NOT NULL DEFAULT 0,
  pending_days      DECIMAL(5,1) NOT NULL DEFAULT 0,
  year              INT UNSIGNED NOT NULL,
  UNIQUE KEY uk_emp_type_year (employee_id, leave_type_id, year),
  CONSTRAINT fk_lb_emp  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_lb_type FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff Attendance
CREATE TABLE IF NOT EXISTS staff_attendance (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id       INT UNSIGNED NOT NULL,
  attendance_date   DATE NOT NULL,
  clock_in          TIME DEFAULT NULL,
  clock_out         TIME DEFAULT NULL,
  status            ENUM('present','absent','late','early_leave','excused') NOT NULL DEFAULT 'present',
  notes             TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_emp_date (employee_id, attendance_date),
  KEY idx_date (attendance_date),
  CONSTRAINT fk_sa_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payroll Components (configurable)
CREATE TABLE IF NOT EXISTS payroll_components (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id   INT UNSIGNED NOT NULL,
  name              VARCHAR(200) NOT NULL,
  type              ENUM('earning','deduction') NOT NULL,
  calculation_type  ENUM('fixed','percentage','formula') NOT NULL DEFAULT 'fixed',
  default_amount    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_org (organisation_id),
  CONSTRAINT fk_pc_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payroll Runs
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id   INT UNSIGNED NOT NULL,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  status            ENUM('draft','calculated','approved','posted','paid','closed') NOT NULL DEFAULT 'draft',
  total_gross       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_deductions  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_net         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  posted_at         TIMESTAMP NULL DEFAULT NULL,
  posted_by         INT UNSIGNED DEFAULT NULL,
  paid_at           TIMESTAMP NULL DEFAULT NULL,
  created_by        INT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_org (organisation_id),
  KEY idx_status (status),
  CONSTRAINT fk_pr_org     FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_pr_poster  FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_entries (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_run_id    INT UNSIGNED NOT NULL,
  employee_id       INT UNSIGNED NOT NULL,
  base_salary       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_earnings    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total_deductions  DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  net_pay           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  component_breakdown JSON DEFAULT NULL,
  KEY idx_run (payroll_run_id),
  KEY idx_employee (employee_id),
  CONSTRAINT fk_pe_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
