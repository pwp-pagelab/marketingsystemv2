const state = {
  session: null,
  busy: false,
  currentPage: 'brief'
};
window.workflowState = state;

const workflowPages = ['brief', 'branding', 'strategy', 'design'];

const els = {
  clientBriefForm: document.querySelector('#clientBriefForm'),
  brandingForm: document.querySelector('#brandingForm'),
  uploadForm: document.querySelector('#uploadForm'),
  analyzeBrandingBtn: document.querySelector('#analyzeBrandingBtn'),
  approveBrandingBtn: document.querySelector('#approveBrandingBtn'),
  prepareDesignBtn: document.querySelector('#prepareDesignBtn'),
  prevPageBtn: document.querySelector('#prevPageBtn'),
  nextPageBtn: document.querySelector('#nextPageBtn'),
  csvFile: document.querySelector('#csvFile'),
  startBtn: document.querySelector('#startBtn'),
  printBtn: document.querySelector('#printBtn'),
  excelBtn: document.querySelector('#excelBtn'),
  generateSocialPlanBtn: document.querySelector('#generateSocialPlanBtn'),
  emptyState: document.querySelector('#emptyState'),
  outputs: document.querySelector('#outputs'),
  statusText: document.querySelector('#statusText'),
  progressPercent: document.querySelector('#progressPercent'),
  progressFill: document.querySelector('#progressFill'),
  approveStrategyBtn: document.querySelector('#approveStrategyBtn'),
  reviseStrategyBtn: document.querySelector('#reviseStrategyBtn'),
  approveCopyBtn: document.querySelector('#approveCopyBtn'),
  reviseCopyBtn: document.querySelector('#reviseCopyBtn'),
  strategyFeedback: document.querySelector('#strategyFeedback'),
  copyFeedback: document.querySelector('#copyFeedback'),
  businessInfoOutput: document.querySelector('#businessInfoOutput'),
  brandingAnalysisOutput: document.querySelector('#brandingAnalysisOutput'),
  intakeOutput: document.querySelector('#intakeOutput'),
  strategyOutput: document.querySelector('#strategyOutput'),
  plannerOutput: document.querySelector('#plannerOutput'),
  copywritingOutput: document.querySelector('#copywritingOutput'),
  qaOutput: document.querySelector('#qaOutput'),
  creativeOutput: document.querySelector('#creativeOutput'),
  finalBriefOutput: document.querySelector('#finalBriefOutput'),
  socialPlanTableWrap: document.querySelector('#socialPlanTableWrap'),
  designPostsOutput: document.querySelector('#designPostsOutput')
};

function setBusy(isBusy, message) {
  state.busy = isBusy;
  els.statusText.textContent = message;
  document.querySelectorAll('button').forEach((button) => {
    if (!['printBtn', 'excelBtn'].includes(button.id)) button.disabled = isBusy;
  });
  updateControls();
}

function updateControls() {
  const outputs = state.session?.outputs || {};
  els.analyzeBrandingBtn.disabled = state.busy || !outputs.businessInfo;
  els.approveBrandingBtn.disabled = state.busy || !outputs.brandingAnalysis;
  els.approveStrategyBtn.disabled = state.busy || !outputs.strategy;
  els.reviseStrategyBtn.disabled = state.busy || !outputs.strategy;
  els.approveCopyBtn.disabled = state.busy || !outputs.copywriting;
  els.reviseCopyBtn.disabled = state.busy || !outputs.copywriting;
  els.printBtn.disabled = !outputs.finalBrief;
  els.generateSocialPlanBtn.disabled = state.busy || !outputs.finalBrief;
  els.excelBtn.disabled = state.busy || !outputs.socialPlan;
  els.prepareDesignBtn.disabled = state.busy || !outputs.socialPlan;
  updatePageNav();
}

function canOpenPage(page) {
  const outputs = state.session?.outputs || {};
  if (page === 'brief') return true;
  if (page === 'branding') return Boolean(outputs.businessInfo);
  if (page === 'strategy') return Boolean(outputs.strategy);
  if (page === 'design') return Boolean(outputs.socialPlan);
  return false;
}

function setCurrentPage(page) {
  if (!workflowPages.includes(page) || !canOpenPage(page)) return;

  state.currentPage = page;
  document.querySelectorAll('.app-page').forEach((section) => {
    section.hidden = section.dataset.page !== page;
  });

  document.querySelectorAll('[data-page-target]').forEach((step) => {
    step.classList.toggle('active', step.dataset.pageTarget === page);
  });

  updatePageNav();
}

function updatePageNav() {
  const currentIndex = workflowPages.indexOf(state.currentPage);
  const nextPage = workflowPages[currentIndex + 1];

  els.prevPageBtn.disabled = state.busy || currentIndex <= 0;
  els.nextPageBtn.disabled = state.busy || !nextPage || !canOpenPage(nextPage);
  els.nextPageBtn.textContent = nextPage ? 'التالي' : 'اكتمل';
}

function setStepStatus(outputs = {}) {
  const steps = Array.from(document.querySelectorAll('[data-step]'));
  const completed = steps.filter((step) => Boolean(outputs[step.dataset.step])).length;
  const percent = Math.round((completed / steps.length) * 100);

  steps.forEach((step) => {
    step.classList.toggle('done', Boolean(outputs[step.dataset.step]));
    step.classList.toggle('clickable', canOpenPage(step.dataset.pageTarget));
  });

  els.progressPercent.textContent = `${percent}%`;
  els.progressFill.style.width = `${percent}%`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function removeJsonAndCode(text = '') {
  let clean = String(text)
    .replace(/```(?:json|javascript|js)?[\s\S]*?```/gi, '')
    .replace(/={8,}\s*JSON OUTPUT\s*={8,}[\s\S]*$/i, '')
    .replace(/JSON OUTPUT[\s\S]*$/i, '')
    .trim();

  const jsonStart = clean.lastIndexOf('\n{');
  if (jsonStart !== -1 && clean.slice(jsonStart).trim().endsWith('}')) {
    clean = clean.slice(0, jsonStart).trim();
  }

  return clean;
}

function formatOutputHtml(text = '') {
  const clean = removeJsonAndCode(text);
  if (!clean) {
    return '<p class="muted">لا يوجد محتوى ظاهر بعد.</p>';
  }

  return clean
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return '';

      const firstLine = lines[0]
        .replace(/^#+\s*/, '')
        .replace(/^={2,}\s*/, '')
        .replace(/\s*={2,}$/, '');

      if (lines.length === 1 && (/^\d+\./.test(firstLine) || firstLine.length < 80)) {
        return `<h3>${escapeHtml(firstLine.replace(/^\d+\.\s*/, ''))}</h3>`;
      }

      const listLines = lines.filter((line) => /^[-•]\s+/.test(line) || /^\d+\.\s+/.test(line));
      if (listLines.length === lines.length) {
        return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ul>`;
      }

      return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
    })
    .join('');
}

function showOutput(id, value) {
  if (els[`${id}Output`]) {
    els[`${id}Output`].innerHTML = formatOutputHtml(value || '');
  }
  const section = document.querySelector(`[data-output="${id}"]`);
  if (section) section.hidden = !value;
}

function renderBusinessInfo(info = null) {
  const section = document.querySelector('[data-output="businessInfo"]');
  section.hidden = !info;

  if (!info) {
    els.businessInfoOutput.innerHTML = '';
    return;
  }

  const entries = Object.entries(info)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .slice(0, 24);

  els.businessInfoOutput.innerHTML = entries.map(([label, value]) => `
    <div class="summary-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || 'غير محدد')}</strong>
    </div>
  `).join('');
}

function renderBrandingAnalysis(analysis = null) {
  const section = document.querySelector('[data-output="brandingAnalysis"]');
  section.hidden = !analysis;

  if (!analysis) {
    els.brandingAnalysisOutput.innerHTML = '';
    return;
  }

  if (typeof analysis === 'string') {
    els.brandingAnalysisOutput.innerHTML = formatOutputHtml(analysis);
    return;
  }

  const visual = analysis.visual_brand_system || {};
  const tokens = analysis.design_tokens || {};
  const rules = analysis.design_rules || {};

  const blocks = [
    ['ملخص الهوية البصرية', analysis.summary || visual.visual_summary],
    ['الألوان', (tokens.colors || []).join('، ')],
    ['الخطوط', (tokens.fonts || []).join('، ')],
    ['قواعد التصميم', [...(rules.do || []), ...(rules.reusable_tokens || [])].join('\n')],
    ['ما يجب تجنبه', (rules.dont || []).join('\n')],
    ['معلومات ناقصة', (analysis.missing_information || []).join('\n')]
  ].filter(([, value]) => value);

  els.brandingAnalysisOutput.innerHTML = blocks.map(([title, value]) => `
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(value).replaceAll('\n', '<br>')}</p>
  `).join('');
}

function renderSocialPlan(rows = []) {
  const section = document.querySelector('[data-output="socialPlan"]');
  section.hidden = !state.session?.outputs?.finalBrief;

  if (!rows.length) {
    els.socialPlanTableWrap.innerHTML = '<p class="muted">اضغط "إظهار الخطة" لتوليد جدول السوشيال ميديا قبل تصديره إلى Excel.</p>';
    return;
  }

  const columns = [
    'منصة السوشيال ميديا',
    'العنوان',
    'النوع',
    'مقترح التصميم / الفيديو',
    'كوبي التصميم / الفيديو',
    'الكابشن',
    'الهاشتاغ'
  ];

  els.socialPlanTableWrap.innerHTML = `
    <table class="social-plan-table">
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderDesignPosts(rows = []) {
  const section = document.querySelector('[data-output="designPosts"]');
  section.hidden = !state.session?.outputs?.socialPlan;

  if (!rows.length) {
    els.designPostsOutput.innerHTML = '<p class="muted">بعد ظهور خطة السوشيال ميديا، اضغط "تجهيز قائمة التصميم" لعرض بطاقات التصميم.</p>';
    return;
  }

  els.designPostsOutput.innerHTML = rows.map((row, index) => `
    <article class="design-card">
      ${row.image_url
        ? `<img class="design-preview" src="${escapeHtml(row.image_url)}" alt="${escapeHtml(row.content_title || `Design ${index + 1}`)}">`
        : '<div class="design-placeholder">Prompt جاهز، لم يتم توليد صورة لهذا التصميم بعد.</div>'}
      <div class="design-card-head">
        <span>${escapeHtml(row.content_type || row['النوع'] || 'Post')}</span>
        <strong>${escapeHtml(row.platform || row['منصة السوشيال ميديا'] || 'غير محدد')}</strong>
      </div>
      <h3>${escapeHtml(row.content_title || row['العنوان'] || `تصميم ${index + 1}`)}</h3>
      <p><b>المقاس:</b> ${escapeHtml(row.dimensions || 'غير محدد')}</p>
      <p><b>الاتجاه البصري:</b> ${escapeHtml(row.visual_direction || row['مقترح التصميم / الفيديو'] || 'غير محدد')}</p>
      <p><b>التركيب:</b> ${escapeHtml(row.layout_structure || 'غير محدد')}</p>
      <p><b>الخطوط:</b> ${escapeHtml(row.typography_direction || 'غير محدد')}</p>
      <p><b>الألوان:</b> ${escapeHtml(row.color_system || 'غير محدد')}</p>
      <p><b>الصور:</b> ${escapeHtml(row.image_style || 'غير محدد')}</p>
      <p><b>CTA:</b> ${escapeHtml(row.cta_style || 'غير محدد')}</p>
      <details>
        <summary>Prompt توليد الصورة</summary>
        <p>${escapeHtml(row.ai_image_prompt || 'غير محدد')}</p>
      </details>
    </article>
  `).join('');
}

function renderSession(session) {
  state.session = session;

  const outputs = session.outputs || {};
  renderBusinessInfo(outputs.businessInfo || session.businessInfo || null);
  renderBrandingAnalysis(outputs.brandingAnalysis);
  showOutput('intake', outputs.intake);
  showOutput('strategy', outputs.strategy);
  showOutput('planner', outputs.planner);
  showOutput('copywriting', outputs.copywriting);
  showOutput('qa', outputs.qa);
  showOutput('creative', outputs.creative);
  showOutput('finalBrief', outputs.finalBrief);
  renderSocialPlan(outputs.socialPlan || []);
  renderDesignPosts(outputs.designPosts || []);

  setStepStatus(outputs);
  if (outputs.socialPlan) {
    setCurrentPage('design');
  } else if (outputs.brandingAnalysis) {
    setCurrentPage(outputs.strategy ? 'strategy' : 'branding');
  } else if (outputs.businessInfo) {
    setCurrentPage('branding');
  } else {
    setCurrentPage('brief');
  }
  updateControls();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'فشل الطلب.');
  }
  return data;
}

function handleError(error) {
  setBusy(false, error.message);
}

function formToGroupedObject(form) {
  const data = {};
  const formData = new FormData(form);

  for (const [key, value] of formData.entries()) {
    if (!value) continue;
    if (data[key]) {
      data[key] = Array.isArray(data[key]) ? [...data[key], value] : [data[key], value];
    } else {
      data[key] = value;
    }
  }

  return data;
}

els.clientBriefForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const businessInfo = formToGroupedObject(els.clientBriefForm);

  try {
    setBusy(true, 'جاري حفظ معلومات العميل...');
    const session = await requestJson('/api/client-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessInfo })
    });
    renderSession(session);
    setCurrentPage('branding');
    setBusy(false, 'تم حفظ معلومات العميل. ارفع ملفات البراند الآن.');
  } catch (error) {
    handleError(error);
  }
});

els.brandingForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!state.session?.id) {
    handleError(new Error('احفظ معلومات العميل أولًا.'));
    return;
  }

  const files = document.querySelector('#brandingFiles').files;
  const links = document.querySelector('#brandingLinks').value.trim();
  if (!files.length && !links) {
    handleError(new Error('ارفع ملف براند واحد على الأقل أو ضع رابطًا.'));
    return;
  }

  const formData = new FormData();
  formData.append('sessionId', state.session.id);
  formData.append('brandingLinks', links);
  formData.append('brandingModel', document.querySelector('#brandingModel').value);
  Array.from(files).forEach((file) => formData.append('brandingFiles', file));

  try {
    setBusy(true, 'جاري تحليل ملفات البراند...');
    const session = await requestJson('/api/analyze-branding', {
      method: 'POST',
      body: formData
    });
    renderSession(session);
    setCurrentPage('branding');
    setBusy(false, 'تحليل البراند جاهز للمراجعة والاعتماد');
  } catch (error) {
    handleError(error);
  }
});

els.approveBrandingBtn.addEventListener('click', async () => {
  try {
    setBusy(true, 'تم اعتماد البراند. جاري توليد الاستراتيجية...');
    const session = await requestJson('/api/approve-branding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.session.id })
    });
    renderSession(session);
    setCurrentPage('strategy');
    setBusy(false, 'الاستراتيجية جاهزة للموافقة');
  } catch (error) {
    handleError(error);
  }
});

els.uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!els.csvFile.files[0]) return;

  const formData = new FormData();
  formData.append('csv', els.csvFile.files[0]);

  try {
    setBusy(true, 'جاري استيراد معلومات العميل من CSV...');
    const session = await requestJson('/api/start', {
      method: 'POST',
      body: formData
    });
    renderSession(session);
    setCurrentPage('branding');
    setBusy(false, 'تم استيراد معلومات العميل. ارفع ملفات البراند الآن.');
  } catch (error) {
    handleError(error);
  }
});

els.approveStrategyBtn.addEventListener('click', async () => {
  try {
    setBusy(true, 'جاري تشغيل تخطيط المحتوى والكتابة والمراجعة...');
    const session = await requestJson('/api/approve-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.session.id,
        feedback: els.strategyFeedback.value
      })
    });
    renderSession(session);
    setCurrentPage('strategy');
    setBusy(false, 'الكتابة التسويقية جاهزة للموافقة');
  } catch (error) {
    handleError(error);
  }
});

els.reviseStrategyBtn.addEventListener('click', async () => {
  try {
    setBusy(true, 'جاري تعديل الاستراتيجية...');
    const session = await requestJson('/api/revise-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.session.id,
        feedback: els.strategyFeedback.value
      })
    });
    renderSession(session);
    setCurrentPage('strategy');
    setBusy(false, 'تم تعديل الاستراتيجية');
  } catch (error) {
    handleError(error);
  }
});

els.approveCopyBtn.addEventListener('click', async () => {
  try {
    setBusy(true, 'جاري تشغيل التوجيه الإبداعي والبريف النهائي...');
    const session = await requestJson('/api/approve-copywriting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.session.id,
        feedback: els.copyFeedback.value
      })
    });
    renderSession(session);
    setCurrentPage('strategy');
    setBusy(false, 'البريف النهائي جاهز للتصدير PDF');
  } catch (error) {
    handleError(error);
  }
});

els.reviseCopyBtn.addEventListener('click', async () => {
  try {
    setBusy(true, 'جاري تعديل الكتابة التسويقية...');
    const session = await requestJson('/api/revise-copywriting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.session.id,
        feedback: els.copyFeedback.value
      })
    });
    renderSession(session);
    setCurrentPage('strategy');
    setBusy(false, 'تم تعديل الكتابة التسويقية');
  } catch (error) {
    handleError(error);
  }
});

els.printBtn.addEventListener('click', () => {
  window.print();
});

els.generateSocialPlanBtn.addEventListener('click', async () => {
  try {
    setBusy(true, 'جاري توليد خطة السوشيال ميديا...');
    const session = await requestJson('/api/generate-social-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.session.id })
    });
    renderSession(session);
    setCurrentPage('strategy');
    setBusy(false, 'خطة السوشيال ميديا جاهزة للمعاينة والتصدير');
  } catch (error) {
    handleError(error);
  }
});

els.prepareDesignBtn.addEventListener('click', async () => {
  try {
    setBusy(true, 'جاري توليد اتجاهات التصميم...');
    const session = await requestJson('/api/generate-design-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.session.id })
    });
    renderSession(session);
    setCurrentPage('design');
    setBusy(false, 'اتجاهات التصميم جاهزة');
  } catch (error) {
    handleError(error);
  }
});

els.excelBtn.addEventListener('click', async () => {
  try {
    setBusy(true, 'جاري تجهيز ملف Excel...');
    const response = await fetch('/api/export-social-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.session.id })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'فشل إنشاء ملف Excel.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'social-media-content-plan.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBusy(false, 'تم تجهيز ملف Excel');
  } catch (error) {
    handleError(error);
  }
});

localStorage.removeItem('marketingWorkflowSession');
setStepStatus({});
setCurrentPage('brief');
updateControls();

els.prevPageBtn.addEventListener('click', () => {
  const currentIndex = workflowPages.indexOf(state.currentPage);
  setCurrentPage(workflowPages[currentIndex - 1]);
});

els.nextPageBtn.addEventListener('click', () => {
  const currentIndex = workflowPages.indexOf(state.currentPage);
  setCurrentPage(workflowPages[currentIndex + 1]);
});

document.querySelectorAll('[data-page-target]').forEach((step) => {
  step.addEventListener('click', () => setCurrentPage(step.dataset.pageTarget));
});
