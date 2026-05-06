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
    let currentPhraseTag = 'all';

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

    async function sendQuery() {
        const query = queryInput.value.trim();
        const session = getSession(activeSessionId);
        if (!query || !session) return;

        appendUserMessage(query);
        queryInput.value = '';

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

    function renderMetrics(metrics) {
        const grid = document.getElementById('quickMetrics');
        const card = document.getElementById('metricsCard');
        grid.innerHTML = '';
        if (!metrics) { if (card) card.style.display = 'none'; return; }

        const invertMetrics = ['margin_stress', 'supply_risk', 'price_sensitivity', 'channel_shift'];
        const labels = {
            demand_index: 'Demand', margin_stress: 'Margin Stress',
            supply_risk: 'Supply Risk', retailer_advocacy: 'Retailer Advocacy',
            price_sensitivity: 'Price Sensitivity', channel_shift: 'Channel Shift',
            brand_loyalty: 'Brand Loyalty',
        };
        let hasContent = false;
        Object.entries(labels).forEach(([key, label]) => {
            const m = metrics[key];
            if (!m || m.value == null) return;
            hasContent = true;
            const el = document.createElement('div');
            el.className = 'metric-card';
            const val = m.value;
            const isInverted = invertMetrics.includes(key);
            const color = isInverted ? riskColor(val) : goodColor(val);
            el.innerHTML = `
                <div class="metric-label">${label}</div>
                <div class="metric-value" style="color: ${color}">${val.toFixed(1)}/10</div>
                <div class="metric-reasoning" title="${m.reasoning || ''}">${m.reasoning ? m.reasoning.slice(0, 80) + (m.reasoning.length > 80 ? '...' : '') : ''}</div>
            `;
            grid.appendChild(el);
        });
        if (card) card.style.display = hasContent ? '' : 'none';
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
        if (!metrics && !sentiment) { if (card) card.style.display = 'none'; return; }
        if (card) card.style.display = '';

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

    function renderAutoQAs(items) {
        const container = document.getElementById('autoQaList');
        container.innerHTML = '';
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'qa-item';
            el.innerHTML = `
                <div class="qa-question">${item.question}</div>
                <div class="qa-answer">${item.answer}</div>
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

    // ---- Restore sessions on load ----
    renderSidebar();
    const hasCached = loadSessions();
    if (hasCached && sessions.length > 0) {
        uploadLanding.classList.add('hidden');
        appLayout.classList.remove('hidden');
        activateSession(sessions[sessions.length - 1].id);
    }
});
