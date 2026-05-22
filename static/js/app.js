document.addEventListener('DOMContentLoaded', () => {

    // ---- State ----
    let _fbData = [];
    let _fbFiltered = [];
    let _fbQuestionFilter = 'all';
    let _fbUsersById = {};
    let _fbQuestionsById = {};
    let _fbOutletsById = {};
    let _currentUser = null;

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

    // ---- Utilities ----
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
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

    function initials(name) {
        if (!name) return '?';
        return name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    }

    function formatDateLong(s) {
        if (!s) return '—';
        try {
            const d = new Date(s.replace(' ', 'T'));
            if (isNaN(d.getTime())) return s;
            return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
                + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch { return s; }
    }

    function formatDateShort(s) {
        if (!s) return '—';
        return s.slice(0, 10);
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

    function outletName(oid) {
        if (oid == null) return '—';
        const o = _fbOutletsById[oid];
        return o && o.outlet_name ? o.outlet_name : `Outlet #${oid}`;
    }

    function outletCode(oid) {
        if (oid == null) return '—';
        const o = _fbOutletsById[oid];
        return o && o.outlet_code ? o.outlet_code : '—';
    }

    function inferLevel(level, oid) {
        if (level) return level;
        const o = _fbOutletsById[oid];
        if (!o) return 'unknown';
        const ch = (o.channel || '').toLowerCase();
        if (ch.includes('pharm')) return 'trade';
        if (ch.includes('groc')) return 'trade';
        if (ch.includes('hcp') || ch.includes('clinic') || ch.includes('doctor')) return 'hcp';
        if (ch.includes('consumer')) return 'consumer';
        return 'unknown';
    }

    function visitTypeLabel(level) {
        if (!level || level === 'unknown') return 'Other';
        return { trade: 'Trade', hcp: 'HCP', consumer: 'Consumer' }[level] || level;
    }

    // ---- Data loading ----
    async function loadFeedbackMeta() {
        try {
            const res = await fetch('/api/feedback-meta');
            if (!res.ok) return;
            const meta = await res.json();
            (meta.users || []).forEach(u => { _fbUsersById[u.id] = u; });
            (meta.questions || []).forEach(q => { _fbQuestionsById[q.id] = q; });
            (meta.outlets || []).forEach(o => { _fbOutletsById[o.id] = o; });
            _currentUser = meta.current_user || null;
            applyCurrentUserToUi();
        } catch (e) {
            console.warn('Could not load feedback meta:', e);
        }
    }

    function applyCurrentUserToUi() {
        if (!_currentUser) return;
        const name = _currentUser.user_name || 'User';
        const ini = initials(name);
        const headerName = document.getElementById('headerUserName');
        const headerAvatar = document.getElementById('headerUserAvatar');
        const profName = document.getElementById('sidebarProfileName');
        const profAvatar = document.getElementById('sidebarProfileAvatar');
        if (headerName) headerName.textContent = name;
        if (headerAvatar) headerAvatar.textContent = ini;
        if (profName) profName.textContent = name;
        if (profAvatar) profAvatar.textContent = ini;
    }

    async function loadFeedbackData() {
        try {
            const res = await fetch('/api/feedback-data');
            if (!res.ok) throw new Error('Failed to load feedback data');
            const json = await res.json();
            _fbData = json.data || [];
            _fbFiltered = [..._fbData];
            populateFilterDropdowns();
            renderDashboard();
            renderVisitsList();
        } catch (e) {
            console.warn('Could not load feedback data:', e);
            renderEmptyDashboard('Failed to load feedback data. Make sure the CSV file exists.');
        }
    }

    // ---- View switching ----
    function showView(viewName) {
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById('view-' + viewName);
        if (target) target.classList.add('active');
        document.querySelectorAll('.sidebar-nav-item').forEach(b => {
            if (b.dataset.view === viewName) b.classList.add('active');
            else if (!b.disabled) b.classList.remove('active');
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.querySelectorAll('.sidebar-nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view) showView(view);
        });
    });

    // ---- Dashboard ----
    function renderEmptyDashboard(msg) {
        ['fbKpiRow', 'fbRatingDist', 'fbAiSummary', 'fbTableBody']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<div class="fbi-empty">${msg || 'No data available'}</div>`;
            });
    }

    function renderDashboard() {
        const data = _fbFiltered;
        if (!data.length) {
            renderEmptyDashboard('No feedback yet for the current selection.');
            return;
        }

        const ratings = data.filter(r => r.rating != null).map(r => r.rating);
        const ratingsDist = { 1:0, 2:0, 3:0, 4:0, 5:0 };
        ratings.forEach(r => { if (ratingsDist[r] != null) ratingsDist[r]++; });
        const totalRatings = ratings.length;

        const uniqueOutlets = new Set(data.map(r => r.outlet_id != null ? String(r.outlet_id) : null).filter(Boolean));
        const uniqueVisits = new Set(data.map(r => r.visit_id));
        const totalFeedbacks = data.length;

        renderKpis({
            respondents: uniqueVisits.size,
            outlets: uniqueOutlets.size,
            feedbacks: totalFeedbacks,
        });
        renderRatingDist(ratingsDist, totalRatings);
        renderVerbatimSummary(data);
        renderResponsesTable(data);
    }

    function renderKpis(stats) {
        const el = document.getElementById('fbKpiRow');
        if (!el) return;
        const items = [
            {
                label: 'Respondents', value: stats.respondents,
                sub: `unique market visits`, cls: 'fbi-kpi-green',
                icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
            },
            {
                label: 'Outlets', value: stats.outlets,
                sub: `points of sale covered`, cls: 'fbi-kpi-blue',
                icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"/><path d="m3 9 2.45-4.9A2 2 0 0 1 7.24 3h9.52a2 2 0 0 1 1.8 1.1L21 9"/><path d="M12 3v6"/></svg>`,
            },
            {
                label: 'Feedbacks', value: stats.feedbacks,
                sub: `total responses captured`, cls: 'fbi-kpi-amber',
                icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
            },
        ];
        el.innerHTML = items.map((k, i) => `
            <div class="fbi-kpi-card ${k.cls}" style="animation-delay:${i*0.08}s">
                <div class="fbi-kpi-icon-wrap">${k.icon}</div>
                <div class="fbi-kpi-value">${k.value}</div>
                <div class="fbi-kpi-label">${k.label}</div>
                <div class="fbi-kpi-sub">${k.sub}</div>
            </div>`).join('');
    }

    function renderRatingDist(dist, total) {
        const el = document.getElementById('fbRatingDist');
        if (!el) return;
        if (total === 0) { el.innerHTML = '<div class="fbi-empty">No ratings available for this selection</div>'; return; }
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

    function getOpenEndedResponses(data) {
        const texts = [];
        data.forEach(r => {
            if (r.answer_text && String(r.answer_text).trim()) texts.push(String(r.answer_text).trim());
            if (r.voice_text && String(r.voice_text).trim()) texts.push(String(r.voice_text).trim());
        });
        return texts;
    }

    function renderVerbatimSummary(data) {
        const texts = getOpenEndedResponses(data);
        const el = document.getElementById('fbAiSummary');
        const scopeEl = document.getElementById('fbVerbatimScope');
        if (!el) return;
        if (texts.length === 0) {
            el.innerHTML = '<div class="fbi-empty">No open-ended responses for this selection</div>';
            if (scopeEl) scopeEl.textContent = '0 open-ended responses';
            return;
        }

        // Themes lexicon
        const themes = [];
        const all = texts.join(' ').toLowerCase();
        const themeRules = [
            ['sensodyne', 'Sensodyne mentions', 'positive'],
            ['panadol', 'Panadol mentions', 'positive'],
            ['centrum', 'Centrum mentions', 'neutral'],
            ['otrivin', 'Otrivin mentions', 'neutral'],
            ['voltaren', 'Voltaren mentions', 'positive'],
            ['enshine|colgate|himalaya|competitor|compet', 'Competitor activity', 'negative'],
            ['stockout|out of stock|availability', 'Stock availability', 'negative'],
            ['display|shelf|visibility|sleeve|sku', 'Visibility & display', 'positive'],
            ['train|educat|learn', 'Training opportunity', 'neutral'],
            ['price|expensive|cost|margin', 'Pricing sensitivity', 'negative'],
            ['recommend|prescribe|advise', 'HCP recommendation', 'positive'],
        ];
        themeRules.forEach(([pat, text, type]) => {
            if (new RegExp(pat).test(all)) themes.push({ text, type });
        });

        const posWords = ['good','great','excellent','best','love','recommend','effective','helpful','satisfied','strong','fast','improved','trust','happy','impressed','reliable'];
        const negWords = ['improvement','expensive','missing','lack','poor','difficult','stockout','issue','problem','slow','weak','limited','confusing','unavailable'];
        let posCount = 0, negCount = 0;
        posWords.forEach(w => { if (all.includes(w)) posCount++; });
        negWords.forEach(w => { if (all.includes(w)) negCount++; });
        const sentiment = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'mixed';
        const sentLabel = sentiment === 'positive' ? '🟢 Positive' : sentiment === 'negative' ? '🔴 Needs Attention' : '🟡 Mixed';

        // Top words
        const freq = {};
        texts.forEach(t => {
            t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
                if (w.length > 3 && !FB_STOP_WORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
            });
        });
        const topWords = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 6);

        el.innerHTML = `
            <div class="fb-summary">
                <div class="fb-summary-row">
                    <span class="fb-summary-pill">${sentLabel}</span>
                    <span class="fb-summary-meta">${texts.length} response${texts.length === 1 ? '' : 's'} analysed</span>
                </div>
                ${topWords.length ? `<div class="fb-summary-block">
                    <span class="fb-summary-label">Top mentions</span>
                    <div class="fb-summary-words">${topWords.map(([w, c]) => `<span class="fb-word-chip">${escapeHtml(w)} <em>${c}</em></span>`).join('')}</div>
                </div>` : ''}
                ${themes.length ? `<div class="fb-summary-block">
                    <span class="fb-summary-label">Themes detected</span>
                    <div class="fb-summary-themes">${themes.map(t => `<span class="fb-ai-tag ${t.type}">${escapeHtml(t.text)}</span>`).join('')}</div>
                </div>` : ''}
            </div>`;
        if (scopeEl) scopeEl.textContent = `${texts.length} open-ended response${texts.length === 1 ? '' : 's'}`;
    }

    function renderResponsesTable(data) {
        const body = document.getElementById('fbTableBody');
        const empty = document.getElementById('fbTableEmpty');
        const wrap = document.querySelector('#view-dashboard .fb-table-wrap');
        if (!body) return;

        if (!data.length) {
            wrap?.classList.add('hidden');
            empty?.classList.remove('hidden');
            return;
        }
        wrap?.classList.remove('hidden');
        empty?.classList.add('hidden');

        const shown = [...data].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 200);
        body.innerHTML = shown.map(r => {
            const typeClass = inferLevel(r.level, r.outlet_id);
            const ratingHtml = r.rating != null
                ? `<span class="fb-rating-pip" style="background:${['#dc2626','#f97316','#eab308','#84cc16','#22c55e'][r.rating - 1] || '#94a3b8'}">${r.rating}</span>`
                : '<span style="color:var(--text-tertiary);font-size:0.75rem">—</span>';
            const responseText = r.answer_text || r.voice_text || '';
            const qShort = r.question_id != null ? questionShort(r.question_id) : '—';
            return `<tr>
                <td style="font-weight:600;font-size:0.8rem">#${r.visit_id}</td>
                <td><span class="fb-type-badge ${typeClass}">${visitTypeLabel(typeClass)}</span></td>
                <td style="font-size:0.82rem">${escapeHtml(outletName(r.outlet_id))}</td>
                <td style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap">${escapeHtml(qShort)}</td>
                <td>${ratingHtml}</td>
                <td><span class="fb-response-text" title="${escapeHtml(responseText)}">${responseText ? escapeHtml(responseText.slice(0, 80)) + (responseText.length > 80 ? '…' : '') : '<span style="color:var(--text-tertiary)">—</span>'}</span></td>
                <td>${rowMediaChips(r)}</td>
                <td style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap">${formatDateShort(r.created_at)}</td>
            </tr>`;
        }).join('');
    }

    function rowMediaChips(r) {
        const chips = [];
        const img = mediaUrl(r.image_path);
        const aud = mediaUrl(r.audio_path);
        const vid = mediaUrl(r.video_path);
        if (img) chips.push(`<a class="fb-media-chip fb-media-img-chip" href="${escapeHtml(img)}" target="_blank" rel="noopener" title="Open image"><img src="${escapeHtml(img)}" loading="lazy" alt="image" onerror="this.parentElement.classList.add('errored')"></a>`);
        if (aud) chips.push(`<a class="fb-media-chip" href="${escapeHtml(aud)}" target="_blank" rel="noopener" title="Open audio">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3v5zM3 19a2 2 0 0 0 2 2h1v-7H3v5z"/></svg>
        </a>`);
        if (vid) chips.push(`<a class="fb-media-chip" href="${escapeHtml(vid)}" target="_blank" rel="noopener" title="Open video">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        </a>`);
        return chips.length ? `<div class="fb-media-chips">${chips.join('')}</div>` : '<span style="color:var(--text-tertiary);font-size:0.75rem">—</span>';
    }

    // ---- Filter logic ----
    function applyFeedbackFilters() {
        const level = document.querySelector('.fb-level-btn.active')?.dataset?.level || 'all';
        const outlet = document.getElementById('fbFilterOutlet')?.value || 'all';
        const dateRange = document.getElementById('fbFilterDate')?.value || 'all';

        const levelScoped = level !== 'all' ? _fbData.filter(r => inferLevel(r.level, r.outlet_id) === level) : _fbData;
        populateQuestionDropdown(levelScoped);

        let filtered = [..._fbData];
        if (level !== 'all') filtered = filtered.filter(r => inferLevel(r.level, r.outlet_id) === level);
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
            if (outlet !== 'all') parts.push(outletName(parseInt(outlet)));
            if (dateRange !== 'all') parts.push('Last ' + dateRange.replace('d', ' days'));
            const prefix = parts.length ? parts.join(' · ') + ' · ' : '';
            badgeText.textContent = `${prefix}${filtered.length} response${filtered.length === 1 ? '' : 's'}`;
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }

        renderDashboard();
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

    function populateFilterDropdowns() {
        const outlets = new Set();
        _fbData.forEach(r => { if (r.outlet_id != null) outlets.add(String(r.outlet_id)); });
        const outletSel = document.getElementById('fbFilterOutlet');
        if (outletSel) {
            outletSel.innerHTML = '<option value="all">All Outlets</option>';
            [...outlets].sort((a, b) => Number(a) - Number(b)).forEach(o => {
                const opt = document.createElement('option');
                opt.value = o; opt.textContent = outletName(parseInt(o));
                outletSel.appendChild(opt);
            });
        }
        populateQuestionDropdown(_fbData);
    }

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
        ['fbFilterOutlet','fbFilterDate','fbFilterQuestion'].forEach(id => {
            const e = document.getElementById(id); if (e) e.value = 'all';
        });
        _fbQuestionFilter = 'all';
        applyFeedbackFilters();
    });

    // ---- Visits list ----
    function getVisitsSummary() {
        const byVisit = {};
        _fbData.forEach(r => {
            const vid = r.visit_id;
            if (vid == null) return;
            if (!byVisit[vid]) {
                byVisit[vid] = {
                    visit_id: vid,
                    outlet_id: r.outlet_id,
                    level: r.level,
                    created_at: r.created_at,
                    total_answers: 0,
                };
            }
            byVisit[vid].total_answers += 1;
            if (!byVisit[vid].created_at) byVisit[vid].created_at = r.created_at;
        });
        return Object.values(byVisit).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    function renderVisitsList() {
        const visits = getVisitsSummary();
        const body = document.getElementById('visitsTableBody');
        const empty = document.getElementById('visitsTableEmpty');
        const wrap = document.querySelector('#view-visits .fb-table-wrap');
        const countEl = document.getElementById('visitsCount');
        if (countEl) countEl.textContent = `${visits.length} visit${visits.length === 1 ? '' : 's'}`;
        if (!body) return;

        if (!visits.length) {
            wrap?.classList.add('hidden');
            empty?.classList.remove('hidden');
            return;
        }
        wrap?.classList.remove('hidden');
        empty?.classList.add('hidden');

        body.innerHTML = visits.map(v => {
            const lvl = inferLevel(v.level, v.outlet_id);
            return `<tr>
                <td style="font-weight:700">${v.visit_id}</td>
                <td style="font-size:0.85rem;color:var(--text-secondary)">${escapeHtml(outletCode(v.outlet_id))}</td>
                <td>${escapeHtml(outletName(v.outlet_id))}</td>
                <td><span class="fb-type-badge ${lvl}">${visitTypeLabel(lvl)}</span></td>
                <td>${v.total_answers}</td>
                <td style="font-size:0.85rem;color:var(--text-secondary);white-space:nowrap">${formatDateLong(v.created_at)}</td>
                <td class="ta-right"><button class="btn btn-sm btn-ghost" data-visit-view="${v.visit_id}">View</button></td>
            </tr>`;
        }).join('');

        body.querySelectorAll('[data-visit-view]').forEach(btn => {
            btn.addEventListener('click', () => openVisitDetail(parseInt(btn.dataset.visitView)));
        });
    }

    // ---- Visit detail ----
    async function openVisitDetail(visitId) {
        showView('visit-detail');
        const qaEl = document.getElementById('visitDetailQa');
        const outletGrid = document.getElementById('visitOutletGrid');
        if (qaEl) qaEl.innerHTML = '<div class="fbi-empty">Loading…</div>';
        if (outletGrid) outletGrid.innerHTML = '';
        try {
            const res = await fetch(`/api/visit/${visitId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            renderVisitDetail(data);
        } catch (e) {
            console.warn('Visit detail load failed:', e);
            if (qaEl) qaEl.innerHTML = `<div class="fbi-empty">Could not load visit ${visitId}.</div>`;
        }
    }

    function renderVisitDetail(data) {
        const titleEl = document.getElementById('visitDetailTitle');
        if (titleEl) titleEl.textContent = `Feedback Details · Visit #${data.visit_id}`;

        const outlet = _fbOutletsById[data.outlet_id] || {};
        const lvl = inferLevel(data.level, data.outlet_id);
        const outletGrid = document.getElementById('visitOutletGrid');
        const pairs = [
            ['Outlet Code', outlet.outlet_code || '—'],
            ['Outlet Name', outlet.outlet_name || (data.outlet_id != null ? `Outlet #${data.outlet_id}` : '—')],
            ['Owner', outlet.owner_name || '—'],
            ['Mobile', outlet.mobile || '—'],
            ['Visit Type', visitTypeLabel(lvl)],
            ['Channel', outlet.channel || '—'],
            ['Address', [outlet.address, outlet.city, outlet.state].filter(Boolean).join(', ') || '—'],
            ['Visited On', formatDateLong(data.created_at)],
        ];
        if (outletGrid) {
            outletGrid.innerHTML = pairs.map(([k, v]) => `
                <div class="visit-outlet-cell">
                    <span class="visit-outlet-key">${escapeHtml(k)}</span>
                    <span class="visit-outlet-val">${escapeHtml(v)}</span>
                </div>`).join('');
        }

        const qaEl = document.getElementById('visitDetailQa');
        if (!qaEl) return;
        const answers = data.answers || [];
        if (!answers.length) {
            qaEl.innerHTML = '<div class="card"><div class="fbi-empty">No answers recorded for this visit.</div></div>';
            return;
        }

        qaEl.innerHTML = answers.map(a => {
            const q = _fbQuestionsById[a.question_id] || {};
            const qno = q.question_no || `Q${a.question_id}`;
            const qtext = q.question_text || '';
            const ratingBlock = a.rating != null
                ? `<div class="qa-rating"><span class="qa-stars">${'★'.repeat(a.rating)}${'☆'.repeat(5 - a.rating)}</span><span class="qa-rating-val">${a.rating} Rating</span></div>`
                : '';
            const textAnswer = a.answer_text && String(a.answer_text).trim() ? escapeHtml(a.answer_text) : '<span class="qa-empty">—</span>';
            const voiceAnswer = a.voice_text && String(a.voice_text).trim()
                ? `<div class="qa-section"><span class="qa-section-label">Transcribed Voice Text</span><p class="qa-voice">${escapeHtml(a.voice_text)}</p></div>`
                : '';
            return `
                <div class="card qa-card">
                    <div class="qa-header">
                        <span class="qa-tag">${escapeHtml(qno)}</span>
                        <h4 class="qa-question">${escapeHtml(qtext) || 'Question'}</h4>
                    </div>
                    ${ratingBlock}
                    <div class="qa-section">
                        <span class="qa-section-label">Submitted Answer</span>
                        <p class="qa-answer">${textAnswer}</p>
                    </div>
                    ${voiceAnswer}
                    <div class="qa-media-row">
                        ${mediaBlock('Image Capture', a.image_path, 'image')}
                        ${mediaBlock('Video Recording', a.video_path, 'video')}
                        ${mediaBlock('Audio Note', a.audio_path, 'audio')}
                    </div>
                </div>`;
        }).join('');
    }

    const MEDIA_BASE_URL = 'https://market.iearnportal.com';

    function mediaUrl(path) {
        if (!path) return null;
        const p = String(path).trim();
        if (!p || p === 'NULL') return null;
        if (/^https?:\/\//i.test(p)) return p;
        return MEDIA_BASE_URL + (p.startsWith('/') ? p : '/' + p);
    }

    function mediaBlock(label, path, kind) {
        const url = mediaUrl(path);
        if (!url) {
            return `<div class="qa-media qa-media-${kind}">
                <span class="qa-media-label">${escapeHtml(label)}</span>
                <span class="qa-media-val empty">—</span>
            </div>`;
        }
        let player = '';
        if (kind === 'image') {
            player = `<a class="qa-media-img" href="${escapeHtml(url)}" target="_blank" rel="noopener">
                <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('qa-media-err')">
            </a>`;
        } else if (kind === 'audio') {
            player = `<audio class="qa-media-audio" controls preload="none" src="${escapeHtml(url)}"></audio>`;
        } else if (kind === 'video') {
            player = `<video class="qa-media-video" controls preload="none" src="${escapeHtml(url)}"></video>`;
        }
        return `<div class="qa-media qa-media-${kind} has">
            <span class="qa-media-label">${escapeHtml(label)}</span>
            ${player}
        </div>`;
    }

    document.getElementById('visitDetailBack')?.addEventListener('click', () => showView('visits'));

    document.getElementById('visitDetailExport')?.addEventListener('click', () => {
        const title = document.getElementById('visitDetailTitle')?.textContent || 'visit';
        const idMatch = title.match(/#(\d+)/);
        if (!idMatch) return;
        const vid = parseInt(idMatch[1]);
        const rows = _fbData.filter(r => r.visit_id === vid);
        exportCsv(rows, `visit_${vid}.csv`);
    });

    // ---- Export CSV (dashboard) ----
    function exportCsv(rows, filename) {
        if (!rows.length) return;
        const headers = ['visit_id','outlet_code','outlet_name','question_no','question_text','rating','answer_text','voice_text','created_at'];
        let csv = headers.join(',') + '\n';
        rows.forEach(r => {
            const q = _fbQuestionsById[r.question_id] || {};
            const o = _fbOutletsById[r.outlet_id] || {};
            const enriched = {
                visit_id: r.visit_id,
                outlet_code: o.outlet_code || '',
                outlet_name: o.outlet_name || '',
                question_no: q.question_no || '',
                question_text: q.question_text || '',
                rating: r.rating,
                answer_text: r.answer_text,
                voice_text: r.voice_text,
                created_at: r.created_at,
            };
            const row = headers.map(h => {
                const val = enriched[h] != null ? enriched[h] : '';
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csv += row.join(',') + '\n';
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    document.getElementById('fbDownloadBtn')?.addEventListener('click', () => {
        exportCsv(_fbFiltered, 'feedback_responses.csv');
    });

    document.getElementById('sidebarLogout')?.addEventListener('click', () => {
        showNotice('Logout is a placeholder in this UAT build.', 'info');
    });

    // Bootstrap
    (async () => {
        await loadFeedbackMeta();
        loadFeedbackData();
    })();
});
