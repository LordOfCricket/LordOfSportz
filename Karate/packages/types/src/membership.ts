export const MEMBERSHIP_STATUSES = [
  "INVITED",
  "PENDING",
  "ACTIVE",
  "REJECTED",
  "LEFT",
  "TRANSFERRED",
  "SUSPENDED",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const MEMBERSHIP_REQUEST_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type MembershipRequestStatus = (typeof MEMBERSHIP_REQUEST_STATUSES)[number];
