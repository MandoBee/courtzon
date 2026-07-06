import { userRepository } from '../infrastructure/repositories/user.repository.js';
import { sessionRepository } from '../infrastructure/repositories/session.repository.js';
import { DeviceRepository } from '../infrastructure/repositories/device.repository.js';
import { hashPassword, verifyPassword } from '../../../shared/utils/password.js';
import { generateSessionToken, generateRefreshToken, generateUUID, hashToken } from '../../../shared/utils/token.js';
import { randomBytes } from 'node:crypto';
import { getPool } from '../../../database/mysql.js';
import { queueService } from '../../../infrastructure/queue/queue.service.js';
import { rbacRepository } from '../../rbac/infrastructure/repositories/rbac.repository.js';
import {
  InvalidCredentialsError,
  PhoneAlreadyRegisteredError,
  EmailAlreadyRegisteredError,
  InvalidRefreshTokenError,
  SessionExpiredError,
  AccountNotActiveError,
} from '../domain/auth.errors.js';
import type { RegisterInput, LoginInput, AuthResponse, CheckUniquenessInput, PlayerRegisterInput, SellerRegisterInput, OrganizationRegisterInput } from '../presentation/auth.dto.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import { sanitizeUploadUrl } from '../../../shared/utils/upload-url.util.js';
import {
  isExcludedOrgRegistrationType,
  isInternalSubscriptionPlan,
  isOrganizationRegistrationPlan,
} from '../../../shared/constants/org-registration.js';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const deviceRepository = new DeviceRepository();

export class AuthService {
  async register(input: RegisterInput, meta: { ip: string; userAgent?: string; deviceFingerprint?: string }): Promise<AuthResponse> {
    const countryPhoneCode = input.countryCode || await userRepository.getCountryPhoneCode(input.countryId);
    if (!countryPhoneCode) {
      throw new Error(`Country ${input.countryId} not found or has no phone code`);
    }
    const fullPhone = `${countryPhoneCode}${input.phoneNumber}`;

    const existingPhone = await userRepository.findByPhone(fullPhone);
    if (existingPhone) {
      throw new PhoneAlreadyRegisteredError();
    }
    const existingEmail = await userRepository.findByEmail(input.email);
    if (existingEmail) {
      throw new EmailAlreadyRegisteredError();
    }

    const publicId = generateUUID();
    const passwordHash = hashPassword(input.password);
    let userId: number;
    try {
      userId = await userRepository.create({
        publicId,
        countryId: input.countryId,
        phoneNumber: input.phoneNumber,
        fullPhone,
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        gender: input.gender,
        birthDate: input.birthDate || null,
        languageId: input.languageId || null,
        timezone: input.timezone || 'UTC',
        darkMode: input.darkMode || 'system',
      });
    } catch (err: any) {
      if (err?.errno === 1062) throw new PhoneAlreadyRegisteredError();
      throw err;
    }

    await userRepository.createPlayerProfile(userId, input.mainSportId || null, input.mainLevelId || null);
    await userRepository.createWallet(userId);
    await userRepository.assignPlayerRole(userId);

    return this.createSession(userId, meta);
  }

  async registerPlayer(input: PlayerRegisterInput, meta: { ip: string; userAgent?: string; deviceFingerprint?: string }): Promise<{ user: any; isApproved: boolean }> {
    const countryPhoneCode = input.countryCode || await userRepository.getCountryPhoneCode(input.countryId);
    if (!countryPhoneCode) throw new Error(`Country ${input.countryId} not found`);

    const fullPhone = `${countryPhoneCode}${input.phoneNumber}`;
    const existingPhone = await userRepository.findByPhone(fullPhone);
    if (existingPhone) throw new PhoneAlreadyRegisteredError();
    const existingEmail = await userRepository.findByEmail(input.email);
    if (existingEmail) throw new EmailAlreadyRegisteredError();

    const publicId = generateUUID();
    const passwordHash = hashPassword(input.password);
    let userId: number;
    try {
      userId = await userRepository.create({
        publicId, countryId: input.countryId, phoneNumber: input.phoneNumber, fullPhone,
        email: input.email, passwordHash, fullName: input.fullName, gender: input.gender,
        birthDate: input.birthDate || null, languageId: input.languageId || null,
        timezone: input.timezone || 'UTC', darkMode: input.darkMode || 'system',
      });
    } catch (err: any) {
      if (err?.errno === 1062) throw new PhoneAlreadyRegisteredError();
      throw err;
    }

    await userRepository.createPlayerProfile(userId, input.mainSportId || null, input.mainLevelId || null);
    await userRepository.createWallet(userId);
    await userRepository.assignPlayerRole(userId);

    if (input.interestedSportIds?.length) {
      await userRepository.setSportInterestIds(userId, input.interestedSportIds);
    }

    const user = await userRepository.findById(userId);
    const roles = await this.getUserRoles(userId);
    const permissions = await rbacRepository.getUserPermissionKeys(userId);
    return { user: this.mapUserResponse(user, roles, permissions), isApproved: false };
  }

  async registerSeller(input: SellerRegisterInput, meta: { ip: string; userAgent?: string; deviceFingerprint?: string }): Promise<{ user: any; isApproved: boolean }> {
    const countryPhoneCode = input.countryCode || await userRepository.getCountryPhoneCode(input.countryId);
    if (!countryPhoneCode) throw new Error(`Country ${input.countryId} not found`);

    const fullPhone = `${countryPhoneCode}${input.phoneNumber}`;
    const existingPhone = await userRepository.findByPhone(fullPhone);
    if (existingPhone) throw new PhoneAlreadyRegisteredError();
    const existingEmail = await userRepository.findByEmail(input.email);
    if (existingEmail) throw new EmailAlreadyRegisteredError();

    const publicId = generateUUID();
    const passwordHash = hashPassword(input.password);
    let userId: number;
    try {
      userId = await userRepository.create({
        publicId, countryId: input.countryId, phoneNumber: input.phoneNumber, fullPhone,
        email: input.email, passwordHash, fullName: input.fullName, gender: input.gender,
        birthDate: input.birthDate || null, languageId: input.languageId || null,
        timezone: input.timezone || 'UTC', darkMode: input.darkMode || 'system',
      });
    } catch (err: any) {
      if (err?.errno === 1062) throw new PhoneAlreadyRegisteredError();
      throw err;
    }

    await userRepository.createPlayerProfile(userId, (input as any).mainSportId || null, (input as any).mainLevelId || null);
    await userRepository.createWallet(userId);
    await userRepository.assignPlayerRole(userId);

    const pool = getPool();

    // Create Shop org
    const [orgTypeRows] = await pool.execute(
      `SELECT id FROM organisation_types WHERE slug = 'shop' LIMIT 1`
    ) as any;
    const orgTypeId = orgTypeRows[0]?.id || 1;
    const shopSlug = input.shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + userId;
    const orgPublicId = generateUUID();
    const [orgResult] = await pool.execute(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, country_id, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, FALSE, FALSE)`,
      [orgPublicId, orgTypeId, userId, input.shopName, shopSlug, input.countryId]
    ) as any;
    const orgId = orgResult.insertId;

    // Create main branch
    const branchPublicId = generateUUID();
    const branchSlug = `main-branch-${orgId}`;
    await pool.execute(
      `INSERT INTO branches (public_id, organisation_id, name, slug, country_id, access_type, is_active)
       VALUES (?, ?, 'Main Branch', ?, ?, 'open', TRUE)`,
      [branchPublicId, orgId, branchSlug, input.countryId]
    );

    // Clone shop-admin role for this org and assign to owner
    const templateRole = await rbacRepository.getTemplateRoleBySlug('shop-admin');
    if (!templateRole) throw new Error('Template role shop-admin not found');
    const clonedRoleId = await rbacRepository.cloneRoleForOrg(templateRole.id, orgId);
    const sellerUserRoleId = await rbacRepository.assignRole(userId, clonedRoleId, userId);
    await rbacRepository.setUserRoleScope(sellerUserRoleId, [{ scopeType: 'organisation', scopeId: orgId }]);

    // Subscription
    if (input.planId) {
      const [planRows] = await pool.execute(
        'SELECT id, is_internal FROM subscription_plans WHERE id = ? AND is_active = TRUE',
        [input.planId],
      ) as any;
      if (!planRows.length || isInternalSubscriptionPlan(planRows[0])) {
        throw new ValidationError('This subscription plan is not available for registration');
      }

      const billingCycle = input.billingCycle === 'yearly' ? 'yearly' : 'monthly';
      await pool.execute(
        `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, start_date, end_date, auto_renew)
         VALUES (?, ?, ?, 'pending', NULL, NULL, TRUE)`,
        [orgId, input.planId, billingCycle]
      );
    }

    // Create upgrade request
    await pool.execute(
      `INSERT INTO organisation_upgrade_requests (organisation_id, registration_type, requested_by, requested_plan_id, chosen_payment_method, status, metadata)
       VALUES (?, 'seller', ?, ?, ?, 'pending', ?)`,
      [orgId, userId, input.planId || null, input.paymentMethod, JSON.stringify({ shopName: input.shopName })]
    );

    const user = await userRepository.findById(userId);
    const roles = await this.getUserRoles(userId);
    const permissions = await rbacRepository.getUserPermissionKeys(userId);
    return { user: this.mapUserResponse(user, roles, permissions), isApproved: false };
  }

  async registerOrganization(input: OrganizationRegisterInput, meta: { ip: string; userAgent?: string; deviceFingerprint?: string }): Promise<{ user: any; isApproved: boolean }> {
    const countryPhoneCode = input.countryCode || await userRepository.getCountryPhoneCode(input.countryId);
    if (!countryPhoneCode) throw new Error(`Country ${input.countryId} not found`);

    const fullPhone = `${countryPhoneCode}${input.phoneNumber}`;
    const existingPhone = await userRepository.findByPhone(fullPhone);
    if (existingPhone) throw new PhoneAlreadyRegisteredError();
    const existingEmail = await userRepository.findByEmail(input.email);
    if (existingEmail) throw new EmailAlreadyRegisteredError();

    const publicId = generateUUID();
    const passwordHash = hashPassword(input.password);
    let userId: number;
    try {
      userId = await userRepository.create({
        publicId, countryId: input.countryId, phoneNumber: input.phoneNumber, fullPhone,
        email: input.email, passwordHash, fullName: input.fullName, gender: input.gender,
        birthDate: input.birthDate || null, languageId: input.languageId || null,
        timezone: input.timezone || 'UTC', darkMode: input.darkMode || 'system',
      });
    } catch (err: any) {
      if (err?.errno === 1062) throw new PhoneAlreadyRegisteredError();
      throw err;
    }

    await userRepository.createPlayerProfile(userId, (input as any).mainSportId || null, (input as any).mainLevelId || null);
    await userRepository.createWallet(userId);
    await userRepository.assignPlayerRole(userId);

    const pool = getPool();

    const [orgTypeRows] = await pool.execute(
      'SELECT id, slug FROM organisation_types WHERE id = ? AND is_active = TRUE AND deleted_at IS NULL',
      [input.orgTypeId],
    ) as any;
    if (!orgTypeRows.length || isExcludedOrgRegistrationType(orgTypeRows[0].slug)) {
      throw new ValidationError('This organization type is not available for organization registration');
    }

    if (input.planId) {
      const [planRows] = await pool.execute(
        'SELECT id, plan_name, applicable_org_types, is_internal FROM subscription_plans WHERE id = ? AND is_active = TRUE',
        [input.planId],
      ) as any;
      const [allOrgTypes] = await pool.execute(
        'SELECT id, slug FROM organisation_types WHERE is_active = TRUE AND deleted_at IS NULL',
      ) as any;
      if (!planRows.length || !isOrganizationRegistrationPlan(planRows[0], allOrgTypes)) {
        throw new ValidationError('This subscription plan is not available for organization registration');
      }
    }

    // Create Org with chosen type
    const orgSlug = input.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + userId;
    const orgPublicId = generateUUID();
    const [orgResult] = await pool.execute(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, country_id, website, email, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, FALSE, FALSE)`,
      [orgPublicId, input.orgTypeId, userId, input.orgName, orgSlug, input.countryId, input.orgWebsite || null, input.orgEmail || null]
    ) as any;
    const orgId = orgResult.insertId;

    // Clone org-admin role for this org and assign to owner
    const templateRole = await rbacRepository.getTemplateRoleBySlug('org-admin');
    if (!templateRole) throw new Error('Template role org-admin not found');
    const clonedRoleId = await rbacRepository.cloneRoleForOrg(templateRole.id, orgId);
    const orgAdminUserRoleId = await rbacRepository.assignRole(userId, clonedRoleId, userId);
    await rbacRepository.setUserRoleScope(orgAdminUserRoleId, [{ scopeType: 'organisation', scopeId: orgId }]);

    // Subscription
    if (input.planId) {
      const billingCycle = input.billingCycle === 'yearly' ? 'yearly' : 'monthly';
      await pool.execute(
        `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, start_date, end_date, auto_renew)
         VALUES (?, ?, ?, 'pending', NULL, NULL, TRUE)`,
        [orgId, input.planId, billingCycle]
      );
    }

    // Create upgrade request
    await pool.execute(
      `INSERT INTO organisation_upgrade_requests (organisation_id, registration_type, requested_by, requested_plan_id, requested_org_type_id, chosen_payment_method, status, metadata)
       VALUES (?, 'organization', ?, ?, ?, ?, 'pending', ?)`,
      [orgId, userId, input.planId, input.orgTypeId, input.paymentMethod, JSON.stringify({ orgName: input.orgName, documents: input.orgDocuments || [] })]
    );

    const user = await userRepository.findById(userId);
    const roles = await this.getUserRoles(userId);
    const permissions = await rbacRepository.getUserPermissionKeys(userId);
    return { user: this.mapUserResponse(user, roles, permissions), isApproved: false };
  }

  async login(input: LoginInput, meta: { ip: string; userAgent?: string; deviceFingerprint?: string }): Promise<AuthResponse> {
    let fullPhone = input.phoneNumber;
    if (input.countryCode && !input.phoneNumber.startsWith('+')) {
      const code = input.countryCode.startsWith('+') ? input.countryCode : `+${input.countryCode}`;
      const digitsOnly = input.phoneNumber.replace(/\D/g, '');
      fullPhone = `${code}${digitsOnly}`;
    } else if (!input.phoneNumber.startsWith('+')) {
      throw new InvalidCredentialsError();
    }

    const user = await userRepository.findByPhone(fullPhone);
    if (!user) {
      const deletedUser = await userRepository.findByPhoneWithStatus(fullPhone);
      if (deletedUser) {
        throw new AccountNotActiveError(deletedUser.account_status);
      }
      throw new InvalidCredentialsError();
    }
    if (user.account_status !== 'active') {
      throw new AccountNotActiveError(user.account_status);
    }

    const valid = verifyPassword(input.password, user.password_hash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    await userRepository.updateLastLogin(user.id, meta.ip || null);
    return this.createSession(user.id, meta);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const tokenHash = hashToken(refreshToken);
    const session = await sessionRepository.findByRefreshTokenHash(tokenHash);
    if (!session) {
      throw new InvalidRefreshTokenError();
    }
    if (new Date(session.expires_at) < new Date()) {
      await sessionRepository.revoke(session.id);
      throw new SessionExpiredError();
    }
    await sessionRepository.revoke(session.id);
    return this.createSession(session.user_id, { ip: '' });
  }

  async logout(refreshToken?: string, allDevices?: boolean, userId?: number): Promise<void> {
    if (allDevices && userId) {
      await sessionRepository.revokeAllForUser(userId);
      return;
    }
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      const session = await sessionRepository.findByRefreshTokenHash(tokenHash);
      if (session) {
        await sessionRepository.revoke(session.id);
      }
    }
  }

  async forgotPassword(email: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      return { message: 'If that email is registered, a reset link has been sent.' };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await userRepository.createResetToken(user.id, token, expiresAt);

    const resetLink = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

    await queueService.add('send_email', {
      to: user.email,
      subject: 'Reset your CourtZon password',
      body: `Click this link to reset your password: ${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, please ignore this email.`,
      html: `<p>Click the link below to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 1 hour. If you didn't request this, please ignore this email.</p>`,
    });

    const showToken = process.env.DEBUG_RESET_TOKEN === 'true';
    const response: Record<string, any> = { message: 'If that email is registered, a reset link has been sent.' };
    if (showToken) response.token = token;
    return response;
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await userRepository.findResetToken(token);
    if (!record || record.used_at) {
      throw new Error('Invalid or used reset token');
    }
    if (new Date(record.expires_at) < new Date()) {
      throw new Error('Reset token has expired');
    }

    const passwordHash = hashPassword(newPassword);
    await userRepository.updatePassword(record.user_id, passwordHash);
    await userRepository.markResetTokenUsed(token);
    await sessionRepository.revokeAllForUser(record.user_id);
  }

  async updateProfile(userId: number, input: any) {
    const userData: Record<string, any> = {};
    if (input.fullName !== undefined) userData.full_name = input.fullName;
    if (input.email !== undefined) userData.email = input.email;
    if (input.gender !== undefined) userData.gender = input.gender;
    if (input.birthDate !== undefined) userData.birth_date = input.birthDate;
    if (input.timezone !== undefined) userData.timezone = input.timezone;
    if (input.darkMode !== undefined) userData.dark_mode = input.darkMode;
    if (input.languageId !== undefined) userData.language_id = input.languageId;
    if (input.avatarUrl !== undefined) userData.avatar_url = input.avatarUrl;
    if (input.isPublic !== undefined) userData.is_public = input.isPublic;
    await userRepository.update(userId, userData);

    const profileData: { mainSportId?: number | null; mainLevelId?: number | null } = {};
    if (input.mainSportId !== undefined) profileData.mainSportId = input.mainSportId;
    if (input.mainLevelId !== undefined) profileData.mainLevelId = input.mainLevelId;
    if (Object.keys(profileData).length) {
      await userRepository.updatePlayerProfile(userId, profileData);
    }

    if (input.interestedSportIds !== undefined) {
      await userRepository.setSportInterestIds(userId, input.interestedSportIds);
    }

    return this.getProfile(userId);
  }

  async checkUniqueness(input: CheckUniquenessInput) {
    const countryPhoneCode = input.countryCode || await userRepository.getCountryPhoneCode(input.countryId);
    const fullPhone = countryPhoneCode ? `${countryPhoneCode}${input.phoneNumber}` : null;

    const [phoneRecord, emailRecord] = await Promise.all([
      fullPhone ? userRepository.findByPhoneWithStatus(fullPhone) : Promise.resolve(null),
      userRepository.findByEmailWithStatus(input.email),
    ]);

    const result: Record<string, any> = {
      phoneAvailable: !phoneRecord,
      emailAvailable: !emailRecord,
    };
    if (phoneRecord) {
      result.phoneStatus = phoneRecord.account_status;
      result.phoneDeletedAt = phoneRecord.deleted_at;
    }
    if (emailRecord) {
      result.emailStatus = emailRecord.account_status;
      result.emailDeletedAt = emailRecord.deleted_at;
    }
    return result;
  }

  async requestReactivation(input: { phoneNumber: string; email: string; countryId?: number }): Promise<void> {
    const emailRecord = await userRepository.findByEmailWithStatus(input.email);
    let record = emailRecord;
    if (!record && input.countryId) {
      const countryPhoneCode = await userRepository.getCountryPhoneCode(input.countryId);
      if (countryPhoneCode) {
        const fullPhone = `${countryPhoneCode}${input.phoneNumber}`;
        record = await userRepository.findByPhoneWithStatus(fullPhone);
      }
    }
    if (!record) return;
    if (record.account_status === 'deleted') {
      await userRepository.setAccountSuspended(record.id);
    }
  }

  async getProfile(userId: number) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const roles = await this.getUserRoles(userId);
    const permissions = await rbacRepository.getUserPermissionKeys(userId);
    const interestedSportIds = await userRepository.getSportInterestIds(userId);
    return this.mapUserResponse(user, roles, permissions, interestedSportIds);
  }

  private async createSession(userId: number, meta: { ip: string; userAgent?: string; deviceFingerprint?: string }): Promise<AuthResponse> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    let deviceId: number | null = null;
    if (meta.deviceFingerprint) {
      deviceId = await deviceRepository.findOrCreate({
        userId,
        fingerprint: meta.deviceFingerprint,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    }

    const sessionToken = generateSessionToken();
    const refreshToken = generateRefreshToken();
    const sessionTokenHash = hashToken(sessionToken);
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    await sessionRepository.create({
      userId,
      deviceId,
      sessionTokenHash,
      refreshTokenHash,
      ipAddress: meta.ip,
      userAgent: meta.userAgent || null,
      expiresAt,
    });

    const roles = await this.getUserRoles(userId);
    const permissions = await rbacRepository.getUserPermissionKeys(userId);
    const interestedSportIds = await userRepository.getSportInterestIds(userId);
    return {
      user: this.mapUserResponse(user, roles, permissions, interestedSportIds),
      session: {
        sessionToken,
        refreshToken,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  private async getUserRoles(userId: number): Promise<string[]> {
    try {
      const pool = getPool();
      const [rows] = await pool.query<any[]>(
        `SELECT DISTINCT r.slug as role_slug FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND ur.is_active = TRUE
         AND r.deleted_at IS NULL`,
        [userId]
      );
      return rows.map((r: any) => r.role_slug);
    } catch {
      return [];
    }
  }

  async markWelcomeSeen(userId: number): Promise<void> {
    await userRepository.markWelcomeSeen(userId);
  }

  async getPlayerProfileFull(userId: number) {
    return userRepository.getPlayerProfileFull(userId);
  }

  private mapUserResponse(user: any, roles: string[] = [], permissions: string[] = [], interestedSportIds: number[] = []) {
    return {
      id: user.id,
      publicId: user.public_id,
      fullName: user.full_name,
      email: user.email,
      phoneNumber: user.phone_number,
      fullPhone: user.full_phone,
      gender: user.gender,
      birthDate: user.birth_date,
      avatarUrl: sanitizeUploadUrl(user.avatar_url),
      languageId: user.language_id,
      languageCode: user.language_code || null,
      timezone: user.timezone,
      darkMode: user.dark_mode,
      isCoach: user.is_coach || false,
      coachStatus: user.coach_status || 'none',
      isSeller: user.is_seller || false,
      isPublic: !!(user.is_public ?? 1),
      mainSportId: user.main_sport_id,
      mainLevelId: user.main_level_id,
      interestedSportIds,
      defaultCurrency: user.default_currency || 'USD',
      defaultCurrencySymbol: user.currency_symbol || null,
      roles,
      permissions,
    };
  }
}

export const authService = new AuthService();
