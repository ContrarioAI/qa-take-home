export interface ScreeningAnswerDto {
  // "INFORMATION"-type answers are dropped before persistence; anything else is kept.
  type: string;
  answer: string;
}

export interface CandidateDto {
  // If id/linkedin matches an existing RecruiterCandidate it is reused (find-or-create).
  id?: string;
  name: string;
  email: string;
  linkedin?: string;
  // resumeUrl = already on file; resumeTempKey = a freshly uploaded temp-bucket key.
  resumeUrl?: string;
  resumeTempKey?: string;
  resumeFileName?: string;
}

export interface SubmitCandidateDto {
  candidate: CandidateDto;
  jobId: string;
  notes?: string;
  screeningAnswers?: ScreeningAnswerDto[];
}
