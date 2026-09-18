import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildSubmissionBody } from '../public/form.mjs';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('the QA form exposes candidate, repeatable answer, and inspection controls', () => {
  for (const id of [
    'candidateId',
    'answerRows',
    'addAnswer',
    'resetTestState',
    'submitConcurrent',
    'inspectSubmission',
    'refreshRecorders',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('the form builder sends candidate id and typed screening answers', () => {
  const body = buildSubmissionBody({
    jobId: 'job_active',
    candidateId: 'rc_with_resume',
    name: 'Ada Lovelace',
    email: 'Ada@Example.com',
    linkedin: 'https://linkedin.com/in/ada',
    resumeUrl: '',
    resumeTempKey: '',
    resumeFileName: 'resume.pdf',
    notes: 'candidate notes',
  }, [
    { type: 'QUESTION', answer: 'Why this role?' },
    { type: 'INFORMATION', answer: 'Internal context' },
  ]);

  assert.deepEqual(body, {
    jobId: 'job_active',
    candidate: {
      id: 'rc_with_resume',
      name: 'Ada Lovelace',
      email: 'Ada@Example.com',
      linkedin: 'https://linkedin.com/in/ada',
      resumeFileName: 'resume.pdf',
    },
    notes: 'candidate notes',
    screeningAnswers: [
      { type: 'QUESTION', answer: 'Why this role?' },
      { type: 'INFORMATION', answer: 'Internal context' },
    ],
  });
});
