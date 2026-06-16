/**
 * BigQuery Release Notes Hub & Social Compiler
 * Frontend JavaScript Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    let appState = {
        releaseNotes: [],      // Raw list of date groups from API
        selectedUpdate: null,   // Selected update object: { id, date, category, text, html }
        searchQuery: '',        // Current search input value
        activeCategory: 'all',  // Current active category filter
        activeTag: 'all',       // Current active tag/domain filter
        starredIds: new Set(),  // Set of starred update IDs
        lastFetched: '',
        activePlatform: 'twitter' // Current active composer platform: twitter, linkedin, slack
    };

    // --- DOM Elements ---
    const elements = {
        btnRefresh: document.getElementById('btn-refresh'),
        refreshIcon: document.getElementById('refresh-icon'),
        lastUpdatedTime: document.getElementById('last-updated-time'),
        
        searchInput: document.getElementById('search-input'),
        searchClearBtn: document.getElementById('search-clear-btn'),
        filterCategories: document.getElementById('filter-categories'),
        btnClearFilters: document.getElementById('btn-clear-filters'),
        
        feedSkeleton: document.getElementById('feed-skeleton'),
        feedContent: document.getElementById('feed-content'),
        feedEmpty: document.getElementById('feed-empty'),
        
        // Sidebar stats
        statTotalUpdates: document.getElementById('stat-total-updates'),
        statFeaturesCount: document.getElementById('stat-features-count'),
        statDaysCovered: document.getElementById('stat-days-covered'),
        statStarredCount: document.getElementById('stat-starred-count'),
        
        // Floating action bar
        floatingActionBar: document.getElementById('floating-action-bar'),
        selectedCardInfo: document.getElementById('selected-card-info'),
        btnCancelSelection: document.getElementById('btn-cancel-selection'),
        btnTweetSelected: document.getElementById('btn-tweet-selected'),
        
        // Modal
        tweetModal: document.getElementById('tweet-modal'),
        btnCloseModal: document.getElementById('btn-close-modal'),
        modalSnippetText: document.getElementById('modal-snippet-text'),
        tweetTextarea: document.getElementById('tweet-textarea'),
        charCount: document.getElementById('char-count'),
        charCounter: document.getElementById('char-counter'),
        btnModalCancel: document.getElementById('btn-modal-cancel'),
        btnModalSubmit: document.getElementById('btn-modal-submit'),
        tagSuggestions: document.querySelectorAll('.tag-suggestion'),
        
        // Settings Modal
        btnSettings: document.getElementById('btn-settings'),
        settingsModal: document.getElementById('settings-modal'),
        btnCloseSettings: document.getElementById('btn-close-settings'),
        geminiKeyInput: document.getElementById('gemini-key-input'),
        slackUrlInput: document.getElementById('slack-url-input'),
        btnSaveSettings: document.getElementById('btn-save-settings'),
        
        // AI Generator
        aiToneSelect: document.getElementById('ai-tone-select'),
        btnGenerateAi: document.getElementById('btn-generate-ai'),
        btnGenerateAiText: document.getElementById('btn-generate-ai-text'),
        aiSpinner: document.getElementById('ai-spinner'),

        // Composer Multi-Platform Tab Elements
        composerTabBtns: document.querySelectorAll('.composer-tab-btn'),
        modalTitleIcon: document.getElementById('modal-title-icon'),
        modalTitleText: document.getElementById('modal-title-text'),
        composerTextareaLabel: document.getElementById('composer-textarea-label'),
        submitBtnIcon: document.getElementById('submit-btn-icon'),
        submitBtnText: document.getElementById('submit-btn-text'),
        
        // Tag Elements
        tagFiltersContainer: document.getElementById('tag-filters'),
        tagsBreakdownList: document.getElementById('tags-breakdown-list'),
        
        // Toasts
        toastContainer: document.getElementById('toast-container')
    };

    // --- Toast Notifications ---
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-circle-check';
        if (type === 'error') iconClass = 'fa-circle-xmark';
        if (type === 'warning') iconClass = 'fa-circle-exclamation';
        
        toast.innerHTML = `
            <i class="fa-solid ${iconClass} toast-icon"></i>
            <div class="toast-content">${message}</div>
        `;
        
        elements.toastContainer.appendChild(toast);
        
        // Auto remove toast
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    }

    // --- Fetch & Parse Data ---
    async function fetchReleaseNotes(forceRefresh = false) {
        setLoadingState(true);
        deselectUpdate();
        
        const url = `/api/release-notes${forceRefresh ? '?refresh=true' : ''}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            appState.releaseNotes = result.data || [];
            appState.lastFetched = result.last_fetched || 'Just now';
            
            elements.lastUpdatedTime.textContent = `Last sync: ${appState.lastFetched}`;
            
            if (result.warning) {
                showToast(result.warning, 'warning');
            } else {
                showToast(forceRefresh ? 'Release notes synchronized!' : 'Release notes loaded.', 'success');
            }
            
            calculateStats();
            renderFeed();
            
        } catch (error) {
            console.error('Error fetching release notes:', error);
            showToast(`Error: ${error.message}`, 'error');
            elements.lastUpdatedTime.textContent = 'Sync failed';
            
            // If we have no data, show empty state
            if (appState.releaseNotes.length === 0) {
                elements.feedSkeleton.style.display = 'none';
                elements.feedEmpty.style.display = 'flex';
            }
        } finally {
            setLoadingState(false);
        }
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            elements.btnRefresh.disabled = true;
            elements.refreshIcon.classList.add('spinning');
            elements.feedContent.style.display = 'none';
            elements.feedEmpty.style.display = 'none';
            elements.feedSkeleton.style.display = 'block';
        } else {
            elements.btnRefresh.disabled = false;
            elements.refreshIcon.classList.remove('spinning');
            elements.feedSkeleton.style.display = 'none';
        }
    }

    // --- Metrics / Stats ---
    function calculateStats() {
        let totalUpdates = 0;
        let featuresCount = 0;
        let daysCovered = appState.releaseNotes.length;
        
        // Count updates per domain tag
        let tagCounts = {};
        
        appState.releaseNotes.forEach(group => {
            totalUpdates += group.updates.length;
            group.updates.forEach(u => {
                if (u.category && u.category.toLowerCase() === 'feature') {
                    featuresCount++;
                }
                if (u.tags) {
                    u.tags.forEach(tag => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                }
            });
        });
        
        elements.statTotalUpdates.textContent = totalUpdates;
        elements.statFeaturesCount.textContent = featuresCount;
        elements.statDaysCovered.textContent = daysCovered;
        elements.statStarredCount.textContent = appState.starredIds.size;
        
        // Render tag breakdown list in the sidebar
        elements.tagsBreakdownList.innerHTML = '';
        
        // Sort tags by frequency
        const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
        
        sortedTags.forEach(tag => {
            const count = tagCounts[tag];
            const percent = totalUpdates > 0 ? Math.round((count / totalUpdates) * 100) : 0;
            
            const tagStatItem = document.createElement('div');
            tagStatItem.className = 'tag-stat-item';
            tagStatItem.style.display = 'flex';
            tagStatItem.style.flexDirection = 'column';
            tagStatItem.style.gap = '0.25rem';
            tagStatItem.style.marginBottom = '0.55rem';
            
            tagStatItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600;">
                    <span style="color: var(--text-secondary);">${tag}</span>
                    <span style="color: var(--text-primary);">${count}</span>
                </div>
                <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.03); border-radius: var(--radius-full); overflow: hidden; border: 1px solid var(--border-color);">
                    <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, var(--accent-indigo) 0%, var(--accent-cyan) 100%); border-radius: var(--radius-full);"></div>
                </div>
            `;
            
            elements.tagsBreakdownList.appendChild(tagStatItem);
        });

        // Render tag filter chips in control panel
        elements.tagFiltersContainer.innerHTML = '';
        
        // Restore Domain label
        const spanSpan = document.createElement('span');
        spanSpan.style.fontSize = '0.8rem';
        spanSpan.style.fontWeight = '600';
        spanSpan.style.color = 'var(--text-muted)';
        spanSpan.style.textTransform = 'uppercase';
        spanSpan.style.marginRight = '0.5rem';
        spanSpan.textContent = 'Domain:';
        elements.tagFiltersContainer.appendChild(spanSpan);

        // Add "All Domains" chip
        const allDomainsBtn = document.createElement('button');
        allDomainsBtn.className = `filter-chip ${appState.activeTag === 'all' ? 'active' : ''}`;
        allDomainsBtn.setAttribute('data-tag', 'all');
        allDomainsBtn.style.padding = '0.35rem 0.85rem';
        allDomainsBtn.style.fontSize = '0.8rem';
        allDomainsBtn.textContent = `All Domains (${totalUpdates})`;
        allDomainsBtn.addEventListener('click', () => {
            selectTagFilter('all', allDomainsBtn);
        });
        elements.tagFiltersContainer.appendChild(allDomainsBtn);

        // Add each tag chip
        sortedTags.forEach(tag => {
            const count = tagCounts[tag];
            const btn = document.createElement('button');
            btn.className = `filter-chip ${appState.activeTag === tag ? 'active' : ''}`;
            btn.setAttribute('data-tag', tag);
            btn.style.padding = '0.35rem 0.85rem';
            btn.style.fontSize = '0.8rem';
            btn.textContent = `${tag} (${count})`;
            btn.addEventListener('click', () => {
                selectTagFilter(tag, btn);
            });
            elements.tagFiltersContainer.appendChild(btn);
        });
    }

    function selectTagFilter(tag, chipElement) {
        elements.tagFiltersContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chipElement.classList.add('active');
        appState.activeTag = tag;
        renderFeed();
    }

    // --- Filtering & Searching Logic ---
    function getFilteredNotes() {
        const query = appState.searchQuery.toLowerCase().trim();
        const category = appState.activeCategory;
        const tag = appState.activeTag;
        
        let filtered = [];
        
        appState.releaseNotes.forEach(group => {
            const matchedUpdates = group.updates.filter(update => {
                // Filter by category
                const catMatches = (category === 'all' || 
                                    (category === 'starred' && appState.starredIds.has(update.id)) ||
                                    update.category.toLowerCase() === category.toLowerCase());
                
                // Filter by tag
                const tagMatches = (tag === 'all' || (update.tags && update.tags.includes(tag)));
                
                // Filter by search text
                const textMatches = (!query || 
                    update.text.toLowerCase().includes(query) || 
                    update.category.toLowerCase().includes(query) ||
                    group.date.toLowerCase().includes(query) ||
                    (update.tags && update.tags.some(t => t.toLowerCase().includes(query)))
                );
                
                return catMatches && tagMatches && textMatches;
            });
            
            if (matchedUpdates.length > 0) {
                filtered.push({
                    date: group.date,
                    updated: group.updated,
                    updates: matchedUpdates
                });
            }
        });
        
        return filtered;
    }

    // --- Render Feed ---
    function renderFeed() {
        const filtered = getFilteredNotes();
        elements.feedContent.innerHTML = '';
        
        if (filtered.length === 0) {
            elements.feedContent.style.display = 'none';
            elements.feedEmpty.style.display = 'flex';
            return;
        }
        
        elements.feedEmpty.style.display = 'none';
        elements.feedContent.style.display = 'block';
        
        filtered.forEach(group => {
            const dateGroupDiv = document.createElement('div');
            dateGroupDiv.className = 'date-group';
            
            dateGroupDiv.innerHTML = `
                <div class="date-header">
                    <i class="fa-regular fa-calendar-days"></i>
                    <h2>${group.date}</h2>
                    <div class="date-line"></div>
                </div>
                <div class="updates-list" id="list-${group.date.replace(/[^a-zA-Z0-9]/g, '_')}"></div>
            `;
            
            elements.feedContent.appendChild(dateGroupDiv);
            const listDiv = dateGroupDiv.querySelector('.updates-list');
            
            group.updates.forEach(update => {
                const cardDiv = document.createElement('div');
                cardDiv.className = 'update-card';
                cardDiv.setAttribute('data-id', update.id);
                cardDiv.setAttribute('data-cat', update.category);
                
                // Determine if this card is currently selected
                const isSelected = appState.selectedUpdate && appState.selectedUpdate.id === update.id;
                if (isSelected) {
                    cardDiv.classList.add('selected');
                }
                
                const badgeClass = `badge-${update.category.toLowerCase()}`;
                const badgeText = update.category;
                
                const isStarred = appState.starredIds.has(update.id);
                
                cardDiv.innerHTML = `
                    <div class="card-header">
                        <div class="card-title-area" style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div class="card-select-checkbox">
                                    <i class="fa-solid fa-check"></i>
                                </div>
                                <span class="badge ${badgeClass}">${badgeText}</span>
                            </div>
                            <div class="card-tags" style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.25rem;">
                                ${update.tags ? update.tags.map(t => `<span class="tag-badge" style="font-size: 0.7rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); color: var(--text-secondary); padding: 0.15rem 0.5rem; border-radius: var(--radius-sm); font-weight: 500;">${t}</span>`).join('') : ''}
                            </div>
                        </div>
                        <div class="card-actions">
                            <button class="btn-icon-sm btn-star-card ${isStarred ? 'starred' : ''}" title="${isStarred ? 'Remove Bookmark' : 'Bookmark Update'}" style="${isStarred ? 'color: #f59e0b; background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.3);' : ''}">
                                <i class="${isStarred ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                            </button>
                            <button class="btn-icon-sm btn-tweet-sm btn-card-tweet" title="Share this update">
                                <i class="fa-solid fa-share-nodes"></i>
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${update.html}
                    </div>
                `;
                
                // Card selection click event
                cardDiv.addEventListener('click', (e) => {
                    // Prevent trigger twice if clicking the tweet button inside card
                    if (e.target.closest('.btn-card-tweet')) {
                        return;
                    }
                    toggleCardSelection(update, group.date, cardDiv);
                });
                
                // Single card instant tweet button click event
                const cardTweetBtn = cardDiv.querySelector('.btn-card-tweet');
                cardTweetBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectUpdate(update, group.date);
                    openTweetModal();
                });

                // Single card star button click event
                const cardStarBtn = cardDiv.querySelector('.btn-star-card');
                cardStarBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleStarUpdate(update);
                });
                
                listDiv.appendChild(cardDiv);
            });
        });
    }

    // --- Card Selection Management ---
    function toggleCardSelection(update, date, cardElement) {
        if (appState.selectedUpdate && appState.selectedUpdate.id === update.id) {
            deselectUpdate();
        } else {
            // Remove selection style from any previously selected card elements
            document.querySelectorAll('.update-card.selected').forEach(card => {
                card.classList.remove('selected');
            });
            
            selectUpdate(update, date);
            cardElement.classList.add('selected');
        }
    }

    function selectUpdate(update, date) {
        appState.selectedUpdate = {
            id: update.id,
            date: date,
            category: update.category,
            text: update.text,
            html: update.html
        };
        
        // Update floating action bar
        elements.selectedCardInfo.innerHTML = `<strong>1 Update Selected</strong> (${date} - ${update.category})`;
        elements.floatingActionBar.classList.add('active');
    }

    function deselectUpdate() {
        appState.selectedUpdate = null;
        elements.floatingActionBar.classList.remove('active');
        document.querySelectorAll('.update-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
    }

    function toggleStarUpdate(update) {
        const isStarred = appState.starredIds.has(update.id);
        if (isStarred) {
            appState.starredIds.delete(update.id);
            showToast('Removed from Bookmarks.', 'warning');
        } else {
            appState.starredIds.add(update.id);
            showToast('Added to Bookmarks!', 'success');
        }
        
        localStorage.setItem('starred_updates_ids', JSON.stringify(Array.from(appState.starredIds)));
        
        calculateStats();
        renderFeed();
    }

    // --- API Key / Settings Modal Management ---
    function openSettingsModal() {
        elements.geminiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
        elements.slackUrlInput.value = localStorage.getItem('slack_webhook_url') || '';
        elements.settingsModal.classList.add('active');
    }

    function closeSettingsModal() {
        elements.settingsModal.classList.remove('active');
    }

    function saveSettings() {
        const key = elements.geminiKeyInput.value.trim();
        const slackUrl = elements.slackUrlInput.value.trim();
        
        if (key) {
            localStorage.setItem('gemini_api_key', key);
        } else {
            localStorage.removeItem('gemini_api_key');
        }
        
        if (slackUrl) {
            localStorage.setItem('slack_webhook_url', slackUrl);
        } else {
            localStorage.removeItem('slack_webhook_url');
        }
        
        showToast('Settings saved successfully!', 'success');
        closeSettingsModal();
    }

    // --- AI Post Generation ---
    async function generateAiPost() {
        const apiKey = localStorage.getItem('gemini_api_key');
        if (!apiKey) {
            showToast('Please set your Gemini API key in settings first.', 'warning');
            openSettingsModal();
            return;
        }

        if (!appState.selectedUpdate) {
            showToast('No update selected to draft.', 'error');
            return;
        }

        // Set Loading State
        elements.btnGenerateAi.disabled = true;
        elements.aiSpinner.style.display = 'inline-block';
        const originalBtnText = elements.btnGenerateAiText.textContent;
        elements.btnGenerateAiText.textContent = 'Drafting...';

        try {
            const tone = elements.aiToneSelect.value;
            const platform = appState.activePlatform;
            const response = await fetch('/api/generate-post', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Gemini-Key': apiKey
                },
                body: JSON.stringify({
                    text: appState.selectedUpdate.text,
                    date: appState.selectedUpdate.date,
                    category: appState.selectedUpdate.category,
                    tone: tone,
                    platform: platform
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `Server returned ${response.status}`);
            }

            const data = await response.json();
            if (data.post) {
                elements.tweetTextarea.value = data.post;
                updateCharCount();
                showToast(`${platform.toUpperCase()} draft generated with ${tone} tone!`, 'success');
            } else {
                throw new Error('No content returned by generator.');
            }

        } catch (error) {
            console.error('AI Post generation error:', error);
            showToast(error.message, 'error');
        } finally {
            elements.btnGenerateAi.disabled = false;
            elements.aiSpinner.style.display = 'none';
            elements.btnGenerateAiText.textContent = originalBtnText;
        }
    }

    // --- Tab / Platform UI Swapping ---
    function switchPlatformTab(platform) {
        appState.activePlatform = platform;
        
        // Update active class on tab buttons
        elements.composerTabBtns.forEach(btn => {
            if (btn.getAttribute('data-platform') === platform) {
                btn.classList.add('active');
                btn.style.borderBottomColor = 'var(--accent-indigo)';
                btn.style.color = 'var(--text-primary)';
            } else {
                btn.classList.remove('active');
                btn.style.borderBottomColor = 'transparent';
                btn.style.color = 'var(--text-secondary)';
            }
        });
        
        updatePlatformUI();
    }

    function updatePlatformUI() {
        const platform = appState.activePlatform;
        const update = appState.selectedUpdate;
        if (!update) return;

        // Reset submit button classes
        elements.btnModalSubmit.className = 'btn btn-primary';
        
        if (platform === 'twitter') {
            elements.modalTitleIcon.className = 'fa-brands fa-x-twitter title-icon';
            elements.modalTitleIcon.style.color = '#1d9bf0';
            elements.modalTitleText.textContent = 'Compile X / Twitter Post';
            elements.composerTextareaLabel.textContent = 'Customize Tweet Content';
            elements.btnGenerateAiText.textContent = 'Draft Tweet';
            
            elements.submitBtnIcon.className = 'fa-brands fa-x-twitter';
            elements.submitBtnText.textContent = 'Share on X';
            elements.btnModalSubmit.classList.add('btn-tweet');
            
            // Re-draft standard Twitter template
            elements.tweetTextarea.value = generateInitialPostText('twitter', update.date, update.category, update.text);
        } 
        else if (platform === 'linkedin') {
            elements.modalTitleIcon.className = 'fa-brands fa-linkedin title-icon';
            elements.modalTitleIcon.style.color = '#0077b5';
            elements.modalTitleText.textContent = 'Compile LinkedIn Update';
            elements.composerTextareaLabel.textContent = 'Customize LinkedIn Post';
            elements.btnGenerateAiText.textContent = 'Draft Post';
            
            elements.submitBtnIcon.className = 'fa-solid fa-copy';
            elements.submitBtnText.textContent = 'Copy & Open LinkedIn';
            // Custom LinkedIn Styling
            elements.btnModalSubmit.style.backgroundColor = '#0077b5';
            elements.btnModalSubmit.style.boxShadow = '0 4px 12px rgba(0, 119, 181, 0.25)';
            
            elements.tweetTextarea.value = generateInitialPostText('linkedin', update.date, update.category, update.text);
        }
        else if (platform === 'slack') {
            elements.modalTitleIcon.className = 'fa-brands fa-slack title-icon';
            elements.modalTitleIcon.style.color = '#4a154b';
            elements.modalTitleText.textContent = 'Compile Slack Announcement';
            elements.composerTextareaLabel.textContent = 'Customize Slack Message';
            elements.btnGenerateAiText.textContent = 'Draft Announcement';
            
            elements.submitBtnIcon.className = 'fa-solid fa-paper-plane';
            elements.submitBtnText.textContent = 'Post to Slack';
            // Custom Slack Styling
            elements.btnModalSubmit.style.backgroundColor = '#4a154b';
            elements.btnModalSubmit.style.boxShadow = '0 4px 12px rgba(74, 21, 75, 0.25)';
            
            elements.tweetTextarea.value = generateInitialPostText('slack', update.date, update.category, update.text);
        }
        
        updateCharCount();
    }

    function generateInitialPostText(platform, date, category, text) {
        if (platform === 'twitter') {
            const header = `🚀 BigQuery Update [${date}] • #${category}\n\n`;
            const footer = `\n\n#BigQuery #GCP #Cloud`;
            const allowedBodyLength = 280 - header.length - footer.length;
            let body = text;
            if (body.length > allowedBodyLength) {
                body = body.substring(0, allowedBodyLength - 3) + '...';
            }
            return `${header}${body}${footer}`;
        }
        else if (platform === 'linkedin') {
            return `📢 Google Cloud BigQuery Update • ${date}\n\n` +
                   `📍 Category: ${category}\n\n` +
                   `📰 Release Detail:\n${text}\n\n` +
                   `#BigQuery #GoogleCloud #DataEngineering #Analytics`;
        }
        else if (platform === 'slack') {
            return `*📢 BigQuery Update - ${date}* \n` +
                   `• *Category*: _${category}_\n` +
                   `• *Update*: ${text}\n` +
                   `• *Detail URL*: <https://docs.cloud.google.com/feeds/bigquery-release-notes.xml|BigQuery Feed>`;
        }
        return text;
    }

    function openTweetModal() {
        if (!appState.selectedUpdate) return;
        
        const { date, category, text } = appState.selectedUpdate;
        
        // Load original snippet for user reference
        elements.modalSnippetText.textContent = text;
        
        // Reset active platform to Twitter
        appState.activePlatform = 'twitter';
        
        // Style tab buttons resetting active class
        elements.composerTabBtns.forEach(btn => {
            if (btn.getAttribute('data-platform') === 'twitter') {
                btn.classList.add('active');
                btn.style.borderBottomColor = 'var(--accent-indigo)';
                btn.style.color = 'var(--text-primary)';
            } else {
                btn.classList.remove('active');
                btn.style.borderBottomColor = 'transparent';
                btn.style.color = 'var(--text-secondary)';
            }
        });
        
        updatePlatformUI();
        
        // Display modal
        elements.tweetModal.classList.add('active');
        elements.tweetTextarea.focus();
    }

    function closeTweetModal() {
        elements.tweetModal.classList.remove('active');
    }

    function updateCharCount() {
        const length = elements.tweetTextarea.value.length;
        
        // Dynamic character counter limits depending on platform
        let maxLimit = 280;
        if (appState.activePlatform === 'linkedin') maxLimit = 2000;
        if (appState.activePlatform === 'slack') maxLimit = 4000;
        
        elements.charCounter.innerHTML = `<span id="char-count">${length}</span>/${maxLimit}`;
        elements.charCount = document.getElementById('char-count'); // Refresh ref
        
        elements.charCounter.className = 'char-counter';
        if (length > maxLimit) {
            elements.charCounter.classList.add('danger');
        } else if (length > (maxLimit - 30)) {
            elements.charCounter.classList.add('warning');
        }
    }

    // --- Event Listeners Setup ---
    
    // Refresh Button Click
    elements.btnRefresh.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Search input typing
    elements.searchInput.addEventListener('input', (e) => {
        appState.searchQuery = e.target.value;
        if (appState.searchQuery.length > 0) {
            elements.searchClearBtn.style.display = 'block';
        } else {
            elements.searchClearBtn.style.display = 'none';
        }
        renderFeed();
    });

    // Search clear button
    elements.searchClearBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        appState.searchQuery = '';
        elements.searchClearBtn.style.display = 'none';
        renderFeed();
        elements.searchInput.focus();
    });

    // Category chip clicks
    elements.filterCategories.addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        
        // Toggle active states
        elements.filterCategories.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        
        appState.activeCategory = chip.getAttribute('data-category');
        renderFeed();
    });

    // Clear filters button (empty state)
    elements.btnClearFilters.addEventListener('click', () => {
        elements.searchInput.value = '';
        appState.searchQuery = '';
        elements.searchClearBtn.style.display = 'none';
        
        elements.filterCategories.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        elements.filterCategories.querySelector('[data-category="all"]').classList.add('active');
        appState.activeCategory = 'all';
        appState.activeTag = 'all';
        
        calculateStats(); // Refreshes Tag Filters in active state
        renderFeed();
    });

    // Cancel Selection (Floating Bar)
    elements.btnCancelSelection.addEventListener('click', deselectUpdate);

    // Open Modal from Floating Bar
    elements.btnTweetSelected.addEventListener('click', openTweetModal);

    // Close Modal Button (X)
    elements.btnCloseModal.addEventListener('click', closeTweetModal);
    elements.btnModalCancel.addEventListener('click', closeTweetModal);

    // Settings Modal Events
    elements.btnSettings.addEventListener('click', openSettingsModal);
    elements.btnCloseSettings.addEventListener('click', closeSettingsModal);
    elements.btnSaveSettings.addEventListener('click', saveSettings);
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) {
            closeSettingsModal();
        }
    });

    // AI Post Generation Event
    elements.btnGenerateAi.addEventListener('click', generateAiPost);

    // Composer Tab Switching
    elements.composerTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const platform = btn.getAttribute('data-platform');
            switchPlatformTab(platform);
        });
    });

    // Textarea typing character count listener
    elements.tweetTextarea.addEventListener('input', updateCharCount);

    // Hashtag Suggesters
    elements.tagSuggestions.forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            const currentVal = elements.tweetTextarea.value;
            
            if (currentVal.toLowerCase().includes(tag.toLowerCase())) {
                showToast(`Tag ${tag} is already in the post!`, 'warning');
                return;
            }
            
            if (currentVal.endsWith('\n') || currentVal.endsWith(' ')) {
                elements.tweetTextarea.value += tag;
            } else {
                elements.tweetTextarea.value += ' ' + tag;
            }
            
            updateCharCount();
            elements.tweetTextarea.focus();
        });
    });

    // Submit Composer (Multi-Platform Action)
    elements.btnModalSubmit.addEventListener('click', async () => {
        const text = elements.tweetTextarea.value.trim();
        const platform = appState.activePlatform;
        
        if (text.length === 0) {
            showToast('Cannot submit empty message.', 'error');
            return;
        }
        
        let maxLimit = 280;
        if (platform === 'linkedin') maxLimit = 2000;
        if (platform === 'slack') maxLimit = 4000;
        
        if (text.length > maxLimit) {
            showToast(`Content exceeds character limit of ${maxLimit} for ${platform.toUpperCase()}.`, 'error');
            return;
        }
        
        if (platform === 'twitter') {
            const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
            window.open(tweetUrl, '_blank');
            closeTweetModal();
            deselectUpdate();
            showToast('Redirected to Twitter / X!', 'success');
        } 
        else if (platform === 'linkedin') {
            try {
                await navigator.clipboard.writeText(text);
                showToast('LinkedIn draft copied to clipboard!', 'success');
                setTimeout(() => {
                    window.open('https://www.linkedin.com/feed/', '_blank');
                }, 800);
                closeTweetModal();
                deselectUpdate();
            } catch (err) {
                console.error('Failed to copy to clipboard:', err);
                showToast('Could not copy automatically. Please copy text manually.', 'error');
            }
        } 
        else if (platform === 'slack') {
            const webhookUrl = localStorage.getItem('slack_webhook_url');
            if (!webhookUrl) {
                showToast('Please configure your Slack Webhook URL in Settings first.', 'warning');
                closeTweetModal();
                openSettingsModal();
                return;
            }
            
            // Set loading state on submit button
            elements.btnModalSubmit.disabled = true;
            const originalIcon = elements.submitBtnIcon.className;
            elements.submitBtnIcon.className = 'fa-solid fa-spinner fa-spin';
            const originalText = elements.submitBtnText.textContent;
            elements.submitBtnText.textContent = 'Posting...';
            
            try {
                const response = await fetch('/api/send-slack', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: text,
                        webhook_url: webhookUrl
                    })
                });
                
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || `Server returned ${response.status}`);
                }
                
                showToast('Successfully posted to Slack channel!', 'success');
                closeTweetModal();
                deselectUpdate();
            } catch (error) {
                console.error('Slack post error:', error);
                showToast(`Failed to send to Slack: ${error.message}`, 'error');
            } finally {
                elements.btnModalSubmit.disabled = false;
                elements.submitBtnIcon.className = originalIcon;
                elements.submitBtnText.textContent = originalText;
            }
        }
    });

    // Close modal if clicked outside modal-content
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) {
            closeTweetModal();
        }
    });

    // Handle Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTweetModal();
            closeSettingsModal();
            deselectUpdate();
        }
    });

    // --- App Init ---
    const savedStarred = localStorage.getItem('starred_updates_ids');
    if (savedStarred) {
        appState.starredIds = new Set(JSON.parse(savedStarred));
    }
    fetchReleaseNotes();
});
