export function buildSubmissionBody(fields, answers) {
  const candidate = {
    name: fields.name,
    email: fields.email,
  };

  const optionalCandidateFields = [
    ['id', fields.candidateId],
    ['linkedin', fields.linkedin],
    ['resumeUrl', fields.resumeUrl],
    ['resumeTempKey', fields.resumeTempKey],
    ['resumeFileName', fields.resumeFileName],
  ];

  for (const [key, value] of optionalCandidateFields) {
    const trimmed = String(value ?? '').trim();
    if (trimmed) candidate[key] = trimmed;
  }

  const body = {
    jobId: fields.jobId,
    candidate,
    screeningAnswers: answers.map(({ type, answer }) => ({ type, answer })),
  };

  const notes = String(fields.notes ?? '').trim();
  if (notes) body.notes = notes;

  return body;
}

function createAnswerRow(documentRef, answer = { type: 'QUESTION', answer: '' }) {
  const row = documentRef.createElement('div');
  row.className = 'answer-row';

  const type = documentRef.createElement('select');
  type.className = 'answer-type';
  type.setAttribute('aria-label', 'Screening answer type');
  type.innerHTML = `
    <option value="QUESTION">QUESTION</option>
    <option value="INFORMATION">INFORMATION</option>
  `;
  type.value = answer.type;

  const text = documentRef.createElement('textarea');
  text.className = 'answer-text';
  text.setAttribute('aria-label', 'Screening answer');
  text.rows = 3;
  text.value = answer.answer;

  const remove = documentRef.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-answer';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => row.remove());

  row.append(type, text, remove);
  return row;
}

function readFields(documentRef) {
  return {
    jobId: documentRef.getElementById('jobId').value,
    candidateId: documentRef.getElementById('candidateId').value,
    name: documentRef.getElementById('name').value,
    email: documentRef.getElementById('email').value,
    linkedin: documentRef.getElementById('linkedin').value,
    resumeUrl: documentRef.getElementById('resumeUrl').value,
    resumeTempKey: documentRef.getElementById('resumeTempKey').value,
    resumeFileName: documentRef.getElementById('resumeFileName').value,
    notes: documentRef.getElementById('notes').value,
  };
}

function readAnswers(documentRef) {
  return [...documentRef.querySelectorAll('.answer-row')].map((row) => ({
    type: row.querySelector('.answer-type').value,
    answer: row.querySelector('.answer-text').value,
  }));
}

export function setupForm(documentRef = document, fetchImpl = fetch) {
  const answerRows = documentRef.getElementById('answerRows');
  const status = documentRef.getElementById('status');
  const result = documentRef.getElementById('result');
  const inspection = documentRef.getElementById('inspection');
  let lastSubmissionId = '';

  const readResponse = async (response) => {
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  };

  const sendSubmission = async (body) => {
    const userId = documentRef.getElementById('userId').value;
    const response = await fetchImpl('/ats/submit-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify(body),
    });
    return readResponse(response);
  };

  const renderSubmissionResponses = (responses) => {
    const list = Array.isArray(responses) ? responses : [responses];
    const successful = list.find((entry) => entry.body?.submission?.id);
    if (successful) lastSubmissionId = successful.body.submission.id;
    status.textContent = list.length === 1
      ? `HTTP ${list[0].status}`
      : list.map((entry) => `HTTP ${entry.status}`).join(' / ');
    result.textContent = JSON.stringify(Array.isArray(responses) ? responses : responses.body, null, 2);
  };

  const submit = async (concurrent = false) => {
    const body = buildSubmissionBody(readFields(documentRef), readAnswers(documentRef));
    try {
      const responses = concurrent
        ? await Promise.all([sendSubmission(body), sendSubmission(body)])
        : await sendSubmission(body);
      renderSubmissionResponses(responses);
    } catch (error) {
      status.textContent = 'Request failed';
      result.textContent = String(error);
    }
  };

  documentRef.getElementById('addAnswer').addEventListener('click', () => {
    answerRows.appendChild(createAnswerRow(documentRef));
  });
  documentRef.getElementById('submit').addEventListener('click', () => submit(false));
  documentRef.getElementById('submitConcurrent').addEventListener('click', () => submit(true));

  documentRef.getElementById('resetTestState').addEventListener('click', async () => {
    try {
      const response = await fetchImpl('/test/reset', { method: 'POST' });
      const payload = await readResponse(response);
      lastSubmissionId = '';
      inspection.textContent = JSON.stringify(payload.body, null, 2);
      status.textContent = `HTTP ${payload.status} — test state reset`;
      result.textContent = '';
    } catch (error) {
      status.textContent = 'Reset failed';
      inspection.textContent = String(error);
    }
  });

  documentRef.getElementById('inspectSubmission').addEventListener('click', async () => {
    if (!lastSubmissionId) {
      inspection.textContent = 'Submit a candidate first.';
      return;
    }
    try {
      const payload = await readResponse(await fetchImpl(`/ats/submissions/${encodeURIComponent(lastSubmissionId)}`));
      inspection.textContent = JSON.stringify(payload, null, 2);
    } catch (error) {
      inspection.textContent = String(error);
    }
  });

  documentRef.getElementById('refreshRecorders').addEventListener('click', async () => {
    try {
      const payload = await readResponse(await fetchImpl('/test/recorders?awaitPending=true'));
      inspection.textContent = JSON.stringify(payload, null, 2);
    } catch (error) {
      inspection.textContent = String(error);
    }
  });

  answerRows.appendChild(createAnswerRow(documentRef, { type: 'QUESTION', answer: 'I have 5 years of experience.' }));
}

if (typeof document !== 'undefined') setupForm();
