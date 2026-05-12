document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const uploadForm = document.getElementById('uploadForm');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const dashboardSection = document.getElementById('dashboardSection');
    const uploadLanding = document.getElementById('uploadLanding');
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
        const session = getSession(id);
        if (session && session.data) displayDashboard(session.data);
    }

    function removeSession(id) {
        sessions = sessions.filter(s => s.id !== id);
        saveSessions();
        renderSidebar();
        if (sessions.length === 0) {
            appLayout.classList.add('hidden');
            appHeader.classList.add('hidden');
            uploadLanding.classList.remove('hidden');
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
        pendingFiles = [];
        updateFileList();
        fileInput.value = '';
        queryInput.value = '';
        uploadLanding.classList.remove('hidden');
        appLayout.classList.add('hidden');
        appHeader.classList.add('hidden');
        if (chatMessages) chatMessages.innerHTML = '';
        if (queryPresets) queryPresets.innerHTML = '';
    });

    const seeTestBtn = document.getElementById('seeTestBtn');
    if (seeTestBtn) {
        seeTestBtn.addEventListener('click', () => {
            seeTestBtn.disabled = true;
            loadDefaultSession().finally(() => { seeTestBtn.disabled = false; });
        });
    }

    sidebarClearBtn.addEventListener('click', () => {
        if (confirm('Clear all cached sessions?')) {
            clearAllSessions();
            uploadLanding.classList.remove('hidden');
            appLayout.classList.add('hidden');
            appHeader.classList.add('hidden');
        }
    });

    // ---- File Upload ----
    function updateFileList() {
        const fileList = document.getElementById('fileList');
        const dropContent = dropZone.querySelector('.drop-content');
        if (pendingFiles.length === 0) {
            fileList.classList.add('hidden');
            dropContent.classList.remove('hidden');
            analyzeBtn.disabled = true;
            return;
        }
        dropContent.classList.add('hidden');
        fileList.classList.remove('hidden');
        fileList.innerHTML = pendingFiles.map((f, i) => `
            <div class="file-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                </svg>
                <span class="file-item-name">${f.name}</span>
                <button type="button" class="file-item-remove" data-index="${i}">&times;</button>
            </div>
        `).join('');
        analyzeBtn.disabled = false;

        fileList.querySelectorAll('.file-item-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                pendingFiles.splice(parseInt(btn.dataset.index), 1);
                updateFileList();
            });
        });
    }

    function handleFileSelect(files) {
        for (const f of files) {
            if (!pendingFiles.find(p => p.name === f.name && p.size === f.size)) {
                pendingFiles.push(f);
            }
        }
        updateFileList();
    }

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFileSelect(e.target.files); });

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

    // ---- Chat Sidebar ----
    queryBtn.addEventListener('click', async () => {
        sendQuery();
    });
    queryInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !queryBtn.disabled) sendQuery(); });

    function isDemoSession(session) {
        return session && session.collectionId === 'default_demo_session';
    }

    function resolveDemoQuery(query, data) {
        if (!data) return 'No demo data available.';
        const normalize = (s) => s.toLowerCase().trim().replace(/[?.!,]+$/g, '').replace(/\s+/g, ' ');
        const qa = data.qa || [];
        const nq = normalize(query);

        for (const item of qa) {
            if (normalize(item.question) === nq) return item.answer;
        }
        for (const item of qa) {
            const tokens = normalize(item.question).split(' ').filter(w => w.length > 4);
            const overlap = tokens.filter(t => nq.includes(t)).length;
            if (tokens.length && overlap / tokens.length >= 0.5) return item.answer;
        }

        const out = [];
        if (/\b(product|sku|brand|sensodyne|panadol|voltaren|centrum|otrivin|haleon)\b/i.test(query)) {
            const items = (data.products || []).slice(0, 4);
            if (items.length) out.push('**Products in this conversation:**\n' + items.map(p => `- **${p.name}** _(${p.performance})_: ${p.feedback}`).join('\n'));
        }
        if (/\b(risk|threat|danger|concern|exposure)\b/i.test(query)) {
            const items = (data.risks || []).slice(0, 4);
            if (items.length) out.push('**Top risks:**\n' + items.map(r => `- _[${r.severity}]_ ${r.flag}`).join('\n'));
        }
        if (/\b(opportunit|growth|upside|expand|launch)\b/i.test(query)) {
            const items = (data.opportunities || []).slice(0, 4);
            if (items.length) out.push('**Top opportunities:**\n' + items.map(o => `- ${o.opportunity}${o.quick_win ? ' _(quick win)_' : ''}`).join('\n'));
        }
        if (/\b(compet|colgate|himalaya|generic|crocin|share)\b/i.test(query)) {
            const items = (data.competitive_intel || []).slice(0, 4);
            if (items.length) out.push('**Competitive landscape:**\n' + items.map(c => `- **${c.competitor_or_channel}**: ${c.details}`).join('\n'));
        }
        if (/\b(action|next step|do|plan|playbook)\b/i.test(query)) {
            const items = (data.action_items || []).slice(0, 5);
            if (items.length) out.push('**Recommended actions:**\n' + items.map(a => `- _[${a.urgency.replace('_', ' ')}]_ ${a.action}`).join('\n'));
        }
        if (/\b(pain|issue|problem|blocker|stockout)\b/i.test(query)) {
            const items = (data.pain_points || []).slice(0, 4);
            if (items.length) out.push('**Pain points:**\n' + items.map(p => `- _[${p.impact}]_ ${p.issue} — _${p.suggested_action}_`).join('\n'));
        }
        if (/\b(sentiment|tone|mood|positive|negative)\b/i.test(query) && data.sentiment) {
            const s = data.sentiment;
            out.push(`**Sentiment:** ${s.overall.replace('_', ' ')} (${Math.round(s.score*100)}%)\n\n${s.nuance || ''}`);
        }
        if (/\b(summary|tldr|overview|recap)\b/i.test(query) && data.summary) {
            out.push(`**Summary:** ${data.summary}`);
        }

        if (out.length) return out.join('\n\n');

        return `I'm working from cached insights for this **demo session**. Try one of the suggested questions above, or ask about:\n\n- **Products** — Sensodyne, Panadol, Voltaren, Centrum, Otrivin\n- **Risks** and threats to the business\n- **Opportunities** for growth\n- **Competition** — Colgate, Himalaya, generics\n- **Action items** and next steps\n- **Pain points** and issues\n\n_For full LLM-powered Q&A, upload your own transcript via "New Analysis"._`;
    }

    async function sendQuery() {
        const query = queryInput.value.trim();
        const session = getSession(activeSessionId);
        if (!query || !session) return;

        appendUserMessage(query);
        queryInput.value = '';

        if (isDemoSession(session)) {
            const loadingId = appendLoadingMessage();
            queryBtn.disabled = true;
            await new Promise(r => setTimeout(r, 700));
            removeLoadingMessage(loadingId);
            appendAIMessage(resolveDemoQuery(query, session.data));
            queryBtn.disabled = false;
            return;
        }

        const loadingId = appendLoadingMessage();
        queryBtn.disabled = true;

        try {
            let response;
            if (session.collectionId) {
                response = await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ collection_id: session.collectionId, query, model: document.getElementById('modelSelect').value }),
                });
            } else {
                response = await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: (session.fileText || '').slice(0, 200000), query, model: document.getElementById('modelSelect').value }),
                });
            }
            if (!response.ok) {
                const ct = response.headers.get('content-type');
                if (ct && ct.includes('application/json')) {
                    const err = await response.json(); throw new Error(err.detail || 'Query failed');
                }
                throw new Error(`Server error: ${response.status}`);
            }
            const data = await response.json();
            removeLoadingMessage(loadingId);
            appendAIMessage(data.answer);
        } catch (error) {
            removeLoadingMessage(loadingId);
            appendAIMessage(`Error: ${error.message}`);
        } finally { queryBtn.disabled = false; }
    }

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

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (pendingFiles.length === 0) return;
        showLoading();

        for (const file of pendingFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model', document.getElementById('modelSelect').value);
            try {
                const response = await fetch('/api/analyze', { method: 'POST', body: formData });
                if (!response.ok) {
                    const ct = response.headers.get('content-type');
                    if (ct && ct.includes('application/json')) {
                        const err = await response.json(); throw new Error(err.detail || 'Analysis failed');
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
                showError(`Failed to analyze ${file.name}: ${error.message}`);
                return;
            }
        }

        pendingFiles = [];
        fileInput.value = '';
        updateFileList();
        activateSession(sessions[sessions.length - 1].id);
    });

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
        uploadLanding.classList.add('hidden');
        appLayout.classList.remove('hidden');
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
    function displayDashboard(data) {
        try {
        hideLoading();
        uploadLanding.classList.add('hidden');
        appLayout.classList.remove('hidden');
        appHeader.classList.remove('hidden');

        setStoredPhrases(data.key_phrases || []);

        // Overview Tab (merged Overview + Scores)
        renderStoryBanner(data.summary);
        populateFilters(data);
        renderBusinessMetrics(data.metrics, data.sentiment);
        renderSentiment(data.sentiment);
        renderCategoryScores(data.categories);

        // Revenue Tab
        renderRevenueMap(data.revenue_map);
        renderRisks(data.risks);

        // Insights Tab
        renderSectionIfExists('productsList', data.products, renderProducts);
        renderSectionIfExists('causeEffectList', data.cause_effect, renderCauseEffect);
        renderDecisionInsights(data.insights);
        renderSectionIfExists('painpointsList', data.pain_points || [], renderPainPoints);
        renderSectionIfExists('opportunitiesList', data.opportunities, renderOpportunities);
        renderSectionIfExists('competitiveList', data.competitive_intel, renderCompetitiveIntelligence);
        renderSectionIfExists('actionsList', data.action_items, renderActionItems);

        // Key Phrases Tab
        renderKeyPhrases(data.key_phrases);

        // Query Presets
        const qaList = Array.isArray(data.qa) ? data.qa : [];
        renderQueryPresets(qaList);

        } catch (err) {
            console.error('displayDashboard error:', err);
            hideLoading();
            showError('Dashboard render error: ' + err.message);
        }
    }

    function renderSectionIfExists(containerId, items, renderFn) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const card = el.closest('.card');
        if (!items || !Array.isArray(items) || items.length === 0) {
            if (card) card.style.display = 'none';
            return;
        }
        if (card) card.style.display = '';
        renderFn(items);
    }

    function populateFilters(data) {
        const products = data.products || [];
        const productSet = new Set(products.map(p => p.name).filter(Boolean));

        const filterProduct = document.getElementById('filterProduct');
        if (filterProduct) {
            filterProduct.innerHTML = '<option value="all">All</option>';
            productSet.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p; opt.textContent = p;
                filterProduct.appendChild(opt);
            });
        }
    }

    function renderStoryBanner(summary) {
        const subtitle = document.getElementById('overviewSubtitle');
        if (subtitle && summary) {
            subtitle.textContent = summary;
        }
    }

    function goodColor(val) {
        if (!val && val !== 0) return 'var(--neutral)';
        const r = Math.round(220 - (val / 10) * 165);
        const g = Math.round(75 + (val / 10) * 113);
        return `rgb(${r}, ${g}, 75)`;
    }

    function riskColor(val) {
        if (!val && val !== 0) return 'var(--neutral)';
        const r = Math.round(55 + (val / 10) * 165);
        const g = Math.round(188 - (val / 10) * 113);
        return `rgb(${r}, ${g}, 75)`;
    }

    function formatLabel(key) {
        if (!key) return '';
        return key.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function scoreGradient(ratio) {
        const r = Math.round(180 - ratio * 125);
        const g = Math.round(30 + ratio * 140);
        const b = Math.round(30 + ratio * 30);
        return `rgb(${r}, ${g}, ${b})`;
    }

    function sentimentGradient(ratio) {
        const r = Math.round(180 - ratio * 125);
        const g = Math.round(30 + ratio * 140);
        const b = Math.round(30 + ratio * 30);
        return `rgb(${r}, ${g}, ${b})`;
    }

    function scoreTextColor(ratio) {
        return '#ffffff';
    }

    function renderSentiment(sentiment) {
        const card = document.getElementById('sentimentCard');
        if (!sentiment) { if (card) card.style.display = 'none'; return; }
        if (card) card.style.display = '';

        const score = sentiment.score || 0.5;
        const overall = sentiment.overall || 'mixed';
        const percent = Math.round(score * 100);

        document.getElementById('sentimentFill').style.width = percent + '%';
        const color = sentimentGradient(score);
        document.getElementById('sentimentFill').style.background = color;
        document.getElementById('sentimentLabel').textContent = formatLabel(overall);
        document.getElementById('sentimentLabel').style.color = color;
        document.getElementById('sentimentScore').textContent = `${percent}%`;

        const nuanceEl = document.getElementById('sentimentNuance');
        if (sentiment.nuance) {
            nuanceEl.textContent = sentiment.nuance; nuanceEl.style.display = 'block';
        } else { nuanceEl.style.display = 'none'; }

        const breakdown = document.getElementById('sentimentBreakdown');
        breakdown.innerHTML = '';
        const items = sentiment.breakdown || {};
        Object.entries(items).forEach(([key, value]) => {
            const el = document.createElement('div');
            el.className = 'sentiment-item';
            el.innerHTML = `
                <span>${formatLabel(key)}</span>
                <span class="sentiment-badge ${value}">${formatLabel(value)}</span>
            `;
            breakdown.appendChild(el);
        });
    }

    function renderCategoryScores(categories) {
        const container = document.getElementById('scoreBars');
        container.innerHTML = '';
        if (!Array.isArray(categories) || categories.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">No categories detected</p>';
            return;
        }

        categories.forEach((cat, i) => {
            const el = document.createElement('div');
            el.className = `score-bar-item stagger-${Math.min(i + 1, 7)}`;
            const pct = Math.round((cat.score / 10) * 100);
            const scoreVal = cat.score || 0;
            const barColor = goodColor(scoreVal);
            el.innerHTML = `
                <div class="score-bar-header">
                    <span class="score-bar-label">${formatLabel(cat.name)}</span>
                    <span class="score-bar-value" style="color: ${barColor}">${cat.score.toFixed(1)}/10</span>
                </div>
                <div class="score-bar-track">
                    <div class="score-bar-fill" style="width: ${pct}%; background: ${barColor}"></div>
                </div>
                <div class="score-bar-sentiment">
                    <span class="sentiment-badge ${cat.sentiment}">${formatLabel(cat.sentiment)}</span>
                    &nbsp;|&nbsp; <span class="severity-badge ${cat.severity}">${formatLabel(cat.severity)}</span>
                    <div style="margin-top:6px;font-size:0.75rem;color:var(--text-tertiary);">${cat.description || cat.evidence || ''}</div>
                </div>
            `;
            container.appendChild(el);
        });
    }

    function renderBusinessMetrics(metrics, sentiment) {
        const container = document.getElementById('derivedMetrics');
        const card = document.getElementById('businessMetricsCard');
        container.innerHTML = '';
        if (!metrics && !sentiment) { return; }

        const icons = {
            sentiment: '&#128524;',
            demand_index: '&#128200;', margin_stress: '&#128176;',
            supply_risk: '&#128666;', retailer_advocacy: '&#129309;',
            price_sensitivity: '&#128178;', channel_shift: '&#128256;',
            brand_loyalty: '&#127942;',
        };

        const invertMetrics = ['margin_stress', 'supply_risk', 'price_sensitivity', 'channel_shift'];

        if (sentiment && sentiment.score != null) {
            const el = document.createElement('div');
            el.className = 'derived-item';
            const score = Math.round(sentiment.score * 10);
            const color = goodColor(score);
            const label = formatLabel(sentiment.overall || 'mixed');
            el.innerHTML = `
                <span class="derived-icon">${icons.sentiment}</span>
                <div class="derived-content">
                    <div class="derived-label">Sentiment</div>
                    <span class="derived-level" style="background: ${color}22; color: ${color};">${score}/10 — ${label}</span>
                    <div class="derived-logic">${sentiment.nuance || ''}</div>
                </div>
            `;
            container.appendChild(el);
        }

        Object.entries(metrics || {}).forEach(([key, data]) => {
            if (!data || data.value == null) return;
            if (!data.reasoning || data.reasoning.trim().split(/\s+/).length < 8) return;
            const el = document.createElement('div');
            el.className = 'derived-item';
            const val = data.value;
            const isInverted = invertMetrics.includes(key);
            const color = isInverted ? riskColor(val) : goodColor(val);
            el.innerHTML = `
                <span class="derived-icon">${icons[key] || '&#128202;'}</span>
                <div class="derived-content">
                    <div class="derived-label">${formatLabel(key)}</div>
                    <span class="derived-level" style="background: ${color}22; color: ${color};">${data.value.toFixed(1)}/10</span>
                    <div class="derived-logic">${data.reasoning || ''}</div>
                </div>
            `;
            container.appendChild(el);
        });
    }

    function renderRevenueMap(revenueMap) {
        const grid = document.getElementById('revenueGrid');
        const subtitle = document.getElementById('revenueSubtitle');
        const card = grid.closest('.card');
        grid.innerHTML = '';

        if (!revenueMap || !revenueMap.relevant || revenueMap.confidence < 0.3) {
            if (card) card.style.display = 'none';
            if (subtitle) subtitle.textContent = 'Insufficient revenue signals in this conversation';
            return;
        }
        if (card) card.style.display = '';
        if (subtitle) subtitle.textContent = `Confidence: ${Math.round(revenueMap.confidence * 100)}% — Actions categorized by revenue impact`;

        const sectionConfig = [
            { key: 'must_sell', title: 'Must Sell', icon: '&#128293;', cls: 'must-sell' },
            { key: 'upsell', title: 'Upsell', icon: '&#128200;', cls: 'upsell' },
            { key: 'cross_sell', title: 'Cross Sell', icon: '&#128256;', cls: 'cross-sell' },
            { key: 'pain_points', title: 'Pain Points', icon: '&#9888;', cls: 'pain-points' },
            { key: 'improve_strategy', title: 'Improve Strategy', icon: '&#128295;', cls: 'improve-strategy' },
            { key: 'think_over_selling', title: 'Rethink Approach', icon: '&#129300;', cls: 'think-over' },
        ];

        sectionConfig.forEach(section => {
            const items = revenueMap[section.key] || [];
            if (!items.length) return;
            const el = document.createElement('div');
            el.className = `revenue-card ${section.cls}`;
            el.innerHTML = `
                <div class="revenue-card-header">
                    <span class="revenue-card-icon">${section.icon}</span>
                    <span class="revenue-card-title">${section.title}</span>
                </div>
                <ul class="revenue-card-list">
                    ${items.map(item => `<li>${item}</li>`).join('')}
                </ul>
            `;
            grid.appendChild(el);
        });
    }

    function renderRisks(risks) {
        const container = document.getElementById('risksList');
        const card = document.getElementById('risksCard');
        container.innerHTML = '';
        if (!Array.isArray(risks) || risks.length === 0) {
            if (card) card.style.display = 'none';
            return;
        }
        if (card) card.style.display = '';

        risks.forEach(risk => {
            const el = document.createElement('div');
            el.className = `risk-item ${risk.severity}`;
            el.innerHTML = `
                <div class="risk-content">
                    <div class="risk-text">${risk.flag}</div>
                    <div class="risk-meta">
                        <span class="risk-severity ${risk.severity}">${risk.severity}</span>
                        ${risk.risk_type ? `<span class="risk-type">${formatLabel(risk.risk_type)}</span>` : ''}
                        ${risk.is_conditional ? `<span class="risk-conditional">Conditional</span>` : ''}
                    </div>
                    ${risk.condition ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; font-style: italic;">Condition: ${risk.condition}</div>` : ''}
                </div>
            `;
            container.appendChild(el);
        });
    }

    function renderProducts(products) {
        const container = document.getElementById('productsList');
        container.innerHTML = '';
        products.forEach(product => {
            const el = document.createElement('div');
            el.className = 'product-item';
            const metaTags = [];
            if (product.performance) metaTags.push(`<span class="product-meta-tag ${product.performance}">${formatLabel(product.performance)}</span>`);
            if (product.demand_level) metaTags.push(`<span class="product-meta-tag ${product.demand_level.toLowerCase().replace(/[-\s]/g, '-')}">Demand: ${product.demand_level}</span>`);
            if (product.substitution_risk) metaTags.push(`<span class="product-meta-tag ${product.substitution_risk.toLowerCase().replace(/[-\s]/g, '-')}">Sub. Risk: ${product.substitution_risk}</span>`);
            el.innerHTML = `
                <div class="product-header">
                    <span class="product-name">${product.name}</span>
                    <div class="product-meta">${metaTags.join('')}</div>
                </div>
                <p class="product-feedback">${product.feedback || ''}</p>
            `;
            container.appendChild(el);
        });
    }

    function renderCauseEffect(mappings) {
        const container = document.getElementById('causeEffectList');
        container.innerHTML = '';
        mappings.forEach(mapping => {
            const el = document.createElement('div');
            el.className = 'cause-effect-item';
            el.innerHTML = `
                <div class="cause-arrow">&#8594;</div>
                <div class="cause-effect-content">
                    <div class="cause-text">Cause: ${mapping.cause}</div>
                    <div class="effect-text">Effect: ${mapping.effect}</div>
                    ${mapping.evidence ? `<div class="cause-effect-evidence">"${mapping.evidence}"</div>` : ''}
                </div>
            `;
            container.appendChild(el);
        });
    }

    function renderDecisionInsights(insights) {
        const grid = document.getElementById('decisionsGrid');
        const card = document.getElementById('decisionsCard');
        grid.innerHTML = '';
        if (!insights) { if (card) card.style.display = 'none'; return; }

        const sections = [
            { key: 'what_is_working', title: 'What Is Working', cls: 'working' },
            { key: 'what_is_breaking', title: 'What Is Breaking', cls: 'breaking' },
            { key: 'hidden_signals', title: 'Hidden Signals', cls: 'hidden-signals' },
        ];
        let hasContent = false;
        sections.forEach(section => {
            const items = insights[section.key];
            if (!items || !items.length) return;
            hasContent = true;
            const sectionEl = document.createElement('div');
            sectionEl.className = `decision-section ${section.cls}`;
            sectionEl.innerHTML = `<h4>${section.title}</h4>`;
            const list = document.createElement('div');
            list.className = 'decision-list';
            items.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'decision-item';
                itemEl.textContent = item;
                list.appendChild(itemEl);
            });
            sectionEl.appendChild(list);
            grid.appendChild(sectionEl);
        });
        if (card) card.style.display = hasContent ? '' : 'none';
    }

    function renderPainPoints(items) {
        const container = document.getElementById('painpointsList');
        container.innerHTML = '';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = `painpoint-item ${item.impact}`;
            el.innerHTML = `
                <div class="item-title">${item.issue}</div>
                ${item.root_cause ? `<div class="item-root-cause">Root Cause: ${item.root_cause}</div>` : ''}
                <span class="sentiment-badge ${item.impact === 'high' ? 'negative' : item.impact === 'medium' ? 'neutral' : 'positive'}">${item.impact} impact</span>
                <div class="item-action">Suggested: ${item.suggested_action}</div>
            `;
            container.appendChild(el);
        });
    }

    function renderOpportunities(items) {
        const container = document.getElementById('opportunitiesList');
        container.innerHTML = '';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = `opportunity-item ${item.potential}`;
            el.innerHTML = `
                <div class="item-title">${item.opportunity}</div>
                <span class="sentiment-badge positive">${item.potential} potential</span>
                ${item.quick_win ? '<span class="quick-win-badge">Quick Win</span>' : ''}
                <div class="item-action">Requirements: ${item.requirements}</div>
            `;
            container.appendChild(el);
        });
    }

    function renderCompetitiveIntelligence(items) {
        const container = document.getElementById('competitiveList');
        container.innerHTML = '';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'competitive-item';
            el.innerHTML = `
                <div class="competitor-name">${item.competitor_or_channel}</div>
                <span class="threat-type">${formatLabel(item.threat_type)}</span>
                <div class="product-feedback">${item.details}</div>
                ${item.customer_behavior_shift ? `<div class="behavior-shift">&#128101; Behavior Shift: ${item.customer_behavior_shift}</div>` : ''}
            `;
            container.appendChild(el);
        });
    }

    function renderActionItems(items) {
        const container = document.getElementById('actionsList');
        container.innerHTML = '';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'action-item';
            el.innerHTML = `
                <input type="checkbox" class="action-checkbox">
                <span class="action-text">${item.action}</span>
                <div class="action-meta">
                    <span class="action-urgency ${item.urgency}">${item.urgency.replace('_', ' ')}</span>
                </div>
            `;
            container.appendChild(el);
        });
    }

    function renderQueryPresets(qaList) {
        if (!queryPresets) return;
        queryPresets.innerHTML = '';
        if (!Array.isArray(qaList) || qaList.length === 0) return;

        qaList.slice(0, 4).forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'chat-preset-btn';
            btn.textContent = item.question;
            btn.addEventListener('click', () => {
                queryInput.value = item.question;
                sendQuery();
            });
            queryPresets.appendChild(btn);
        });
    }

    function renderKeyPhrases(phrases) {
        const body = document.getElementById('phraseTableBody');
        const card = body.closest('.card');
        body.innerHTML = '';
        if (!Array.isArray(phrases) || phrases.length === 0) {
            if (card) card.style.display = 'none';
            return;
        }
        if (card) card.style.display = '';

        const tagCounts = {};
        phrases.forEach(item => {
            (item.tags || []).forEach(t => {
                tagCounts[t] = (tagCounts[t] || 0) + 1;
            });
        });
        renderPhraseCloud(tagCounts, phrases);

        phrases.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.style.animationDelay = `${i * 0.05}s`;
            const scoreColor = goodColor(item.score || 0);
            tr.innerHTML = `
                <td class="phrase-text">${item.text || ''}</td>
                <td><span class="phrase-score" style="background: ${scoreColor}22; color: ${scoreColor};">${(item.score || 0).toFixed(1)}/10</span></td>
                <td class="phrase-tags">${(item.tags || []).map(t => {
                    const colors = tagColors[t] || tagColors.general;
                    return `<span style="display:inline-block;margin:2px;padding:2px 6px;border-radius:4px;font-size:0.7rem;background:${colors.bg};color:${colors.color};">${formatLabel(t)}</span>`;
                }).join('')}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${item.context || ''}</td>
            `;
            body.appendChild(tr);
        });
    }

    function renderPhraseCloud(tagCounts, allPhrases) {
        const cloud = document.getElementById('phraseCloud');
        if (!cloud) return;
        cloud.innerHTML = '';

        const activeTags = new Set();

        Object.entries(tagCounts).forEach(([tag, count], i) => {
            const el = document.createElement('span');
            el.className = 'phrase-cloud-tag';
            el.style.animationDelay = `${i * 0.06}s`;
            const colors = tagColors[tag] || tagColors.general;
            el.style.background = colors.bg;
            el.style.color = colors.color;
            el.innerHTML = `${formatLabel(tag)}<span class="tag-count">${count}</span>`;
            el.dataset.tag = tag;

            el.addEventListener('click', () => {
                if (activeTags.has(tag)) {
                    activeTags.delete(tag);
                    el.classList.remove('active');
                } else {
                    activeTags.add(tag);
                    el.classList.add('active');
                }
                filterPhraseTable(activeTags, allPhrases);
                updateActiveFilterChips(activeTags);
            });

            cloud.appendChild(el);
        });

        document.getElementById('clearFilterBtn')?.addEventListener('click', () => {
            activeTags.clear();
            cloud.querySelectorAll('.phrase-cloud-tag').forEach(t => t.classList.remove('active'));
            filterPhraseTable(activeTags, allPhrases);
            updateActiveFilterChips(activeTags);
        });
    }

    function filterPhraseTable(activeTags, allPhrases) {
        const body = document.getElementById('phraseTableBody');
        const emptyState = document.getElementById('phraseTableEmpty');
        const tableWrap = document.querySelector('.phrase-table-wrap');
        body.innerHTML = '';

        if (activeTags.size === 0) {
            tableWrap?.classList.remove('hidden');
            emptyState?.classList.add('hidden');
            allPhrases.forEach((item, i) => {
                const tr = document.createElement('tr');
                tr.style.animationDelay = `${i * 0.05}s`;
                const scoreColor = goodColor(item.score || 0);
                tr.innerHTML = `
                    <td class="phrase-text">${item.text || ''}</td>
                    <td><span class="phrase-score" style="background: ${scoreColor}22; color: ${scoreColor};">${(item.score || 0).toFixed(1)}/10</span></td>
                    <td class="phrase-tags">${(item.tags || []).map(t => {
                        const colors = tagColors[t] || tagColors.general;
                        return `<span style="display:inline-block;margin:2px;padding:2px 6px;border-radius:4px;font-size:0.7rem;background:${colors.bg};color:${colors.color};">${formatLabel(t)}</span>`;
                    }).join('')}</td>
                    <td style="font-size:0.8rem;color:var(--text-secondary);">${item.context || ''}</td>
                `;
                body.appendChild(tr);
            });
            return;
        }

        const filtered = allPhrases.filter(p => (p.tags || []).some(t => activeTags.has(t)));
        if (filtered.length === 0) {
            tableWrap?.classList.add('hidden');
            emptyState?.classList.remove('hidden');
            return;
        }

        tableWrap?.classList.remove('hidden');
        emptyState?.classList.add('hidden');
        filtered.forEach((item, i) => {
            const tr = document.createElement('tr');
            tr.style.animationDelay = `${i * 0.05}s`;
            const scoreColor = goodColor(item.score || 0);
            tr.innerHTML = `
                <td class="phrase-text">${item.text || ''}</td>
                <td><span class="phrase-score" style="background: ${scoreColor}22; color: ${scoreColor};">${(item.score || 0).toFixed(1)}/10</span></td>
                <td class="phrase-tags">${(item.tags || []).map(t => {
                    const colors = tagColors[t] || tagColors.general;
                    return `<span style="display:inline-block;margin:2px;padding:2px 6px;border-radius:4px;font-size:0.7rem;background:${colors.bg};color:${colors.color};">${formatLabel(t)}</span>`;
                }).join('')}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${item.context || ''}</td>
            `;
            body.appendChild(tr);
        });
    }

    function updateActiveFilterChips(activeTags) {
        const container = document.getElementById('activeFilters');
        if (!container) return;
        container.innerHTML = '';
        activeTags.forEach(tag => {
            const chip = document.createElement('span');
            chip.className = 'active-filter-chip';
            chip.innerHTML = `${formatLabel(tag)}<button data-tag="${tag}">&times;</button>`;
            chip.querySelector('button').addEventListener('click', () => {
                activeTags.delete(tag);
                const cloudTag = document.querySelector(`.phrase-cloud-tag[data-tag="${tag}"]`);
                if (cloudTag) cloudTag.classList.remove('active');
                const allPhrases = getStoredPhrases();
                filterPhraseTable(activeTags, allPhrases);
                updateActiveFilterChips(activeTags);
            });
            container.appendChild(chip);
        });
    }

    let _storedPhrases = [];
    function getStoredPhrases() { return _storedPhrases; }
    function setStoredPhrases(phrases) { _storedPhrases = phrases || []; }

    // ---- Feedback Insights Dashboard ----
    const FEEDBACK_SAMPLE_DATA = [
        { channel:'pharmacy', channelLabel:'Pharmacy Store', date:'2026-03-05', q1:4, q2:3, q3:4, working_well:'Strong Sensodyne brand presence at eye level; pharmacist actively recommending Panadol', opportunities:'Digital interactive displays missing; limited Voltaren visibility vs Ibuprofen' },
        { channel:'pharmacy', channelLabel:'Pharmacy Store', date:'2026-03-12', q1:3, q2:2, q3:3, working_well:'Good secondary placement for Otrivin; loyalty program awareness growing', opportunities:'Tech integration for reorder tracking weak; assortment gaps in rural SKUs' },
        { channel:'pharmacy', channelLabel:'Pharmacy Store', date:'2026-03-20', q1:5, q2:3, q3:5, working_well:'Best-in-class planogram execution; Sensodyne dominates toothpaste fixture', opportunities:'Need digital shelf labels and tech-enabled stock alerts' },
        { channel:'pharmacy', channelLabel:'Pharmacy Store', date:'2026-04-01', q1:4, q2:4, q3:4, working_well:'In-store health advisor proactively recommending Centrum and Sensodyne', opportunities:'Competitor Colgate gaining shelf space in mid-tier pharmacies' },
        { channel:'pharmacy', channelLabel:'Pharmacy Store', date:'2026-04-10', q1:3, q2:2, q3:3, working_well:'Panadol brand equity strong; fast-moving SKUs well-stocked', opportunities:'Self-checkout integration missing; no loyalty QR code at point of sale' },
        { channel:'pharmacy', channelLabel:'Pharmacy Store', date:'2026-04-18', q1:4, q2:3, q3:4, working_well:'Sensodyne clinical claim displays driving pharmacist confidence', opportunities:'Limited presence of newer Haleon products like Advil extended range' },
        { channel:'grocery', channelLabel:'Grocery Store', date:'2026-03-06', q1:3, q2:2, q3:4, working_well:'Secondary placements in health aisle working well for Panadol', opportunities:'Store staff not trained on Haleon product differentiation vs private label' },
        { channel:'grocery', channelLabel:'Grocery Store', date:'2026-03-14', q1:4, q2:3, q3:3, working_well:'Good gondola end utilization during promotional period', opportunities:'Tech tools for staff product recommendation absent' },
        { channel:'grocery', channelLabel:'Grocery Store', date:'2026-03-22', q1:2, q2:2, q3:3, working_well:'Voltaren gel on pain management endcap visible', opportunities:'Very limited staff advocacy; private label dominating mid-shelf' },
        { channel:'grocery', channelLabel:'Grocery Store', date:'2026-04-02', q1:4, q2:3, q3:4, working_well:'Strong Sensodyne multi-buy promotion driving basket size', opportunities:'Need digital training modules for store staff on Haleon product benefits' },
        { channel:'grocery', channelLabel:'Grocery Store', date:'2026-04-11', q1:3, q2:2, q3:3, working_well:'Health zone concept well received; Centrum visible', opportunities:'Staff turnover high; training retention poor for new SKUs' },
        { channel:'grocery', channelLabel:'Grocery Store', date:'2026-04-19', q1:3, q2:3, q3:4, working_well:'Panadol flu range driving good seasonal sales', opportunities:'Need interactive digital demos for Otrivin at point of sale' },
        { channel:'mt',       channelLabel:'MT Store',      date:'2026-03-07', q1:5, q2:4, q3:5, working_well:'Premium shelf block for Sensodyne; eye-level primary position secured', opportunities:'Cross-category health zone could drive incremental Centrum sales' },
        { channel:'mt',       channelLabel:'MT Store',      date:'2026-03-15', q1:4, q2:4, q3:4, working_well:'Digital price tags and QR code integration working well', opportunities:'Shelf share slipping vs Colgate in toothpaste segment' },
        { channel:'mt',       channelLabel:'MT Store',      date:'2026-03-23', q1:4, q2:3, q3:4, working_well:'Good implementation of Haleon planogram; facing count maintained', opportunities:'Out-of-stock rate higher than target for Panadol Extra' },
        { channel:'mt',       channelLabel:'MT Store',      date:'2026-04-03', q1:5, q2:5, q3:5, working_well:'Best-in-class MT execution; all cycle KPIs met for Q1', opportunities:'Expand Voltaren display into sports nutrition adjacent section' },
        { channel:'mt',       channelLabel:'MT Store',      date:'2026-04-12', q1:3, q2:3, q3:3, working_well:'Health category growing; Haleon benefiting from wellness consumer trend', opportunities:'Need stronger secondary placement strategy in large-format MT' },
        { channel:'mt',       channelLabel:'MT Store',      date:'2026-04-20', q1:4, q2:4, q3:4, working_well:'Mobile app promotions tracking now operational', opportunities:'Centrum visibility weak vs Blackmores in vitamins section' },
        { channel:'activation', channelLabel:'In-Market Activation', date:'2026-03-08', q1:4, q2:3, q3:4, working_well:'High-footfall activation near pharmacy entrance; sampling driving trial for Sensodyne', opportunities:'Digital engagement tools missing from activation booth' },
        { channel:'activation', channelLabel:'In-Market Activation', date:'2026-03-16', q1:5, q2:4, q3:5, working_well:'Promoter team very knowledgeable; conversion rate strong for Voltaren gel', opportunities:'Need tablet-based product selector tool for field promoters' },
        { channel:'activation', channelLabel:'In-Market Activation', date:'2026-03-24', q1:3, q2:2, q3:3, working_well:'Branded vehicle wrap attracting strong consumer attention', opportunities:'Promoter scripts outdated; not reflecting latest clinical data' },
        { channel:'activation', channelLabel:'In-Market Activation', date:'2026-04-04', q1:4, q2:4, q3:4, working_well:'Strong consumer engagement at weekend market activation', opportunities:'Gamification would boost dwell time; no data capture post-activation' },
        { channel:'activation', channelLabel:'In-Market Activation', date:'2026-04-13', q1:4, q2:3, q3:4, working_well:'Sensodyne sensitivity testing live demo very effective for conversion', opportunities:'Need CRM integration for post-activation consumer follow-up' },
        { channel:'activation', channelLabel:'In-Market Activation', date:'2026-04-21', q1:3, q2:3, q3:3, working_well:'Brand messaging consistent with TV campaign; consumer recall high', opportunities:'Need WhatsApp/SMS follow-up flow post-activation' },
        { channel:'hcp',     channelLabel:'HCP',     date:'2026-03-09', q1:4, q2:3, q3:4, working_well:'GPs showing strong conviction for Sensodyne; clinical data well received', opportunities:'Digital detailing tool not available for tablet-based presentations' },
        { channel:'hcp',     channelLabel:'HCP',     date:'2026-03-17', q1:5, q2:4, q3:5, working_well:'Dentist prescriptions for Sensodyne Repair & Protect at all-time high', opportunities:'Panadol extended release less known among junior doctors' },
        { channel:'hcp',     channelLabel:'HCP',     date:'2026-03-25', q1:3, q2:2, q3:3, working_well:'Panadol in-clinic posters maintaining consistent brand presence', opportunities:'HCP-facing app needed for real-time clinical evidence access' },
        { channel:'hcp',     channelLabel:'HCP',     date:'2026-04-05', q1:4, q2:3, q3:4, working_well:'Voltaren physio partnership driving recommendations in sports clinics', opportunities:'Webinar attendance dropping; need interactive digital CME format' },
        { channel:'hcp',     channelLabel:'HCP',     date:'2026-04-14', q1:4, q2:4, q3:4, working_well:'Centrum conviction strong among nutritionists and dietitians', opportunities:'Otrivin recommendation rate low among ENT specialists' },
        { channel:'hcp',     channelLabel:'HCP',     date:'2026-04-22', q1:3, q2:3, q3:3, working_well:'Panadol brand trust highest among pain relief options', opportunities:'Need stronger evidence for Voltaren vs NSAIDs in HCP conversations' },
        { channel:'consumer', channelLabel:'Consumer', date:'2026-03-10', q1:4, q2:4, q3:3, working_well:'Strong Sensodyne awareness; most consumers using it daily', opportunities:'Low awareness of Centrum Complete range among younger consumers' },
        { channel:'consumer', channelLabel:'Consumer', date:'2026-03-18', q1:5, q2:4, q3:4, working_well:'Panadol trusted for family use across all age groups', opportunities:'Voltaren perceived as prescription-only by many household consumers' },
        { channel:'consumer', channelLabel:'Consumer', date:'2026-03-26', q1:3, q2:3, q3:2, working_well:'Sensodyne loyalty strong; consumers highly resistant to switching', opportunities:'Need stronger social content to educate on Otrivin differentiation' },
        { channel:'consumer', channelLabel:'Consumer', date:'2026-04-06', q1:4, q2:5, q3:3, working_well:'Good consumer interaction at health event; sampling well received', opportunities:'Bundle opportunity: Panadol + Centrum family health pack' },
        { channel:'consumer', channelLabel:'Consumer', date:'2026-04-15', q1:4, q2:4, q3:4, working_well:'High trust in Haleon brands vs generics post-COVID', opportunities:'Price sensitivity a barrier for Centrum premium range' },
        { channel:'consumer', channelLabel:'Consumer', date:'2026-04-23', q1:3, q2:3, q3:3, working_well:'Strong word-of-mouth for Sensodyne from dentist referrals', opportunities:'Need loyalty program to capture and incentivize repeat buyers' },
        { channel:'dcommerce', channelLabel:'Dcommerce', date:'2026-03-11', q1:3, q2:3, q3:3, working_well:'Good product imagery and ingredient callouts on Sensodyne listings', opportunities:'A+ content missing for Voltaren and Otrivin range' },
        { channel:'dcommerce', channelLabel:'Dcommerce', date:'2026-03-19', q1:4, q2:4, q3:4, working_well:'Panadol and Centrum sponsored placement delivering strong ROAS', opportunities:'Review volume low for newer SKUs; hurting algorithm ranking' },
        { channel:'dcommerce', channelLabel:'Dcommerce', date:'2026-03-27', q1:2, q2:3, q3:2, working_well:'Sensodyne holds top organic position on key toothpaste searches', opportunities:'Out-of-stock alerts hurting seller ratings on Shopee and Lazada' },
        { channel:'dcommerce', channelLabel:'Dcommerce', date:'2026-04-07', q1:4, q2:4, q3:4, working_well:'Enhanced A+ content for Sensodyne driving 18% conversion uplift', opportunities:'Competitor DTC subscription model gaining traction; need response strategy' },
        { channel:'dcommerce', channelLabel:'Dcommerce', date:'2026-04-16', q1:3, q2:3, q3:3, working_well:'Live commerce sessions for Panadol building authentic brand trust', opportunities:'Centrum SKU count on e-commerce platforms needs expansion' },
        { channel:'dcommerce', channelLabel:'Dcommerce', date:'2026-04-24', q1:4, q2:4, q3:4, working_well:'Strong search rank for Haleon brands on health category pages', opportunities:'Auto-replenishment subscription service needed for Sensodyne repeat buyers' },
    ];

    const FBI_WORKING = [
        { theme:'Sensodyne brand equity & shelf leadership',         count:18 },
        { theme:'Panadol family trust & HCP recommendation rate',    count:15 },
        { theme:'HCP conviction for clinical product range',         count:12 },
        { theme:'MT planogram compliance & in-store execution',      count:10 },
        { theme:'Activation sampling driving first-time trial',      count:8  },
        { theme:'E-commerce sponsored placement & search ranking',   count:7  },
    ];
    const FBI_OPP = [
        { theme:'Digital engagement tools for field & HCP teams',   count:16 },
        { theme:'In-store staff training & advocacy programs',       count:13 },
        { theme:'Voltaren OTC perception & awareness gap',           count:11 },
        { theme:'Centrum range visibility & consumer education',     count:10 },
        { theme:'E-commerce A+ content & assortment gaps',           count:9  },
        { theme:'Consumer loyalty & repeat purchase capture',        count:8  },
    ];

    const FBI_BRANDS = ['Sensodyne', 'Panadol', 'Voltaren', 'Centrum', 'Otrivin', 'Advil'];

    function analyzeBrandMentions(dataset) {
        return FBI_BRANDS.map(brand => {
            const re = new RegExp(`\\b${brand}\\b`, 'gi');
            let pos = 0, opp = 0;
            dataset.forEach(r => {
                if (re.test(r.working_well)) pos++;
                if (re.test(r.opportunities)) opp++;
            });
            return { brand, pos, opp, total: pos + opp };
        }).filter(b => b.total > 0).sort((a, b) => b.total - a.total);
    }

    function analyzeMonthlyTrend(dataset) {
        const channels = {};
        dataset.forEach(r => {
            const m = r.date.startsWith('2026-03') ? 'mar' : r.date.startsWith('2026-04') ? 'apr' : null;
            if (!m) return;
            if (!channels[r.channel]) channels[r.channel] = { label: r.channelLabel, mar: [], apr: [] };
            const scores = r.channel === 'consumer' ? [r.q1, r.q2] : [r.q1, r.q2, r.q3];
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            channels[r.channel][m].push(avg);
        });
        return Object.values(channels).map(c => ({
            label: c.label,
            mar: c.mar.length ? c.mar.reduce((a, b) => a + b, 0) / c.mar.length : null,
            apr: c.apr.length ? c.apr.reduce((a, b) => a + b, 0) / c.apr.length : null,
        }));
    }

    function initFeedbackInsights(dataset) {
        const data = dataset || FEEDBACK_SAMPLE_DATA;
        const total = data.length;
        if (total === 0) {
            renderFbEmpty();
            return;
        }

        const cmap = {};
        data.forEach(r => {
            if (!cmap[r.channel]) cmap[r.channel] = { label: r.channelLabel, q1s: [], q2s: [], q3s: [] };
            cmap[r.channel].q1s.push(r.q1);
            cmap[r.channel].q2s.push(r.q2);
            if (r.channel !== 'consumer') cmap[r.channel].q3s.push(r.q3);
        });
        const channelStats = Object.entries(cmap).map(([ch, d]) => {
            const all = [...d.q1s, ...d.q2s, ...d.q3s];
            return { channel: ch, label: d.label, avg: all.reduce((a, b) => a + b, 0) / all.length, count: d.q1s.length };
        }).sort((a, b) => b.avg - a.avg);

        const allScores = data.flatMap(r => r.channel === 'consumer' ? [r.q1, r.q2] : [r.q1, r.q2, r.q3]);
        const overallAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
        const q1Avg = data.reduce((s, r) => s + r.q1, 0) / total;
        const q2Avg = data.reduce((s, r) => s + r.q2, 0) / total;
        const nc = data.filter(r => r.channel !== 'consumer');
        const q3Avg = nc.length ? nc.reduce((s, r) => s + r.q3, 0) / nc.length : 0;

        const isFiltered = data.length < FEEDBACK_SAMPLE_DATA.length;
        renderFbKpis(overallAvg, total, channelStats[0], channelStats[channelStats.length - 1], isFiltered);
        renderFbChannelBars(channelStats);
        renderFbDimensionBars(q1Avg, q2Avg, q3Avg);
        renderFbBrandPerf(analyzeBrandMentions(data));
        renderFbTrend(analyzeMonthlyTrend(data));
        renderFbThemes();
        renderFbHighlights(data);
    }

    function renderFbEmpty() {
        ['fbKpiRow', 'fbChannelBars', 'fbDimensionBars', 'fbBrandPerf', 'fbTrend', 'fbWorkingWell', 'fbOpportunities', 'fbHighlights']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<div class="fbi-empty">No data for this filter</div>';
            });
    }

    function renderFbKpis(overallAvg, total, best, worst, isFiltered) {
        const el = document.getElementById('fbKpiRow');
        if (!el) return;
        const svgStar = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`;
        const svgUsers = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
        const svgUp = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22,7 13.5,15.5 8.5,10.5 2,17"/><polyline points="16,7 22,7 22,13"/></svg>`;
        const svgAlert = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

        const kpis = isFiltered ? [
            { label: 'Average Score', value: overallAvg.toFixed(1), unit: '/5', sub: `${total} response${total === 1 ? '' : 's'} in selection`, icon: svgStar, cls: 'fbi-kpi-green' },
            { label: 'Responses', value: total, unit: '', sub: 'Filtered selection · Mar–Apr 2026', icon: svgUsers, cls: 'fbi-kpi-blue' },
            { label: 'Best Single Visit', value: best.avg.toFixed(1) + '/5', unit: '', sub: best.label, icon: svgUp, cls: 'fbi-kpi-green' },
            { label: 'Lowest Single Visit', value: worst.avg.toFixed(1) + '/5', unit: '', sub: worst.label, icon: svgAlert, cls: 'fbi-kpi-amber' },
        ] : [
            { label: 'Overall Satisfaction', value: overallAvg.toFixed(1), unit: '/5', sub: `${total} market visit responses`, icon: svgStar, cls: 'fbi-kpi-green' },
            { label: 'Total Responses', value: total, unit: '', sub: '7 channels · Mar–Apr 2026', icon: svgUsers, cls: 'fbi-kpi-blue' },
            { label: 'Top Performing Channel', value: best.label, unit: '', sub: `Avg ${best.avg.toFixed(1)}/5 · ${best.count} visits`, icon: svgUp, cls: 'fbi-kpi-green' },
            { label: 'Needs Focus', value: worst.label, unit: '', sub: `Avg ${worst.avg.toFixed(1)}/5 · improve priority`, icon: svgAlert, cls: 'fbi-kpi-amber' },
        ];

        el.innerHTML = kpis.map((k, i) => `
            <div class="fbi-kpi-card ${k.cls}" style="animation-delay:${i*0.1}s">
                <div class="fbi-kpi-icon-wrap">${k.icon}</div>
                <div class="fbi-kpi-value">${k.value}<span class="fbi-kpi-unit">${k.unit}</span></div>
                <div class="fbi-kpi-label">${k.label}</div>
                <div class="fbi-kpi-sub">${k.sub}</div>
            </div>
        `).join('');
    }

    function renderFbBrandPerf(brands) {
        const el = document.getElementById('fbBrandPerf');
        if (!el) return;
        if (!brands.length) {
            el.innerHTML = '<div class="fbi-empty">No brand mentions in this view</div>';
            return;
        }
        const max = Math.max(...brands.map(b => b.total));
        el.innerHTML = brands.map((b, i) => {
            const posPct = b.total ? (b.pos / b.total) * 100 : 0;
            const oppPct = 100 - posPct;
            const widthPct = Math.max(35, Math.round((b.total / max) * 100));
            return `<div class="fbi-brand-row" style="animation-delay:${i*0.07}s">
                <div class="fbi-brand-name">${b.brand}</div>
                <div class="fbi-brand-bar-outer" style="width:${widthPct}%">
                    <div class="fbi-brand-bar-stack">
                        ${b.pos > 0 ? `<div class="fbi-brand-bar-pos" style="width:${posPct}%">${b.pos}</div>` : ''}
                        ${b.opp > 0 ? `<div class="fbi-brand-bar-opp" style="width:${oppPct}%">${b.opp}</div>` : ''}
                    </div>
                </div>
                <div class="fbi-brand-total">${b.total}</div>
            </div>`;
        }).join('') + `
            <div class="fbi-brand-legend">
                <span class="fbi-legend-item"><span class="fbi-legend-dot pos"></span>Positive mention</span>
                <span class="fbi-legend-item"><span class="fbi-legend-dot opp"></span>Opportunity mention</span>
            </div>`;
    }

    function renderFbTrend(trends) {
        const el = document.getElementById('fbTrend');
        if (!el) return;
        if (!trends.length) {
            el.innerHTML = '<div class="fbi-empty">Not enough data to show a trend</div>';
            return;
        }
        el.innerHTML = trends.map((t, i) => {
            const delta = (t.apr != null && t.mar != null) ? t.apr - t.mar : null;
            let dCls = 'flat', dSym = '—', dCol = 'var(--text-tertiary)';
            if (delta != null) {
                if (delta > 0.15) { dCls = 'up'; dSym = '▲'; dCol = '#1F7110'; }
                else if (delta < -0.15) { dCls = 'down'; dSym = '▼'; dCol = '#dc2626'; }
            }
            const marPct = t.mar != null ? (t.mar / 5) * 100 : 0;
            const aprPct = t.apr != null ? (t.apr / 5) * 100 : 0;
            return `<div class="fbi-trend-row" style="animation-delay:${i*0.06}s">
                <div class="fbi-trend-label">${t.label}</div>
                <div class="fbi-trend-bar-pair">
                    <span class="fbi-trend-month">Mar</span>
                    <div class="fbi-trend-track"><div class="fbi-trend-fill mar" style="width:${marPct}%"></div></div>
                    <span class="fbi-trend-val">${t.mar != null ? t.mar.toFixed(1) : '–'}</span>
                </div>
                <div class="fbi-trend-bar-pair">
                    <span class="fbi-trend-month">Apr</span>
                    <div class="fbi-trend-track"><div class="fbi-trend-fill apr" style="width:${aprPct}%"></div></div>
                    <span class="fbi-trend-val">${t.apr != null ? t.apr.toFixed(1) : '–'}</span>
                </div>
                <div class="fbi-trend-delta fbi-delta-${dCls}" style="color:${dCol}">${dSym} ${delta != null ? (delta > 0 ? '+' : '') + delta.toFixed(2) : 'n/a'}</div>
            </div>`;
        }).join('');
    }

    function renderFbChannelBars(stats) {
        const el = document.getElementById('fbChannelBars');
        if (!el) return;
        el.innerHTML = stats.map(c => {
            const pct = Math.round((c.avg/5)*100);
            const col = c.avg>=4?'#1F7110':c.avg>=3?'#d97706':'#dc2626';
            return `<div class="fbi-bar-row">
                <div class="fbi-bar-label">${c.label}</div>
                <div class="fbi-bar-track"><div class="fbi-bar-fill" style="width:${pct}%;background:${col}"></div></div>
                <div class="fbi-bar-val" style="color:${col}">${c.avg.toFixed(1)}</div>
            </div>`;
        }).join('');
    }

    function renderFbDimensionBars(q1, q2, q3) {
        const el = document.getElementById('fbDimensionBars');
        if (!el) return;
        const dims = [
            { label:'Presence & Visibility (Q1)', val:q1, desc:'In-store display, shelf share, content quality' },
            { label:'Technology Adoption (Q2)',    val:q2, desc:'Digital tools, tech integration, retail experience' },
            { label:'Assortment & Execution (Q3)', val:q3, desc:'Product availability, promoter quality, range depth' },
        ];
        el.innerHTML = dims.map(d => {
            const pct = Math.round((d.val/5)*100);
            const col = d.val>=4?'#1F7110':d.val>=3?'#d97706':'#dc2626';
            return `<div class="fbi-dim-row">
                <div class="fbi-dim-header">
                    <span class="fbi-dim-label">${d.label}</span>
                    <span class="fbi-dim-score" style="color:${col}">${d.val.toFixed(1)}/5</span>
                </div>
                <div class="fbi-dim-track"><div class="fbi-dim-fill" style="width:${pct}%;background:${col}"></div></div>
                <div class="fbi-dim-desc">${d.desc}</div>
            </div>`;
        }).join('');
    }

    function renderFbThemes() {
        const ww = document.getElementById('fbWorkingWell');
        const op = document.getElementById('fbOpportunities');
        const maxW = Math.max(...FBI_WORKING.map(t=>t.count));
        const maxO = Math.max(...FBI_OPP.map(t=>t.count));
        if (ww) ww.innerHTML = FBI_WORKING.map((t,i) => `
            <div class="fbi-theme-item" style="animation-delay:${i*0.07}s">
                <div class="fbi-theme-bar-wrap"><div class="fbi-theme-bar" style="width:${Math.round((t.count/maxW)*100)}%;background:linear-gradient(90deg,#155009,#3FE320)"></div></div>
                <div class="fbi-theme-info">
                    <span class="fbi-theme-text">${t.theme}</span>
                    <span class="fbi-theme-count">${t.count} mentions</span>
                </div>
            </div>`).join('');
        if (op) op.innerHTML = FBI_OPP.map((t,i) => `
            <div class="fbi-theme-item" style="animation-delay:${i*0.07}s">
                <div class="fbi-theme-bar-wrap"><div class="fbi-theme-bar" style="width:${Math.round((t.count/maxO)*100)}%;background:linear-gradient(90deg,#b45309,#f59e0b)"></div></div>
                <div class="fbi-theme-info">
                    <span class="fbi-theme-text">${t.theme}</span>
                    <span class="fbi-theme-count fbi-count-opp">${t.count} mentions</span>
                </div>
            </div>`).join('');
    }

    function renderFbHighlights(dataset) {
        const el = document.getElementById('fbHighlights');
        if (!el) return;
        const data = dataset || FEEDBACK_SAMPLE_DATA;
        let picks;
        if (data.length <= 6) {
            picks = data;
        } else if (data.length < FEEDBACK_SAMPLE_DATA.length) {
            picks = data.slice(0, 6);
        } else {
            picks = [2, 12, 19, 25, 31, 37].map(i => FEEDBACK_SAMPLE_DATA[i]);
        }
        if (!picks.length) {
            el.innerHTML = '<div class="fbi-empty">No highlights for this filter</div>';
            return;
        }
        el.innerHTML = `<div class="fbi-highlights-grid">${picks.map((r,i) => {
            const scores = r.channel==='consumer' ? [r.q1,r.q2] : [r.q1,r.q2,r.q3];
            const avgS = scores.reduce((a,b)=>a+b,0)/scores.length;
            const cls = avgS>=4?'good':avgS>=3?'mid':'low';
            return `<div class="fbi-highlight-card" style="animation-delay:${i*0.08}s">
                <div class="fbi-highlight-header">
                    <span class="fbi-highlight-channel">${r.channelLabel}</span>
                    <span class="fbi-highlight-date">${r.date}</span>
                </div>
                <div class="fbi-highlight-section">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1F7110" stroke-width="2.5"><path d="M9 11l3 3L22 4"/></svg>
                    <span>${escapeHtml(r.working_well)}</span>
                </div>
                <div class="fbi-highlight-section fbi-opp-section">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>${escapeHtml(r.opportunities)}</span>
                </div>
                <div class="fbi-highlight-score">
                    ${scores.map(s=>`<span class="fbi-score-pip ${s>=4?'good':s>=3?'mid':'low'}">${s}/5</span>`).join('')}
                </div>
            </div>`;
        }).join('')}</div>`;
    }

    const CHANNEL_LABEL_MAP = {
        pharmacy: 'Pharmacy Store', grocery: 'Grocery Store', mt: 'MT Store',
        activation: 'In-Market Activation', hcp: 'HCP', consumer: 'Consumer', dcommerce: 'Dcommerce',
    };

    function applyFeedbackFilter() {
        const sel = document.getElementById('filterChannel');
        const val = sel ? sel.value : 'all';
        const badge = document.getElementById('fbFilterBadge');
        const badgeText = document.getElementById('fbFilterBadgeText');
        if (val && val !== 'all') {
            const filtered = FEEDBACK_SAMPLE_DATA.filter(r => r.channel === val);
            if (badge && badgeText) {
                badgeText.textContent = `Showing: ${CHANNEL_LABEL_MAP[val] || val} · ${filtered.length} response${filtered.length === 1 ? '' : 's'}`;
                badge.classList.remove('hidden');
            }
            initFeedbackInsights(filtered);
        } else {
            if (badge) badge.classList.add('hidden');
            initFeedbackInsights();
        }
    }

    const filterChannelSel = document.getElementById('filterChannel');
    if (filterChannelSel) filterChannelSel.addEventListener('change', applyFeedbackFilter);

    const fbFilterClearBtn = document.getElementById('fbFilterClearBtn');
    if (fbFilterClearBtn) fbFilterClearBtn.addEventListener('click', () => {
        if (filterChannelSel) filterChannelSel.value = 'all';
        applyFeedbackFilter();
    });

    applyFeedbackFilter();

    // ---- Restore sessions on load ----
    async function loadDefaultSession() {
        showLoading();
        const minDelay = new Promise(resolve => setTimeout(resolve, 3800));
        try {
            const fetchData = fetch('/api/default-session').then(r => r.ok ? r.json() : null);
            const [data] = await Promise.all([fetchData, minDelay]);
            if (!data || !data.analysis || data.analysis.error) {
                hideLoading();
                return false;
            }
            const filename = data.filename || 'Demo Analysis';
            addSession(filename, data.analysis, '', data.collection_id);
            activateSession(sessions[sessions.length - 1].id);
            return true;
        } catch (e) {
            console.warn('Default session load failed:', e);
            hideLoading();
            return false;
        }
    }

    renderSidebar();
    const hasCached = loadSessions();
    if (hasCached && sessions.length > 0) {
        uploadLanding.classList.add('hidden');
        appHeader.classList.remove('hidden');
        appLayout.classList.remove('hidden');
        activateSession(sessions[sessions.length - 1].id);
    } else {
        loadDefaultSession();
    }
});
