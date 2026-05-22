document.addEventListener('DOMContentLoaded', () => {
    const queryInput = document.getElementById('queryInput');
    const queryBtn = document.getElementById('queryBtn');
    const chatMessages = document.getElementById('chatMessages');

    // ---- Sample Presets for Ask AI ----
    const QUERY_PRESETS = [
        {
            text: 'Summarize Trade feedback',
            answer: `**Trade Feedback Summary**

The Trade segment (retailers/stores) reports generally positive experiences with product availability and brand visibility. Key highlights:

- **What's working:** Stock availability has improved, POS displays are well-received, and trade partner relationships remain strong in most outlets.
- **Needs attention:** Pricing concerns around newer SKUs, requests for more frequent merchandising visits, and demand for better promotional materials in smaller outlets.
- **Sentiment:** Mostly positive, with actionable suggestions for distribution expansion.`,
        },
        {
            text: 'What are HCP concerns?',
            answer: `**HCP Feedback Insights**

Healthcare Professionals report satisfaction with product efficacy but highlight areas for improvement:

- **Product knowledge:** HCPs request more detailed clinical data and training sessions to better understand product differentiators.
- **Sample management:** Some concerns about sample availability and expiry date tracking.
- **Engagement:** Preference for more frequent, shorter detailing visits vs. long quarterly meetings.
- **Overall:** Positive response to medical literature quality; opportunities in digital engagement tools.`,
        },
        {
            text: 'Consumer satisfaction level',
            answer: `**Consumer Satisfaction Overview**

Consumer feedback indicates strong brand loyalty with room for improvement:

- **Product experience:** High satisfaction with product quality and formulation.
- **Packaging:** Requests for more user-friendly packaging, including clearer usage instructions.
- **Availability:** Some consumers report difficulty finding products in certain pharmacy chains.
- **Recommendation:** 80%+ would recommend the brand to others.
- **Sentiment:** Predominantly positive with constructive feedback on accessibility.`,
        },
        {
            text: 'Key trends across all segments',
            answer: `**Cross-Segment Trend Analysis**

Aggregated trends across Trade, HCP, and Consumer feedback:

- **Training gap:** All segments mention the need for better product knowledge — Trade wants sales training, HCP wants clinical data, Consumers want usage clarity.
- **Availability:** A recurring theme across segments — product not always available at point of need.
- **Digital opportunity:** Growing interest in digital engagement tools across all segments.
- **Brand strength:** High brand equity with consistent positive sentiment across segments.
- **Action items:** 1) Unified training program 2) Distribution optimization 3) Digital detailing expansion.`,
        },
    ];

    function renderPresets() {
        const el = document.getElementById('queryPresets');
        if (!el) return;
        el.innerHTML = QUERY_PRESETS.map(p =>
            `<button class="chat-preset-btn" data-q="${escapeHtml(p.text)}">${escapeHtml(p.text)}</button>`
        ).join('');
        el.querySelectorAll('.chat-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const q = btn.dataset.q;
                const preset = QUERY_PRESETS.find(p => p.text === q);
                if (preset) {
                    appendUserMessage(preset.text);
                    appendAIMessage(preset.answer);
                }
            });
        });
    }

    // ---- Chat Sidebar ----
    queryBtn.addEventListener('click', () => sendQuery());
    queryInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !queryBtn.disabled) sendQuery(); });

    function appendUserMessage(text) {
        const el = document.createElement('div');
        el.className = 'chat-message user';
        el.innerHTML = `<div class="chat-avatar">You</div><div class="chat-bubble"><p>${escapeHtml(text)}</p></div>`;
        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendAIMessage(text) {
        const el = document.createElement('div');
        el.className = 'chat-message ai';
        const content = typeof marked !== 'undefined' ? marked.parse(text) : `<p>${escapeHtml(text)}</p>`;
        el.innerHTML = `<div class="chat-avatar">AI</div><div class="chat-bubble">${content}</div>`;
        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendLoadingMessage() {
        const id = 'loading-' + Date.now();
        const el = document.createElement('div');
        el.className = 'chat-message ai';
        el.id = id;
        el.innerHTML = `<div class="chat-avatar">AI</div><div class="chat-loading"><span></span><span></span><span></span></div>`;
        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return id;
    }

    function removeLoadingMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showNotice(message, level) {
        const container = document.querySelector('.dashboard-section');
        if (!container) return;
        let banner = document.querySelector('.error-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'error-banner';
            container.insertBefore(banner, container.firstChild);
        }
        banner.dataset.level = level || 'info';
        banner.innerHTML = `<button onclick="this.parentElement.remove()">&times;</button>${message}`;
    }

    // ---- Feedback Insights Dashboard ----
    let _fbData = [];
    let _fbFiltered = [];
    let _fbQuestionFilter = 'all';
    let _fbUsersById = {};
    let _fbQuestionsById = {};

    const FB_STOP_WORDS = new Set([
        'the','and','for','are','but','not','you','all','can','had','her','was',
        'one','our','out','has','have','been','some','their','them','than',
        'very','just','with','this','that','from','which','what','when','more',
        'about','into','over','also','its','other','after','well','will',
        'would','could','should','your','his','its','each','much','such',
        'because','before','between','through','during','without','across',
        'been','being','does','did','doing','done','get','got','gets',
        'make','made','makes','may','might','must','still','too','way',
    ]);

    async function loadFeedbackMeta() {
        try {
            const res = await fetch('/api/feedback-meta');
            if (!res.ok) return;
            const meta = await res.json();
            (meta.users || []).forEach(u => { _fbUsersById[u.id] = u; });
            (meta.questions || []).forEach(q => { _fbQuestionsById[q.id] = q; });
        } catch (e) {
            console.warn('Could not load feedback meta:', e);
        }
    }

    async function loadFeedbackData() {
        try {
            const res = await fetch('/api/feedback-data');
            if (!res.ok) throw new Error('Failed to load feedback data');
            const json = await res.json();
            _fbData = json.data || [];
            _fbFiltered = [..._fbData];
            if (json.source) {
                const el = document.getElementById('sidebarDatasourceName');
                if (el) el.textContent = json.source;
            }
            populateFilterDropdowns();
            initFeedbackDashboard();
            triggerFeedbackAiAnalysis();
        } catch (e) {
            console.warn('Could not load feedback data:', e);
            const srcEl = document.getElementById('sidebarDatasourceName');
            if (srcEl) srcEl.textContent = 'No data loaded';
            renderFbEmptyState('Failed to load feedback data. Make sure the CSV file exists.');
        }
    }

    async function triggerFeedbackAiAnalysis() {
        if (_fbQuestionFilter !== 'all') return;
        const responses = getOpenEndedResponses(_fbData);
        if (responses.length === 0) return;
        const text = responses.map((r, i) => `[Response ${i+1}]: ${r}`).join('\n\n');
        try {
            const res = await fetch('/api/analyze-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.slice(0, 150000) }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const result = await res.json();
            if (result && !result.error && result.summary && _fbQuestionFilter === 'all') {
                const el = document.getElementById('fbAiSummary');
                if (el) {
                    el.innerHTML = `<div class="fbi-ai-result"><p>${result.summary}</p>${result.insights && result.insights.what_is_working ? `<div class="fbi-ai-section"><h4>What's Working</h4><ul>${result.insights.what_is_working.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}${result.insights && result.insights.what_is_breaking ? `<div class="fbi-ai-section"><h4>Needs Improvement</h4><ul>${result.insights.what_is_breaking.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}</div>`;
                }
            }
        } catch (e) {
            console.warn('AI analysis of feedback data failed (non-fatal):', e);
        }
    }

    function renderFbEmptyState(msg) {
        ['fbKpiRow', 'fbRatingDist', 'fbWordCloud', 'fbAiSummary', 'fbTableBody']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<div class="fbi-empty">${msg || 'No data available'}</div>`;
            });
    }

    function getOpenEndedResponses(data, questionFilter) {
        const texts = [];
        const qFilter = questionFilter == null ? 'all' : String(questionFilter);
        data.forEach(r => {
            if (qFilter !== 'all' && String(r.question_id) !== qFilter) return;
            if (r.answer_text && String(r.answer_text).trim()) texts.push(String(r.answer_text).trim());
            if (r.voice_text && String(r.voice_text).trim()) texts.push(String(r.voice_text).trim());
        });
        return texts;
    }

    function getOpenEndedQuestionIds(data) {
        const ids = new Set();
        data.forEach(r => {
            const hasText = (r.answer_text && String(r.answer_text).trim()) || (r.voice_text && String(r.voice_text).trim());
            if (hasText && r.question_id != null) ids.add(r.question_id);
        });
        return [...ids].sort((a, b) => a - b);
    }

    function questionLabel(qid, maxLen) {
        const q = _fbQuestionsById[qid];
        if (!q) return `Question ${qid}`;
        const channel = q.channel || '';
        const qno = q.question_no || `Q${qid}`;
        let text = q.question_text || '';
        const cap = maxLen || 60;
        if (text.length > cap) text = text.slice(0, cap - 1) + '…';
        return channel ? `${channel} · ${qno} — ${text}` : `${qno} — ${text}`;
    }

    function questionShort(qid) {
        const q = _fbQuestionsById[qid];
        if (!q) return `Q${qid}`;
        return `${q.channel || ''} · ${q.question_no || 'Q' + qid}`.replace(/^ · /, '');
    }

    function userName(uid) {
        if (uid == null) return '—';
        const u = _fbUsersById[uid];
        return u && u.user_name ? u.user_name : `User #${uid}`;
    }

    function userInitials(name) {
        if (!name) return '?';
        return name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    }

    function buildWordFrequency(texts) {
        const freq = {};
        texts.forEach(t => {
            const words = t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
            words.forEach(w => {
                if (w.length > 2 && !FB_STOP_WORDS.has(w)) {
                    freq[w] = (freq[w] || 0) + 1;
                }
            });
        });
        return Object.entries(freq)
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 40);
    }

    function generateAiSummary(texts) {
        if (texts.length === 0) return { summary: 'No open-ended responses available for this selection.', themes: [], sentiment: 'neutral' };

        const all = texts.join(' ').toLowerCase();
        const themes = [];
        const posWords = ['good','great','excellent','best','love','recommend','effective','helpful','satisfied','strong','fast','improved','trust','happy','impressed','reliable'];
        const negWords = ['improvement','expensive','missing','lack','poor','difficult','stockout','issue','problem','slow','weak','limited','confusing','unavailable'];

        let posCount = 0, negCount = 0;
        posWords.forEach(w => { if (all.includes(w)) posCount++; });
        negWords.forEach(w => { if (all.includes(w)) negCount++; });
        const sentiment = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'mixed';

        if (all.includes('sensodyne')) themes.push({ text: 'Sensodyne brand strength', type: 'positive' });
        if (all.includes('panadol')) themes.push({ text: 'Panadol trust and usage', type: 'positive' });
        if (all.includes('voltaren')) themes.push({ text: 'Voltaren effectiveness', type: 'positive' });
        if (all.includes('centrum')) themes.push({ text: 'Centrum value perception', type: 'neutral' });
        if (all.includes('otrivin')) themes.push({ text: 'Otrivin relief feedback', type: 'neutral' });
        if (all.includes('stockout') || all.includes('out of stock') || all.includes('availability')) themes.push({ text: 'Stock availability concerns', type: 'negative' });
        if (all.includes('train') || all.includes('educat') || all.includes('learn')) themes.push({ text: 'Staff training needs', type: 'negative' });
        if (all.includes('digital') || all.includes('app') || all.includes('qr') || all.includes('online')) themes.push({ text: 'Digital engagement opportunities', type: 'neutral' });
        if (all.includes('compet') || all.includes('colgate') || all.includes('himalaya')) themes.push({ text: 'Competitive pressure', type: 'negative' });
        if (all.includes('price') || all.includes('expensive') || all.includes('cost')) themes.push({ text: 'Pricing sensitivity', type: 'negative' });
        if (all.includes('recommend') || all.includes('prescribe') || all.includes('advise')) themes.push({ text: 'HCP recommendation channel', type: 'positive' });
        if (all.includes('loyal') || all.includes('trust') || all.includes('repeat')) themes.push({ text: 'Brand loyalty & repeat usage', type: 'positive' });
        if (all.includes('display') || all.includes('shelf') || all.includes('visibility')) themes.push({ text: 'In-store visibility & displays', type: 'positive' });
        if (all.includes('sample') || all.includes('trial')) themes.push({ text: 'Sampling & trial programs', type: 'neutral' });
        if (all.includes('clinic') || all.includes('doctor') || all.includes('dentist')) themes.push({ text: 'Clinical/HCP engagement', type: 'positive' });

        let summary;
        if (sentiment === 'positive') {
            summary = 'Overall feedback is predominantly positive. Respondents highlight strong brand trust in Sensodyne and Panadol, with good HCP recommendation rates and effective in-store execution. Stock availability and competitive pricing are areas needing attention.';
        } else if (sentiment === 'negative') {
            summary = 'Feedback indicates several areas requiring improvement. Stock availability, competitive pricing pressure, and the need for better staff training and digital tools are recurring themes.';
        } else {
            summary = 'Feedback presents a mixed picture. While brand loyalty for Sensodyne and Panadol remains strong, there are notable concerns around stock availability, competitive pressure, and the need for enhanced digital engagement tools.';
        }
        return { summary, themes: themes.slice(0, 8), sentiment };
    }

    function initFeedbackDashboard() {
        const data = _fbFiltered;
        if (!data.length) {
            renderFbEmptyState('No data for current filter selection');
            return;
        }

        const ratings = data.filter(r => r.rating != null).map(r => r.rating);
        const ratingsDist = { 1:0, 2:0, 3:0, 4:0, 5:0 };
        ratings.forEach(r => { if (ratingsDist[r] != null) ratingsDist[r]++; });
        const totalRatings = ratings.length;
        const avgRating = totalRatings ? ratings.reduce((a, b) => a + b, 0) / totalRatings : 0;

        const uniqueUsers = new Set(data.map(r => r.user_id != null ? String(r.user_id) : null).filter(Boolean));
        const uniqueOutlets = new Set(data.map(r => r.outlet_id != null ? String(r.outlet_id) : null).filter(Boolean));
        const uniqueVisits = new Set(data.map(r => r.visit_id));

        renderFbKpis(avgRating, totalRatings, uniqueVisits.size, uniqueUsers.size, uniqueOutlets.size);
        renderFbRatingDist(ratingsDist, totalRatings);
        renderFbVerbatimCards(data);
        renderFbTable(data);
    }

    function renderFbKpis(avgRating, totalRatings, totalVisits, totalUsers, totalOutlets) {
        const el = document.getElementById('fbKpiRow');
        if (!el) return;
        el.innerHTML = [
            { label: 'Average Rating', value: avgRating.toFixed(1), unit: '/5', sub: `${totalRatings} ratings collected`, icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`, cls: 'fbi-kpi-green' },
            { label: 'Total Visits', value: totalVisits, unit: '', sub: `${totalRatings} feedback entries`, icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, cls: 'fbi-kpi-blue' },
            { label: 'Field Reps', value: totalUsers, unit: '', sub: `submitting feedback`, icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, cls: 'fbi-kpi-amber' },
            { label: 'Outlets Covered', value: totalOutlets, unit: '', sub: `unique points of sale`, icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/></svg>`, cls: 'fbi-kpi-purple' },
        ].map((k, i) => `
            <div class="fbi-kpi-card ${k.cls}" style="animation-delay:${i*0.1}s">
                <div class="fbi-kpi-icon-wrap">${k.icon}</div>
                <div class="fbi-kpi-value">${k.value}<span class="fbi-kpi-unit">${k.unit}</span></div>
                <div class="fbi-kpi-label">${k.label}</div>
                <div class="fbi-kpi-sub">${k.sub}</div>
            </div>
        `).join('');
    }

    function renderFbRatingDist(dist, total) {
        const el = document.getElementById('fbRatingDist');
        if (!el) return;
        if (total === 0) { el.innerHTML = '<div class="fbi-empty">No ratings available</div>'; return; }
        const maxCount = Math.max(...Object.values(dist), 1);
        const colors = { 1:'#dc2626', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
        const labels = { 1:'Poor', 2:'Fair', 3:'Good', 4:'Very Good', 5:'Excellent' };

        let barsHtml = '';
        for (let i = 1; i <= 5; i++) {
            const count = dist[i] || 0;
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            barsHtml += `
                <div class="fb-rating-bar-wrap">
                    <div class="fb-rating-count">${count}</div>
                    <div class="fb-rating-bar" style="height:${Math.max(4, pct)}%;background:${colors[i]}" title="${labels[i]}: ${count} responses"></div>
                    <div class="fb-rating-label">${i}<br><span style="font-size:0.65rem;font-weight:400;color:var(--text-tertiary)">${labels[i]}</span></div>
                </div>`;
        }

        el.innerHTML = `
            <div class="fb-rating-dist">${barsHtml}</div>
            <div class="fb-rating-total">${total}</div>
            <div class="fb-rating-total-label">Total Ratings Collected</div>`;
    }

    function renderFbWordCloud(wordFreq) {
        const el = document.getElementById('fbWordCloud');
        if (!el) return;
        if (!wordFreq.length) { el.innerHTML = '<div class="fbi-empty">Not enough open-ended responses for word cloud</div>'; return; }

        const maxCount = wordFreq[0].count;
        const colors = ['#1F7110','#3FE320','#059669','#0ea5e9','#7c3aed','#d97706','#dc2626','#0284c7','#84cc16','#6366f1'];

        el.innerHTML = `<div class="fb-word-cloud">${wordFreq.map((w, i) => {
            const size = 0.7 + (w.count / maxCount) * 1.3;
            const color = colors[i % colors.length];
            const opacity = 0.5 + (w.count / maxCount) * 0.5;
            return `<span class="fb-word-item" style="font-size:${size}rem;background:${color}18;color:${color};opacity:${opacity};animation-delay:${i*0.03}s">${w.word}</span>`;
        }).join('')}</div>`;
    }

    function renderFbAiSummary(summary) {
        const el = document.getElementById('fbAiSummary');
        if (!el) return;
        const sentimentIcon = summary.sentiment === 'positive' ? '🟢' : summary.sentiment === 'negative' ? '🔴' : '🟡';
        const sentimentLabel = summary.sentiment === 'positive' ? 'Positive' : summary.sentiment === 'negative' ? 'Needs Attention' : 'Mixed';

        el.innerHTML = `
            <div class="fb-ai-summary">
                <p style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-weight:600;color:var(--text)">
                    ${sentimentIcon} Overall Sentiment: ${sentimentLabel}
                </p>
                <p>${summary.summary}</p>
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                    <span style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em">Key Themes</span>
                    <div style="margin-top:8px">${summary.themes.map(t => `<span class="fb-ai-tag ${t.type}">${t.text}</span>`).join('')}</div>
                    ${summary.themes.length === 0 ? '<div style="font-size:0.9rem;color:var(--text-tertiary);margin-top:4px">No significant themes identified</div>' : ''}
                </div>
            </div>`;
    }

    function renderFbVerbatimCards(data) {
        const openEnded = getOpenEndedResponses(data);
        const wordFreq = buildWordFrequency(openEnded);
        const aiSummary = generateAiSummary(openEnded);
        renderFbWordCloud(wordFreq);
        renderFbAiSummary(aiSummary);

        const scopeEl = document.getElementById('fbVerbatimScope');
        const cloudScopeEl = document.getElementById('fbWordCloudScope');
        if (_fbQuestionFilter === 'all') {
            if (scopeEl) scopeEl.textContent = `Across ${openEnded.length} open-ended response${openEnded.length === 1 ? '' : 's'} from all questions`;
            if (cloudScopeEl) cloudScopeEl.textContent = 'Most frequent words from open-ended feedback';
        } else {
            const q = _fbQuestionsById[_fbQuestionFilter];
            const label = q ? `${q.channel || ''} · ${q.question_no || 'Q' + _fbQuestionFilter} — "${q.question_text}"` : `Question ${_fbQuestionFilter}`;
            if (scopeEl) scopeEl.textContent = `${label} · ${openEnded.length} response${openEnded.length === 1 ? '' : 's'}`;
            if (cloudScopeEl) cloudScopeEl.textContent = `Scoped to ${questionShort(_fbQuestionFilter)}`;
        }
    }

    function getQuestionIdsInData(data) {
        const ids = new Set();
        data.forEach(r => { if (r.question_id != null) ids.add(r.question_id); });
        return [...ids].sort((a, b) => a - b);
    }

    function populateQuestionDropdown(scopedData) {
        const sel = document.getElementById('fbFilterQuestion');
        if (!sel) return;
        const ids = getQuestionIdsInData(scopedData);
        const prev = _fbQuestionFilter;
        sel.innerHTML = '<option value="all">All Questions</option>' +
            ids.map(id => `<option value="${id}">${escapeHtml(questionLabel(id, 80))}</option>`).join('');
        if (prev !== 'all' && ids.map(String).includes(String(prev))) {
            sel.value = String(prev);
        } else {
            sel.value = 'all';
            _fbQuestionFilter = 'all';
        }
    }

    function renderFbTable(data) {
        const body = document.getElementById('fbTableBody');
        const empty = document.getElementById('fbTableEmpty');
        const wrap = document.querySelector('.fb-table-wrap');
        if (!body) return;

        if (!data.length) {
            wrap?.classList.add('hidden');
            empty?.classList.remove('hidden');
            return;
        }
        wrap?.classList.remove('hidden');
        empty?.classList.add('hidden');

        const ratings = data.filter(r => r.rating != null).slice(0, 100);
        const openEnded = data.filter(r => (r.answer_text || r.voice_text)).slice(0, 50);

        const display = [];
        const seen = new Set();
        ratings.forEach(r => {
            const key = r.visit_id + '-' + r.question_id;
            if (!seen.has(key)) { seen.add(key); display.push(r); }
        });
        openEnded.forEach(r => {
            const key = r.visit_id + '-' + r.question_id;
            if (!seen.has(key)) { seen.add(key); display.push(r); }
        });

        display.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        const shown = display.slice(0, 200);

        body.innerHTML = shown.map(r => {
            const typeClass = r.level || 'trade';
            const ratingHtml = r.rating != null
                ? `<span class="fb-rating-pip" style="background:${['#dc2626','#f97316','#eab308','#84cc16','#22c55e'][r.rating - 1] || '#94a3b8'}">${r.rating}</span>`
                : '<span style="color:var(--text-tertiary);font-size:0.75rem">—</span>';
            const responseText = r.answer_text || r.voice_text || '';
            const uName = userName(r.user_id);
            const qShort = r.question_id != null ? questionShort(r.question_id) : '—';
            return `<tr>
                <td style="font-weight:600;font-size:0.8rem">#${r.visit_id}</td>
                <td><span class="fb-type-badge ${typeClass}">${typeClass}</span></td>
                <td style="font-size:0.8rem">${r.outlet_id != null ? 'Outlet #' + r.outlet_id : '—'}</td>
                <td style="font-size:0.82rem">
                    <div class="fb-user-cell">
                        <span class="fb-user-avatar">${userInitials(uName)}</span>
                        <span>${escapeHtml(uName)}</span>
                    </div>
                </td>
                <td style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap">${escapeHtml(qShort)}</td>
                <td>${ratingHtml}</td>
                <td><span class="fb-response-text" title="${escapeHtml(responseText)}">${responseText ? escapeHtml(responseText.slice(0, 80)) + (responseText.length > 80 ? '…' : '') : '<span style="color:var(--text-tertiary)">—</span>'}</span></td>
                <td style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap">${r.created_at ? r.created_at.slice(0, 10) : '—'}</td>
            </tr>`;
        }).join('');

        if (shown.length === 0) {
            wrap?.classList.add('hidden');
            empty?.classList.remove('hidden');
        }
    }

    function applyFeedbackFilters() {
        const level = document.querySelector('.fb-level-btn.active')?.dataset?.level || 'all';
        const outlet = document.getElementById('fbFilterOutlet')?.value || 'all';
        const dateRange = document.getElementById('fbFilterDate')?.value || 'all';
        const question = _fbQuestionFilter || 'all';

        // Refresh question dropdown to reflect what's available within the current level
        const levelScoped = level !== 'all' ? _fbData.filter(r => r.level === level) : _fbData;
        populateQuestionDropdown(levelScoped);

        let filtered = [..._fbData];

        if (level !== 'all') filtered = filtered.filter(r => r.level === level);
        if (outlet !== 'all') filtered = filtered.filter(r => r.outlet_id != null && String(r.outlet_id) === outlet);
        if (_fbQuestionFilter !== 'all') filtered = filtered.filter(r => String(r.question_id) === String(_fbQuestionFilter));

        if (dateRange !== 'all') {
            const now = new Date('2026-05-21');
            const cutoff = new Date(now);
            const days = parseInt(dateRange);
            if (!isNaN(days)) cutoff.setDate(now.getDate() - days);
            filtered = filtered.filter(r => {
                if (!r.created_at) return true;
                const d = new Date(r.created_at);
                return d >= cutoff;
            });
        }

        _fbFiltered = filtered;

        const badge = document.getElementById('fbFilterBadge');
        const badgeText = document.getElementById('fbFilterBadgeText');
        const anyFilterActive = level !== 'all' || outlet !== 'all' || dateRange !== 'all' || _fbQuestionFilter !== 'all';

        if (anyFilterActive && badge && badgeText) {
            const parts = [];
            if (level !== 'all') parts.push(level.toUpperCase());
            if (_fbQuestionFilter !== 'all') parts.push(questionShort(_fbQuestionFilter));
            if (outlet !== 'all') parts.push('Outlet #' + outlet);
            if (dateRange !== 'all') parts.push('Last ' + dateRange.replace('d', ' days'));
            const prefix = parts.length ? parts.join(' · ') + ' · ' : '';
            badgeText.textContent = `${prefix}${filtered.length} response${filtered.length === 1 ? '' : 's'}`;
            badge.classList.remove('hidden');
        } else {
            if (badge) badge.classList.add('hidden');
        }

        initFeedbackDashboard();
    }

    function populateFilterDropdowns() {
        const outlets = new Set();
        _fbData.forEach(r => { if (r.outlet_id != null) outlets.add(String(r.outlet_id)); });

        const outletSel = document.getElementById('fbFilterOutlet');
        if (outletSel) {
            outletSel.innerHTML = '<option value="all">All Outlets</option>';
            [...outlets].sort((a, b) => Number(a) - Number(b)).forEach(o => {
                const opt = document.createElement('option');
                opt.value = o; opt.textContent = 'Outlet #' + o;
                outletSel.appendChild(opt);
            });
        }

        populateQuestionDropdown(_fbData);
    }

    // ---- Feedback Dashboard Event Listeners ----
    document.querySelectorAll('.fb-level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.fb-level-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFeedbackFilters();
        });
    });

    document.getElementById('fbFilterOutlet')?.addEventListener('change', applyFeedbackFilters);
    document.getElementById('fbFilterDate')?.addEventListener('change', applyFeedbackFilters);

    document.getElementById('fbFilterQuestion')?.addEventListener('change', (e) => {
        _fbQuestionFilter = e.target.value || 'all';
        applyFeedbackFilters();
    });

    document.getElementById('fbFilterClearBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.fb-level-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.fb-level-btn[data-level="all"]')?.classList.add('active');
        const outletSel = document.getElementById('fbFilterOutlet');
        const dateSel = document.getElementById('fbFilterDate');
        const qSel = document.getElementById('fbFilterQuestion');
        if (outletSel) outletSel.value = 'all';
        if (dateSel) dateSel.value = 'all';
        if (qSel) qSel.value = 'all';
        _fbQuestionFilter = 'all';
        applyFeedbackFilters();
    });

    document.getElementById('fbDownloadBtn')?.addEventListener('click', () => {
        const data = _fbFiltered;
        if (!data.length) return;
        const headers = ['visit_id','level','outlet_id','user_id','user_name','question_id','question_text','rating','answer_text','voice_text','created_at'];
        let csv = headers.join(',') + '\n';
        data.forEach(r => {
            const enriched = {
                ...r,
                user_name: userName(r.user_id),
                question_text: r.question_id != null && _fbQuestionsById[r.question_id] ? _fbQuestionsById[r.question_id].question_text : '',
            };
            const row = headers.map(h => {
                const val = enriched[h] != null ? enriched[h] : '';
                const str = String(val).replace(/"/g, '""');
                return `"${str}"`;
            });
            csv += row.join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'feedback_responses.csv';
        a.click();
        URL.revokeObjectURL(url);
    });

    // ---- Tooltips ----
    const tooltipPopup = document.getElementById('tooltipPopup');
    document.addEventListener('mouseover', (e) => {
        const trigger = e.target.closest('[data-tooltip]');
        if (trigger) {
            tooltipPopup.textContent = trigger.dataset.tooltip;
            tooltipPopup.classList.add('visible');
            const rect = trigger.getBoundingClientRect();
            tooltipPopup.style.left = rect.left + 'px';
            tooltipPopup.style.top = (rect.bottom + 8) + 'px';
        }
    });
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest('[data-tooltip]')) tooltipPopup.classList.remove('visible');
    });

    // ---- Handle API errors in chat ----
    function handleChatError(err) {
        if (err.message.includes('401') || err.message.includes('Unauthorized')) {
            return '⚠️ **AI Assistant Offline** — The LLM API key is invalid. Check your `.env` file.\n\nThe feedback dashboard is fully functional.';
        }
        if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
            return '⚠️ **Rate limited** — Too many requests. Wait a moment and try again.\n\nThe feedback dashboard works independently.';
        }
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            return '⚠️ **Connection Error** — Could not reach the AI server.\n\nThe feedback dashboard works independently.';
        }
        return `⚠️ **Error:** ${err.message}`;
    }

    async function sendQuery() {
        const query = queryInput.value.trim();
        if (!query) return;

        appendUserMessage(query);
        queryInput.value = '';

        const feedbackText = getOpenEndedResponses(_fbData);
        if (feedbackText.length === 0) {
            appendAIMessage('No feedback data to query against.');
            return;
        }

        const loadingId = appendLoadingMessage();
        queryBtn.disabled = true;
        try {
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: feedbackText.join('\n').slice(0, 200000), query, model: 'big-pickle' }),
            });
            removeLoadingMessage(loadingId);
            if (res.ok) {
                const data = await res.json();
                if (data.answer && data.answer.startsWith('[Analysis unavailable:')) {
                    appendAIMessage(handleChatError(new Error('429')));
                } else {
                    appendAIMessage(data.answer);
                }
            } else {
                const errBody = await res.json().catch(() => ({}));
                appendAIMessage(`⚠️ **Error:** ${errBody.detail || errBody.error || `Server returned ${res.status}`}`);
            }
        } catch (e) {
            removeLoadingMessage(loadingId);
            appendAIMessage(handleChatError(e));
        } finally {
            queryBtn.disabled = false;
        }
    }

    // Bootstrap: load meta first so dropdowns/table can render names, then data
    (async () => {
        await loadFeedbackMeta();
        loadFeedbackData();
        renderPresets();
    })();
});
