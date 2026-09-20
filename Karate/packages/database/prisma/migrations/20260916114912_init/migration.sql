-- CreateEnum
CREATE TYPE "AcademyAdminRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AcademyStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BeltGradeType" AS ENUM ('KYU', 'DAN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('BELT_GRADING', 'TOURNAMENT_RESULT', 'PARTICIPATION');

-- CreateEnum
CREATE TYPE "BracketType" AS ENUM ('SINGLE_ELIMINATION', 'ROUND_ROBIN', 'POOL');

-- CreateEnum
CREATE TYPE "DrawStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BoutStatus" AS ENUM ('SCHEDULED', 'READY', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'COACH', 'ACADEMY', 'SCORER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'PENDING', 'ACTIVE', 'REJECTED', 'LEFT', 'TRANSFERRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipRequestInitiator" AS ENUM ('ACADEMY', 'COACH', 'PLAYER');

-- CreateEnum
CREATE TYPE "MembershipRequestTargetType" AS ENUM ('COACH', 'PLAYER');

-- CreateEnum
CREATE TYPE "MembershipRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OfficialFunction" AS ENUM ('REFEREE', 'JUDGE', 'KANSA', 'SCORE_SUPERVISOR', 'TIMEKEEPER', 'VIDEO_REVIEW_JUDGE', 'TATAMI_MANAGER');

-- CreateEnum
CREATE TYPE "TatamiStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OfficialAssignmentStatus" AS ENUM ('ASSIGNED', 'CONFIRMED', 'DECLINED', 'COMPLETED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ProtestCategory" AS ENUM ('SCORING', 'ELIGIBILITY', 'CONDUCT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProtestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('SUBMITTED', 'VERIFIED', 'REJECTED', 'WITHDRAWN', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "MedicalClearanceStatus" AS ENUM ('PENDING', 'CLEARED', 'DENIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BoutResultMethod" AS ENUM ('POINTS', 'IPPON', 'DECISION', 'DISQUALIFICATION', 'WITHDRAWAL', 'WALKOVER', 'DRAW');

-- CreateEnum
CREATE TYPE "StatsComputationStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrganizerType" AS ENUM ('ACADEMY', 'FEDERATION', 'ASSOCIATION', 'OTHER');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'VERIFICATION', 'WEIGH_IN', 'DRAW_GENERATED', 'SCHEDULED', 'LIVE', 'COMPLETED', 'RESULTS_FINALIZED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Discipline" AS ENUM ('KUMITE', 'KATA');

-- CreateEnum
CREATE TYPE "GenderRestriction" AS ENUM ('MALE', 'FEMALE', 'MIXED', 'OPEN');

-- CreateTable
CREATE TABLE "academies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "logoUrl" TEXT,
    "status" "AcademyStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "academies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_administrators" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "AcademyAdminRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_administrators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "belt_systems" (
    "id" UUID NOT NULL,
    "karateStyleId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "belt_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "belt_grades" (
    "id" UUID NOT NULL,
    "beltSystemId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BeltGradeType" NOT NULL,
    "rankOrder" INTEGER NOT NULL,
    "colorName" TEXT,
    "colorHex" TEXT,

    CONSTRAINT "belt_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_events" (
    "id" UUID NOT NULL,
    "beltSystemId" UUID NOT NULL,
    "hostAcademyId" UUID,
    "examinerUserId" UUID,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_belt_history" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "beltGradeId" UUID NOT NULL,
    "gradingEventId" UUID,
    "awardingAcademyId" UUID,
    "examinerUserId" UUID,
    "awardedDate" TIMESTAMP(3) NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "certificateId" UUID,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_belt_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "type" "CertificateType" NOT NULL,
    "playerId" UUID,
    "issuedByAcademyId" UUID,
    "serialNumber" TEXT NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "fileUrl" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bio" TEXT,
    "yearsActive" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draws" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "bracketType" "BracketType" NOT NULL,
    "status" "DrawStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "generatedByUserId" UUID NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "tatamiId" UUID,
    "roundNumber" INTEGER NOT NULL,
    "name" TEXT,
    "scheduledAt" TIMESTAMP(3),

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bouts" (
    "id" UUID NOT NULL,
    "roundId" UUID NOT NULL,
    "tatamiId" UUID,
    "sequenceNumber" INTEGER NOT NULL,
    "redPlayerId" UUID,
    "bluePlayerId" UUID,
    "status" "BoutStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "bouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "sportsHubIdentityId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_membership_requests" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "targetType" "MembershipRequestTargetType" NOT NULL,
    "playerId" UUID,
    "coachId" UUID,
    "initiatedBy" "MembershipRequestInitiator" NOT NULL,
    "status" "MembershipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "respondedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "academy_membership_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_player_memberships" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "previousMembershipId" UUID,
    "notes" TEXT,

    CONSTRAINT "academy_player_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_coach_affiliations" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "coachId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "previousAffiliationId" UUID,
    "notes" TEXT,

    CONSTRAINT "academy_coach_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tatamis" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" "TatamiStatus" NOT NULL DEFAULT 'INACTIVE',

    CONSTRAINT "tatamis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_assignments" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "tatamiId" UUID,
    "scorerProfileId" UUID NOT NULL,
    "function" "OfficialFunction" NOT NULL,
    "status" "OfficialAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedByUserId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protests" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "boutId" UUID,
    "raisedByUserId" UUID NOT NULL,
    "category" "ProtestCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ProtestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "resolution" TEXT,
    "resolvedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "protests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "tournamentId" UUID,
    "boutId" UUID,
    "reportedByUserId" UUID NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'LOW',
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "primaryStyleId" UUID,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_systems" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "karateStyleId" UUID,
    "description" TEXT,

    CONSTRAINT "ranking_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_seasons" (
    "id" UUID NOT NULL,
    "rankingSystemId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "name" TEXT,

    CONSTRAINT "ranking_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_categories" (
    "id" UUID NOT NULL,
    "rankingSeasonId" UUID NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ranking_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_entries" (
    "id" UUID NOT NULL,
    "rankingCategoryId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "points" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_points_events" (
    "id" UUID NOT NULL,
    "rankingCategoryId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceTournamentId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_points_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "representingAcademyId" UUID,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedByUserId" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eligibility_checks" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "isEligible" BOOLEAN,
    "reasonCodes" TEXT[],
    "checkedByUserId" UUID,
    "checkedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "eligibility_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_clearances" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "status" "MedicalClearanceStatus" NOT NULL DEFAULT 'PENDING',
    "clearanceDocumentUrl" TEXT,
    "issuedByName" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "medical_clearances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weigh_ins" (
    "id" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "weighedAt" TIMESTAMP(3),
    "recordedWeightKg" DECIMAL(5,2),
    "withinLimit" BOOLEAN,
    "recordedByUserId" UUID,
    "notes" TEXT,

    CONSTRAINT "weigh_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorer_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "certificationLevel" TEXT,
    "certifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "scorer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_sets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "organizationName" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_set_versions" (
    "id" UUID NOT NULL,
    "ruleSetId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "sourceUrl" TEXT,
    "sourceDate" TIMESTAMP(3),
    "changeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_set_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_events" (
    "id" UUID NOT NULL,
    "boutId" UUID NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "eventType" TEXT NOT NULL,
    "targetPlayerId" UUID,
    "officialAssignmentId" UUID,
    "points" DECIMAL(6,2),
    "clientOperationId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bout_results" (
    "id" UUID NOT NULL,
    "boutId" UUID NOT NULL,
    "winnerPlayerId" UUID,
    "method" "BoutResultMethod" NOT NULL,
    "finalScoreRed" INTEGER,
    "finalScoreBlue" INTEGER,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "confirmedByUserId" UUID,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bout_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_stats" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "seasonId" UUID,
    "bouts" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "pointsScored" INTEGER NOT NULL DEFAULT 0,
    "pointsConceded" INTEGER NOT NULL DEFAULT 0,
    "medalsGold" INTEGER NOT NULL DEFAULT 0,
    "medalsSilver" INTEGER NOT NULL DEFAULT 0,
    "medalsBronze" INTEGER NOT NULL DEFAULT 0,
    "tournamentsEntered" INTEGER NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_stats" (
    "id" UUID NOT NULL,
    "coachId" UUID NOT NULL,
    "seasonId" UUID,
    "studentCount" INTEGER NOT NULL DEFAULT 0,
    "studentBouts" INTEGER NOT NULL DEFAULT 0,
    "studentWins" INTEGER NOT NULL DEFAULT 0,
    "studentLosses" INTEGER NOT NULL DEFAULT 0,
    "studentMedalsWon" INTEGER NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academy_stats" (
    "id" UUID NOT NULL,
    "academyId" UUID NOT NULL,
    "seasonId" UUID,
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "coachCount" INTEGER NOT NULL DEFAULT 0,
    "tournamentsHosted" INTEGER NOT NULL DEFAULT 0,
    "tournamentsParticipated" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "medalsWon" INTEGER NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_stats" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "registrationsCount" INTEGER NOT NULL DEFAULT 0,
    "academiesCount" INTEGER NOT NULL DEFAULT 0,
    "totalBouts" INTEGER NOT NULL DEFAULT 0,
    "completedBouts" INTEGER NOT NULL DEFAULT 0,
    "liveBouts" INTEGER NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stats_computation_log" (
    "id" UUID NOT NULL,
    "statsType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "seasonId" UUID,
    "triggeredBy" TEXT,
    "status" "StatsComputationStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "stats_computation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "karate_styles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "karate_styles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_organizers" (
    "id" UUID NOT NULL,
    "organizerType" "OrganizerType" NOT NULL,
    "academyId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_organizers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "venue" TEXT,
    "countryCode" TEXT,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_status_history" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "fromStatus" "TournamentStatus",
    "toStatus" "TournamentStatus" NOT NULL,
    "changedByUserId" UUID NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "tournament_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "karateStyleId" UUID,
    "name" TEXT NOT NULL,
    "genderRestriction" "GenderRestriction" NOT NULL DEFAULT 'OPEN',
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "weightMinKg" DECIMAL(5,2),
    "weightMaxKg" DECIMAL(5,2),
    "beltGradeMinOrder" INTEGER,
    "beltGradeMaxOrder" INTEGER,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "ruleSetVersionId" UUID,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academies_slug_key" ON "academies"("slug");

-- CreateIndex
CREATE INDEX "academies_status_idx" ON "academies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "academy_administrators_academyId_userId_key" ON "academy_administrators"("academyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "belt_systems_karateStyleId_name_key" ON "belt_systems"("karateStyleId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "belt_grades_beltSystemId_rankOrder_key" ON "belt_grades"("beltSystemId", "rankOrder");

-- CreateIndex
CREATE UNIQUE INDEX "player_belt_history_certificateId_key" ON "player_belt_history"("certificateId");

-- CreateIndex
CREATE INDEX "player_belt_history_playerId_isCurrent_idx" ON "player_belt_history"("playerId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_serialNumber_key" ON "certificates"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verificationCode_key" ON "certificates"("verificationCode");

-- CreateIndex
CREATE INDEX "certificates_playerId_idx" ON "certificates"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_userId_key" ON "coach_profiles"("userId");

-- CreateIndex
CREATE INDEX "coach_profiles_userId_idx" ON "coach_profiles"("userId");

-- CreateIndex
CREATE INDEX "draws_competitionId_isActive_idx" ON "draws"("competitionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "draws_competitionId_version_key" ON "draws"("competitionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_drawId_roundNumber_key" ON "rounds"("drawId", "roundNumber");

-- CreateIndex
CREATE INDEX "bouts_status_idx" ON "bouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bouts_roundId_sequenceNumber_key" ON "bouts"("roundId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "users_sportsHubIdentityId_key" ON "users"("sportsHubIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "user_role_assignments_role_idx" ON "user_role_assignments"("role");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_userId_role_key" ON "user_role_assignments"("userId", "role");

-- CreateIndex
CREATE INDEX "academy_membership_requests_academyId_status_idx" ON "academy_membership_requests"("academyId", "status");

-- CreateIndex
CREATE INDEX "academy_membership_requests_playerId_idx" ON "academy_membership_requests"("playerId");

-- CreateIndex
CREATE INDEX "academy_membership_requests_coachId_idx" ON "academy_membership_requests"("coachId");

-- CreateIndex
CREATE INDEX "academy_player_memberships_academyId_status_idx" ON "academy_player_memberships"("academyId", "status");

-- CreateIndex
CREATE INDEX "academy_player_memberships_playerId_status_idx" ON "academy_player_memberships"("playerId", "status");

-- CreateIndex
CREATE INDEX "academy_coach_affiliations_academyId_status_idx" ON "academy_coach_affiliations"("academyId", "status");

-- CreateIndex
CREATE INDEX "academy_coach_affiliations_coachId_status_idx" ON "academy_coach_affiliations"("coachId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tatamis_tournamentId_label_key" ON "tatamis"("tournamentId", "label");

-- CreateIndex
CREATE INDEX "official_assignments_tournamentId_function_idx" ON "official_assignments"("tournamentId", "function");

-- CreateIndex
CREATE INDEX "official_assignments_scorerProfileId_idx" ON "official_assignments"("scorerProfileId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "protests_tournamentId_status_idx" ON "protests"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "incidents_status_severity_idx" ON "incidents"("status", "severity");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_userId_key" ON "player_profiles"("userId");

-- CreateIndex
CREATE INDEX "player_profiles_userId_idx" ON "player_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_seasons_rankingSystemId_seasonId_key" ON "ranking_seasons"("rankingSystemId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_categories_rankingSeasonId_label_key" ON "ranking_categories"("rankingSeasonId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ranking_entries_rankingCategoryId_playerId_key" ON "ranking_entries"("rankingCategoryId", "playerId");

-- CreateIndex
CREATE INDEX "ranking_points_events_rankingCategoryId_playerId_idx" ON "ranking_points_events"("rankingCategoryId", "playerId");

-- CreateIndex
CREATE INDEX "registrations_status_idx" ON "registrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_competitionId_playerId_key" ON "registrations"("competitionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "eligibility_checks_registrationId_key" ON "eligibility_checks"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "medical_clearances_registrationId_key" ON "medical_clearances"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "weigh_ins_registrationId_key" ON "weigh_ins"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "scorer_profiles_userId_key" ON "scorer_profiles"("userId");

-- CreateIndex
CREATE INDEX "scorer_profiles_userId_idx" ON "scorer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rule_sets_name_discipline_key" ON "rule_sets"("name", "discipline");

-- CreateIndex
CREATE UNIQUE INDEX "rule_set_versions_ruleSetId_version_key" ON "rule_set_versions"("ruleSetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "score_events_clientOperationId_key" ON "score_events"("clientOperationId");

-- CreateIndex
CREATE INDEX "score_events_boutId_recordedAt_idx" ON "score_events"("boutId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bout_results_boutId_key" ON "bout_results"("boutId");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_name_key" ON "seasons"("name");

-- CreateIndex
CREATE UNIQUE INDEX "player_stats_playerId_seasonId_key" ON "player_stats"("playerId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "coach_stats_coachId_seasonId_key" ON "coach_stats"("coachId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "academy_stats_academyId_seasonId_key" ON "academy_stats"("academyId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_stats_tournamentId_key" ON "tournament_stats"("tournamentId");

-- CreateIndex
CREATE INDEX "stats_computation_log_statsType_entityId_idx" ON "stats_computation_log"("statsType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "karate_styles_name_key" ON "karate_styles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_organizers_academyId_key" ON "tournament_organizers"("academyId");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments"("slug");

-- CreateIndex
CREATE INDEX "tournaments_status_idx" ON "tournaments"("status");

-- CreateIndex
CREATE INDEX "tournaments_organizerId_idx" ON "tournaments"("organizerId");

-- CreateIndex
CREATE INDEX "tournament_status_history_tournamentId_idx" ON "tournament_status_history"("tournamentId");

-- CreateIndex
CREATE INDEX "categories_tournamentId_idx" ON "categories"("tournamentId");

-- CreateIndex
CREATE INDEX "competitions_tournamentId_discipline_idx" ON "competitions"("tournamentId", "discipline");

-- AddForeignKey
ALTER TABLE "academies" ADD CONSTRAINT "academies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_administrators" ADD CONSTRAINT "academy_administrators_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_administrators" ADD CONSTRAINT "academy_administrators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "belt_systems" ADD CONSTRAINT "belt_systems_karateStyleId_fkey" FOREIGN KEY ("karateStyleId") REFERENCES "karate_styles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "belt_grades" ADD CONSTRAINT "belt_grades_beltSystemId_fkey" FOREIGN KEY ("beltSystemId") REFERENCES "belt_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_events" ADD CONSTRAINT "grading_events_beltSystemId_fkey" FOREIGN KEY ("beltSystemId") REFERENCES "belt_systems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_events" ADD CONSTRAINT "grading_events_hostAcademyId_fkey" FOREIGN KEY ("hostAcademyId") REFERENCES "academies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_belt_history" ADD CONSTRAINT "player_belt_history_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_belt_history" ADD CONSTRAINT "player_belt_history_beltGradeId_fkey" FOREIGN KEY ("beltGradeId") REFERENCES "belt_grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_belt_history" ADD CONSTRAINT "player_belt_history_gradingEventId_fkey" FOREIGN KEY ("gradingEventId") REFERENCES "grading_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_belt_history" ADD CONSTRAINT "player_belt_history_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draws" ADD CONSTRAINT "draws_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tatamiId_fkey" FOREIGN KEY ("tatamiId") REFERENCES "tatamis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bouts" ADD CONSTRAINT "bouts_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bouts" ADD CONSTRAINT "bouts_tatamiId_fkey" FOREIGN KEY ("tatamiId") REFERENCES "tatamis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bouts" ADD CONSTRAINT "bouts_redPlayerId_fkey" FOREIGN KEY ("redPlayerId") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bouts" ADD CONSTRAINT "bouts_bluePlayerId_fkey" FOREIGN KEY ("bluePlayerId") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_membership_requests" ADD CONSTRAINT "academy_membership_requests_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_membership_requests" ADD CONSTRAINT "academy_membership_requests_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_membership_requests" ADD CONSTRAINT "academy_membership_requests_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_player_memberships" ADD CONSTRAINT "academy_player_memberships_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_player_memberships" ADD CONSTRAINT "academy_player_memberships_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_player_memberships" ADD CONSTRAINT "academy_player_memberships_previousMembershipId_fkey" FOREIGN KEY ("previousMembershipId") REFERENCES "academy_player_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_coach_affiliations" ADD CONSTRAINT "academy_coach_affiliations_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_coach_affiliations" ADD CONSTRAINT "academy_coach_affiliations_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_coach_affiliations" ADD CONSTRAINT "academy_coach_affiliations_previousAffiliationId_fkey" FOREIGN KEY ("previousAffiliationId") REFERENCES "academy_coach_affiliations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tatamis" ADD CONSTRAINT "tatamis_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_assignments" ADD CONSTRAINT "official_assignments_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_assignments" ADD CONSTRAINT "official_assignments_tatamiId_fkey" FOREIGN KEY ("tatamiId") REFERENCES "tatamis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_assignments" ADD CONSTRAINT "official_assignments_scorerProfileId_fkey" FOREIGN KEY ("scorerProfileId") REFERENCES "scorer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protests" ADD CONSTRAINT "protests_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protests" ADD CONSTRAINT "protests_boutId_fkey" FOREIGN KEY ("boutId") REFERENCES "bouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protests" ADD CONSTRAINT "protests_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protests" ADD CONSTRAINT "protests_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_boutId_fkey" FOREIGN KEY ("boutId") REFERENCES "bouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_systems" ADD CONSTRAINT "ranking_systems_karateStyleId_fkey" FOREIGN KEY ("karateStyleId") REFERENCES "karate_styles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_seasons" ADD CONSTRAINT "ranking_seasons_rankingSystemId_fkey" FOREIGN KEY ("rankingSystemId") REFERENCES "ranking_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_seasons" ADD CONSTRAINT "ranking_seasons_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_categories" ADD CONSTRAINT "ranking_categories_rankingSeasonId_fkey" FOREIGN KEY ("rankingSeasonId") REFERENCES "ranking_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_entries" ADD CONSTRAINT "ranking_entries_rankingCategoryId_fkey" FOREIGN KEY ("rankingCategoryId") REFERENCES "ranking_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_entries" ADD CONSTRAINT "ranking_entries_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_points_events" ADD CONSTRAINT "ranking_points_events_rankingCategoryId_fkey" FOREIGN KEY ("rankingCategoryId") REFERENCES "ranking_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_points_events" ADD CONSTRAINT "ranking_points_events_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eligibility_checks" ADD CONSTRAINT "eligibility_checks_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_clearances" ADD CONSTRAINT "medical_clearances_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weigh_ins" ADD CONSTRAINT "weigh_ins_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorer_profiles" ADD CONSTRAINT "scorer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_set_versions" ADD CONSTRAINT "rule_set_versions_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "rule_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_boutId_fkey" FOREIGN KEY ("boutId") REFERENCES "bouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_events" ADD CONSTRAINT "score_events_officialAssignmentId_fkey" FOREIGN KEY ("officialAssignmentId") REFERENCES "official_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bout_results" ADD CONSTRAINT "bout_results_boutId_fkey" FOREIGN KEY ("boutId") REFERENCES "bouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bout_results" ADD CONSTRAINT "bout_results_winnerPlayerId_fkey" FOREIGN KEY ("winnerPlayerId") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_stats" ADD CONSTRAINT "coach_stats_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_stats" ADD CONSTRAINT "coach_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_stats" ADD CONSTRAINT "academy_stats_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_stats" ADD CONSTRAINT "academy_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stats" ADD CONSTRAINT "tournament_stats_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_organizers" ADD CONSTRAINT "tournament_organizers_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "tournament_organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_status_history" ADD CONSTRAINT "tournament_status_history_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_karateStyleId_fkey" FOREIGN KEY ("karateStyleId") REFERENCES "karate_styles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES "rule_set_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
