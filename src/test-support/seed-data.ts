import { PrismaClient } from '@prisma/client';

export const SEED_VERSION = 1;

/**
 * Deterministic seed. Same ids and scenarios every run so tests are repeatable.
 * Used by `npm run seed` and by POST /test/reset.
 */
export async function seedDatabase(prisma: PrismaClient) {
  await clearAll(prisma);

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  // Active exclusivity window: started yesterday, ends in a week.
  const exclusivityStart = new Date(now - 1 * day);
  const exclusivityEnd = new Date(now + 7 * day);

  // --- Companies ---
  await prisma.company.createMany({
    data: [
      { id: 'co_autoapprove_false', autoApproveAfterAdminApproval: false },
      { id: 'co_autoapprove_true', autoApproveAfterAdminApproval: true },
    ],
  });

  // --- Jobs ---
  await prisma.job.createMany({
    data: [
      { id: 'job_active', companyId: 'co_autoapprove_false', active: true, source: 'internal' },
      { id: 'job_inactive', companyId: 'co_autoapprove_false', active: false, source: 'internal' },
      { id: 'job_deleted', companyId: 'co_autoapprove_false', active: true, deletedAt: new Date(now - day), source: 'internal' },
      { id: 'job_exclusive', companyId: 'co_autoapprove_false', active: true, exclusivityStart, exclusivityEnd, source: 'internal' },
      { id: 'job_kombo', companyId: 'co_autoapprove_true', active: true, source: 'kombo' },
    ],
  });

  // --- Users ---
  await prisma.user.createMany({
    data: [
      // Recruiter with direct access to job_active and job_exclusive.
      { id: 'u_recruiter_direct', isRecruiter: true, selfServe: true },
      // Self-serve recruiter, no direct access anywhere.
      { id: 'u_recruiter_selfserve', isRecruiter: true, selfServe: true },
      // Agency recruiter, no direct access anywhere.
      { id: 'u_recruiter_agency', isRecruiter: true, agencyId: 'agency_1' },
      // Not a recruiter.
      { id: 'u_non_recruiter', isRecruiter: false },
      // Auto-approve recruiter with direct access to the Kombo job.
      { id: 'u_recruiter_autoapprove', isRecruiter: true, selfServe: true, autoApprove: true },
      // Bypass recruiter with one bypass remaining.
      { id: 'u_recruiter_bypass1', isRecruiter: true, selfServe: true, useRoleApprovalBypass: true, bypassQuota: 1 },
      // Bypass recruiter with quota exhausted.
      { id: 'u_recruiter_bypass0', isRecruiter: true, selfServe: true, useRoleApprovalBypass: true, bypassQuota: 0 },
    ],
  });

  // --- Direct role access ---
  await prisma.recruiterRoleAccess.createMany({
    data: [
      { recruiterId: 'u_recruiter_direct', jobId: 'job_active' },
      { recruiterId: 'u_recruiter_direct', jobId: 'job_exclusive' },
      { recruiterId: 'u_recruiter_autoapprove', jobId: 'job_kombo' },
    ],
  });

  // --- Recruiter candidates ---
  await prisma.recruiterCandidate.createMany({
    data: [
      // Candidate that already has a résumé on file (résumé-guard passes without upload).
      {
        id: 'rc_with_resume',
        recruiterId: 'u_recruiter_direct',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        linkedin: 'https://linkedin.com/in/ada',
        resumeUrl: 'https://public-bucket.example.com/existing/resume-ada.pdf',
        status: 'new',
      },
      // Candidate with no résumé on file (needs an upload in the request).
      {
        id: 'rc_no_resume',
        recruiterId: 'u_recruiter_direct',
        name: 'Grace Hopper',
        email: 'grace@example.com',
        linkedin: 'https://linkedin.com/in/grace',
        resumeUrl: null,
        status: 'new',
      },
    ],
  });

  return { seedVersion: SEED_VERSION };
}

/** Delete all rows in FK-safe order. */
export async function clearAll(prisma: PrismaClient) {
  await prisma.candidateStage.deleteMany();
  await prisma.candidateSubmission.deleteMany();
  await prisma.candidateProfile.deleteMany();
  await prisma.recruiterRoleAccess.deleteMany();
  await prisma.recruiterCandidate.deleteMany();
  await prisma.job.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
}
