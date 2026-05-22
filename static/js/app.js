document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const appLayout = document.getElementById('appLayout');
    const appHeader = document.getElementById('appHeader');
    const queryInput = document.getElementById('queryInput');
    const queryBtn = document.getElementById('queryBtn');
    const chatMessages = document.getElementById('chatMessages');
    const queryPresets = document.getElementById('queryPresets');

    const STORAGE_KEY = 'sensemark_sessions';
    let sessions = [];
    let activeSessionId = null;
    let pendingFiles = [];

    // ---- Session Management ----
    function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

    function loadSessions() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    sessions = parsed;
                    return true;
                }
            }
        } catch (e) { console.warn('Failed to load cached sessions:', e); }
        return false;
    }

    function saveSessions() {
        try {
            const slim = sessions.map(s => ({ ...s, fileText: undefined }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        } catch (e) {
            console.warn('Failed to save sessions:', e);
            if (sessions.length > 5) {
                sessions = sessions.slice(-5);
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.map(s => ({ ...s, fileText: undefined })))); }
                catch (e2) { console.warn('Still failed:', e2); }
            }
        }
    }

    function clearAllSessions() {
        localStorage.removeItem(STORAGE_KEY);
        sessions = [];
        activeSessionId = null;
        renderSidebar();
    }

    function addSession(filename, data, text, collectionId) {
        const session = { id: generateId(), filename, data, fileText: text, collectionId, createdAt: Date.now() };
        sessions.push(session);
        activeSessionId = session.id;
        saveSessions();
        renderSidebar();
        return session;
    }

    function getSession(id) { return sessions.find(s => s.id === id); }

    function activateSession(id) {
        activeSessionId = id;
        saveSessions();
        renderSidebar();
    }

    function removeSession(id) {
        sessions = sessions.filter(s => s.id !== id);
        saveSessions();
        renderSidebar();
        if (sessions.length === 0) {
            // No upload landing to show; just stay on dashboard
        } else if (activeSessionId === id) {
            activateSession(sessions[sessions.length - 1].id);
        }
    }

    function renderSidebar() {
        const sidebarSessions = document.getElementById('sidebarSessions');
        sidebarSessions.innerHTML = '';
        sessions.forEach(s => {
            const el = document.createElement('div');
            el.className = 'session-item' + (s.id === activeSessionId ? ' active' : '');
            el.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span class="session-item-name">${s.filename}</span>
                <button class="session-item-close" data-id="${s.id}">&times;</button>
            `;
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('session-item-close')) {
                    removeSession(e.target.dataset.id);
                    return;
                }
                activateSession(s.id);
            });
            sidebarSessions.appendChild(el);
        });
    }

    const sidebarSessions = document.getElementById('sidebarSessions');
    const sidebarNewBtn = document.getElementById('sidebarNewBtn');
    const sidebarClearBtn = document.getElementById('sidebarClearBtn');

    sidebarNewBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        pendingFiles = Array.from(files);
        showLoading();
        for (const file of pendingFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model', document.getElementById('modelSelect') ? document.getElementById('modelSelect').value : 'gemma4:31b-cloud');
            try {
                const response = await fetch('/api/analyze', { method: 'POST', body: formData });
                if (!response.ok) {
                    const ct = response.headers.get('content-type');
                    if (ct && ct.includes('application/json')) {
                        const err = await response.json();
                        throw new Error(err.detail || 'Analysis failed');
                    }
                    throw new Error(`Server error: ${response.status}`);
                }
                const result = await response.json();
                if (result.analysis.error) throw new Error(result.analysis.error);

                const reader = new FileReader();
                const text = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsText(file);
                });

                addSession(file.name, result.analysis, text, result.collection_id);
            } catch (error) {
                hideLoading();
                const container = document.querySelector('.dashboard-section');
                let banner = document.querySelector('.error-banner');
                if (!banner) {
                    banner = document.createElement('div');
                    banner.className = 'error-banner';
                    container.insertBefore(banner, container.firstChild);
                }
                banner.innerHTML = `<button onclick="this.parentElement.remove()">&times;</button>Failed to analyze ${file.name}: ${error.message}`;
                return;
            }
        }
        pendingFiles = [];
        fileInput.value = '';
        hideLoading();
        if (sessions.length > 0) {
            activateSession(sessions[sessions.length - 1].id);
        }
    });

    sidebarClearBtn.addEventListener('click', () => {
        if (confirm('Clear all cached sessions?')) {
            clearAllSessions();
        }
    });

    const tagColors = {
        demand: { bg: '#d1fae5', color: '#059669' },
        pricing: { bg: '#fee2e2', color: '#dc2626' },
        margin: { bg: '#fee2e2', color: '#dc2626' },
        supply: { bg: '#fef3c7', color: '#d97706' },
        competition: { bg: '#fce7f3', color: '#db2777' },
        sentiment_positive: { bg: '#d1fae5', color: '#059669' },
        sentiment_negative: { bg: '#fee2e2', color: '#dc2626' },
        quality: { bg: '#e0f2fe', color: '#0284c7' },
        relationship: { bg: '#ede9fe', color: '#7c3aed' },
        schemes: { bg: '#ffedd5', color: '#ea580c' },
        customer_behavior: { bg: '#f1f5f9', color: '#475569' },
        loyalty: { bg: '#ede9fe', color: '#7c3aed' },
        general: { bg: '#f1f5f9', color: '#64748b' },
    };

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
    queryBtn.addEventListener('click', async () => {
        sendQuery();
    });
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

    // ---- Tab Switching ----
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
        });
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

    function showLoading() { loadingOverlay.classList.remove('hidden'); animateSteps(); }
    function hideLoading() { loadingOverlay.classList.add('hidden'); resetSteps(); }

    function showError(message) {
        const container = document.querySelector('.dashboard-section');
        let error = document.querySelector('.error-banner');
        if (!error) {
            error = document.createElement('div');
            error.className = 'error-banner';
            error.innerHTML = `<button onclick="this.parentElement.remove()">&times;</button>${message}`;
            container.insertBefore(error, container.firstChild);
        } else {
            error.textContent = message;
        }
    }

    function animateSteps() {
        const steps = document.querySelectorAll('.step');
        let current = 0;
        const interval = setInterval(() => {
            if (current > 0) { steps[current - 1].classList.remove('active'); steps[current - 1].classList.add('complete'); }
            if (current < steps.length) { steps[current].classList.add('active'); current++; }
            else clearInterval(interval);
        }, 1000);
    }
    function resetSteps() {
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active', 'complete'));
    }

    // ---- Dashboard Display ----


    // ---- Feedback Insights Dashboard (v2 - CSV-based) ----
    let _fbData = [];
    let _fbFiltered = [];

    const FB_LEVELS = ['trade', 'hcp', 'consumer'];

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

    async function loadFeedbackData() {
        try {
            const res = await fetch('/api/feedback-data');
            if (!res.ok) throw new Error('Failed to load feedback data');
            const json = await res.json();
            _fbData = json.data || [];
            _fbFiltered = [..._fbData];
            // Update sidebar datasource name
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
            if (result && !result.error && result.summary) {
                const el = document.getElementById('fbAiSummary');
                if (el) {
                    el.innerHTML = `<div class="fbi-ai-result"><p>${result.summary}</p>${result.insights && result.insights.what_is_working ? `<div class="fbi-ai-section"><h4>What's Working</h4><ul>${result.insights.what_is_working.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}${result.insights && result.insights.what_is_breaking ? `<div class="fbi-ai-section"><h4>Needs Improvement</h4><ul>${result.insights.what_is_breaking.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}</div>`;
                }
            }
        } catch (e) {
            console.warn('AI analysis of feedback data failed:', e);
        }
    }

    function renderFbEmptyState(msg) {
        ['fbKpiRow', 'fbRatingDist', 'fbWordCloud', 'fbAiSummary', 'fbTableBody']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<div class="fbi-empty">${msg || 'No data available'}</div>`;
            });
    }

    function getOpenEndedResponses(data) {
        const texts = [];
        data.forEach(r => {
            if (r.answer_text && r.answer_text.trim()) texts.push(r.answer_text.trim());
            if (r.voice_text && r.voice_text.trim()) texts.push(r.voice_text.trim());
        });
        return texts;
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
        if (texts.length === 0) return { summary: 'No open-ended responses available.', themes: [], sentiment: 'neutral' };

        const all = texts.join(' ').toLowerCase();
        const themes = [];

        const posWords = ['good', 'great', 'excellent', 'best', 'love', 'recommend', 'effective', 'helpful', 'satisfied', 'strong', 'fast', 'improved', 'trust', 'happy', 'impressed', 'reliable'];
        const negWords = ['improvement', 'expensive', 'missing', 'lack', 'poor', 'difficult', 'stockout', 'expensive', 'issue', 'problem', 'slow', 'weak', 'limited', 'confusing', 'unavailable'];

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

        let summary = '';
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

        const openEnded = getOpenEndedResponses(data);
        const wordFreq = buildWordFrequency(openEnded);
        const aiSummary = generateAiSummary(openEnded);

        const uniqueUsers = new Set(data.map(r => r.user_id != null ? String(r.user_id) : null).filter(Boolean));
        const uniqueOutlets = new Set(data.map(r => r.outlet_id != null ? String(r.outlet_id) : null).filter(Boolean));
        const uniqueVisits = new Set(data.map(r => r.visit_id));

        renderFbKpis(avgRating, totalRatings, uniqueVisits.size, uniqueUsers.size, uniqueOutlets.size);
        renderFbRatingDist(ratingsDist, totalRatings);
        renderFbWordCloud(wordFreq);
        renderFbAiSummary(aiSummary);
        renderFbTable(data);
    }

    function renderFbKpis(avgRating, totalRatings, totalVisits, totalUsers, totalOutlets) {
        const el = document.getElementById('fbKpiRow');
        if (!el) return;
        el.innerHTML = [
            { label: 'Average Rating', value: avgRating.toFixed(1), unit: '/5', sub: `${totalRatings} ratings collected`, icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`, cls: 'fbi-kpi-green' },
            { label: 'Total Visits', value: totalVisits, unit: '', sub: `${totalRatings} feedback entries`, icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, cls: 'fbi-kpi-blue' },
            { label: 'Unique Users', value: totalUsers, unit: '', sub: `field respondents`, icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, cls: 'fbi-kpi-amber' },
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
            if (!seen.has(key)) {
                seen.add(key);
                display.push(r);
            }
        });
        openEnded.forEach(r => {
            const key = r.visit_id + '-' + r.question_id;
            if (!seen.has(key)) {
                seen.add(key);
                display.push(r);
            }
        });

        display.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        const shown = display.slice(0, 200);

        body.innerHTML = shown.map(r => {
            const typeClass = r.level || 'trade';
            const ratingHtml = r.rating != null
                ? `<span class="fb-rating-pip" style="background:${['#dc2626','#f97316','#eab308','#84cc16','#22c55e'][r.rating - 1] || '#94a3b8'}">${r.rating}</span>`
                : '<span style="color:var(--text-tertiary);font-size:0.75rem">—</span>';
            const responseText = r.answer_text || r.voice_text || '';
            return `<tr>
                <td style="font-weight:600;font-size:0.8rem">#${r.visit_id}</td>
                <td><span class="fb-type-badge ${typeClass}">${typeClass}</span></td>
                <td style="font-size:0.8rem">#${r.outlet_id != null ? r.outlet_id : '—'}</td>
                <td style="font-size:0.8rem">#${r.user_id != null ? r.user_id : '—'}</td>
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
        const user = document.getElementById('fbFilterUser')?.value || 'all';
        const dateRange = document.getElementById('fbFilterDate')?.value || 'all';

        let filtered = [..._fbData];

        if (level !== 'all') {
            filtered = filtered.filter(r => r.level === level);
        }

        if (outlet !== 'all') {
            filtered = filtered.filter(r => r.outlet_id != null && String(r.outlet_id) === outlet);
        }

        if (user !== 'all') {
            filtered = filtered.filter(r => r.user_id != null && String(r.user_id) === user);
        }

        if (dateRange !== 'all') {
            const now = new Date('2026-05-21');
            let cutoff = new Date(now);
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
        const anyFilterActive = level !== 'all' || outlet !== 'all' || user !== 'all' || dateRange !== 'all';

        if (anyFilterActive && badge && badgeText) {
            const parts = [];
            if (level !== 'all') parts.push(level.toUpperCase());
            if (outlet !== 'all') parts.push('Outlet #' + outlet);
            if (user !== 'all') parts.push('User #' + user);
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
        const users = new Set();
        _fbData.forEach(r => {
            if (r.outlet_id != null) outlets.add(String(r.outlet_id));
            if (r.user_id != null) users.add(String(r.user_id));
        });

        const outletSel = document.getElementById('fbFilterOutlet');
        if (outletSel) {
            outletSel.innerHTML = '<option value="all">All Outlets</option>';
            [...outlets].sort((a, b) => Number(a) - Number(b)).forEach(o => {
                const opt = document.createElement('option');
                opt.value = o; opt.textContent = 'Outlet #' + o;
                outletSel.appendChild(opt);
            });
        }

        const userSel = document.getElementById('fbFilterUser');
        if (userSel) {
            userSel.innerHTML = '<option value="all">All Users</option>';
            [...users].sort((a, b) => Number(a) - Number(b)).forEach(u => {
                const opt = document.createElement('option');
                opt.value = u; opt.textContent = 'User #' + u;
                userSel.appendChild(opt);
            });
        }
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
    document.getElementById('fbFilterUser')?.addEventListener('change', applyFeedbackFilters);
    document.getElementById('fbFilterDate')?.addEventListener('change', applyFeedbackFilters);

    document.getElementById('fbFilterClearBtn')?.addEventListener('click', () => {
        document.querySelectorAll('.fb-level-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.fb-level-btn[data-level="all"]')?.classList.add('active');
        document.getElementById('fbFilterOutlet').value = 'all';
        document.getElementById('fbFilterUser').value = 'all';
        document.getElementById('fbFilterDate').value = 'all';
        applyFeedbackFilters();
    });

    // Download CSV
    document.getElementById('fbDownloadBtn')?.addEventListener('click', () => {
        const data = _fbFiltered;
        if (!data.length) return;
        const headers = ['visit_id','level','outlet_id','user_id','rating','answer_text','voice_text','created_at'];
        let csv = headers.join(',') + '\n';
        data.forEach(r => {
            const row = headers.map(h => {
                const val = r[h] || '';
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

    // Bootstrap feedback dashboard
    loadFeedbackData();
    renderSidebar();
    renderPresets();

    // ---- Handle API errors in chat ----
    function handleChatError(err) {
        if (err.message.includes('401') || err.message.includes('Unauthorized')) {
            return '⚠️ **AI Assistant Offline** — The LLM API key is invalid. Check your `.env` file.\n\nThe feedback dashboard is fully functional.';
        }
        if (err.message.includes('429') || err.message.includes('Too Many Requests')) {
            return '⚠️ **Rate limited** — Too many requests. Wait a moment and try again.\n\nThe feedback dashboard works independently.';
        }
        if (err.message.includes('400') || err.message.includes('No collection ID')) {
            return '⚠️ **No document to query against.** Upload a file via the sidebar.';
        }
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            return '⚠️ **Connection Error** — Could not reach the AI server.\n\nThe feedback dashboard works independently.';
        }
        return `⚠️ **Error:** ${err.message}`;
    }

    async function sendQuery() {
        const query = queryInput.value.trim();
        const session = getSession(activeSessionId);
        if (!query) return;

        appendUserMessage(query);
        queryInput.value = '';

        if (!session) {
            const feedbackText = getOpenEndedResponses(_fbData);
            if (feedbackText.length > 0) {
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
                }
                queryBtn.disabled = false;
                return;
            }
            appendAIMessage('No feedback data to query against. Upload a file for document Q&A.');
            queryBtn.disabled = false;
            return;
        }

        const loadingId = appendLoadingMessage();
        queryBtn.disabled = true;

        try {
            let response;
            const model = 'big-pickle';
            if (session.collectionId) {
                response = await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ collection_id: session.collectionId, query, model }),
                });
            } else {
                response = await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: (session.fileText || '').slice(0, 200000), query, model }),
                });
            }
            if (!response.ok) {
                const ct = response.headers.get('content-type');
                if (ct && ct.includes('application/json')) {
                    const err = await response.json();
                    throw new Error(err.detail || `Server error: ${response.status}`);
                }
                throw new Error(`Server error: ${response.status}`);
            }
            const data = await response.json();
            removeLoadingMessage(loadingId);
            if (data.answer && data.answer.startsWith('[Analysis unavailable:')) {
                appendAIMessage(handleChatError(new Error('429')));
            } else {
                appendAIMessage(data.answer);
            }
        } catch (error) {
            removeLoadingMessage(loadingId);
            appendAIMessage(handleChatError(error));
        } finally {
            queryBtn.disabled = false;
        }
    }
});
