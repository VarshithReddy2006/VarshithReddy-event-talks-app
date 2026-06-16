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
        lastFetched: ''
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
        btnSaveSettings: document.getElementById('btn-save-settings'),
        
        // AI Generator
        aiToneSelect: document.getElementById('ai-tone-select'),
        btnGenerateAi: document.getElementById('btn-generate-ai'),
        aiSpinner: document.getElementById('ai-spinner'),
        
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
        
        appState.releaseNotes.forEach(group => {
            totalUpdates += group.updates.length;
            group.updates.forEach(u => {
                if (u.category && u.category.toLowerCase() === 'feature') {
                    featuresCount++;
                }
            });
        });
        
        elements.statTotalUpdates.textContent = totalUpdates;
        elements.statFeaturesCount.textContent = featuresCount;
        elements.statDaysCovered.textContent = daysCovered;
    }

    // --- Filtering & Searching Logic ---
    function getFilteredNotes() {
        const query = appState.searchQuery.toLowerCase().trim();
        const category = appState.activeCategory;
        
        let filtered = [];
        
        appState.releaseNotes.forEach(group => {
            const matchedUpdates = group.updates.filter(update => {
                // Filter by category
                const catMatches = (category === 'all' || update.category.toLowerCase() === category.toLowerCase());
                
                // Filter by search text
                const textMatches = (!query || 
                    update.text.toLowerCase().includes(query) || 
                    update.category.toLowerCase().includes(query) ||
                    group.date.toLowerCase().includes(query)
                );
                
                return catMatches && textMatches;
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
                
                cardDiv.innerHTML = `
                    <div class="card-header">
                        <div class="card-title-area">
                            <div class="card-select-checkbox">
                                <i class="fa-solid fa-check"></i>
                            </div>
                            <span class="badge ${badgeClass}">${badgeText}</span>
                        </div>
                        <div class="card-actions">
                            <button class="btn-icon-sm btn-tweet-sm btn-card-tweet" title="Tweet this update">
                                <i class="fa-brands fa-x-twitter"></i>
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

    // --- API Key / Settings Modal Management ---
    function openSettingsModal() {
        const key = localStorage.getItem('gemini_api_key') || '';
        elements.geminiKeyInput.value = key;
        elements.settingsModal.classList.add('active');
    }

    function closeSettingsModal() {
        elements.settingsModal.classList.remove('active');
    }

    function saveSettings() {
        const key = elements.geminiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            showToast('Gemini API key saved successfully!', 'success');
        } else {
            localStorage.removeItem('gemini_api_key');
            showToast('Gemini API key cleared.', 'warning');
        }
        closeSettingsModal();
    }

    // --- AI Tweet Generation ---
    async function generateAiTweet() {
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
        const originalBtnText = elements.btnGenerateAi.querySelector('span').textContent;
        elements.btnGenerateAi.querySelector('span').textContent = 'Drafting...';

        try {
            const tone = elements.aiToneSelect.value;
            const response = await fetch('/api/generate-tweet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Gemini-Key': apiKey
                },
                body: JSON.stringify({
                    text: appState.selectedUpdate.text,
                    date: appState.selectedUpdate.date,
                    category: appState.selectedUpdate.category,
                    tone: tone
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || `Server returned ${response.status}`);
            }

            const data = await response.json();
            if (data.tweet) {
                elements.tweetTextarea.value = data.tweet;
                updateCharCount();
                showToast(`Tweet generated with ${tone} tone!`, 'success');
            } else {
                throw new Error('No tweet returned by generator.');
            }

        } catch (error) {
            console.error('AI Tweet generation error:', error);
            showToast(error.message, 'error');
        } finally {
            elements.btnGenerateAi.disabled = false;
            elements.aiSpinner.style.display = 'none';
            elements.btnGenerateAi.querySelector('span').textContent = originalBtnText;
        }
    }

    // --- Tweet Composers & Modal ---
    function generateInitialTweetText(date, category, text) {
        const header = `🚀 BigQuery Update [${date}] • #${category}\n\n`;
        const footer = `\n\n#BigQuery #GCP #Cloud`;
        
        // Character Limits (Twitter max is 280)
        const allowedBodyLength = 280 - header.length - footer.length;
        
        let body = text;
        if (body.length > allowedBodyLength) {
            body = body.substring(0, allowedBodyLength - 3) + '...';
        }
        
        return `${header}${body}${footer}`;
    }

    function openTweetModal() {
        if (!appState.selectedUpdate) return;
        
        const { date, category, text } = appState.selectedUpdate;
        
        // Load original snippet for user reference
        elements.modalSnippetText.textContent = text;
        
        // Compile initial draft
        const initialText = generateInitialTweetText(date, category, text);
        elements.tweetTextarea.value = initialText;
        
        updateCharCount();
        
        // Display modal
        elements.tweetModal.classList.add('active');
        elements.tweetTextarea.focus();
    }

    function closeTweetModal() {
        elements.tweetModal.classList.remove('active');
    }

    function updateCharCount() {
        const length = elements.tweetTextarea.value.length;
        elements.charCount.textContent = length;
        
        // Style changes depending on character allowance
        elements.charCounter.className = 'char-counter';
        if (length > 280) {
            elements.charCounter.classList.add('danger');
        } else if (length > 250) {
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

    // AI Tweet Generation Event
    elements.btnGenerateAi.addEventListener('click', generateAiTweet);

    // Textarea typing character count listener
    elements.tweetTextarea.addEventListener('input', updateCharCount);

    // Hashtag Suggesters
    elements.tagSuggestions.forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag');
            const currentVal = elements.tweetTextarea.value;
            
            // Check if tag already exists in string to prevent duplicates
            if (currentVal.toLowerCase().includes(tag.toLowerCase())) {
                showToast(`Tag ${tag} is already in the tweet!`, 'warning');
                return;
            }
            
            // Append with spacer if needed
            if (currentVal.endsWith('\n') || currentVal.endsWith(' ')) {
                elements.tweetTextarea.value += tag;
            } else {
                elements.tweetTextarea.value += ' ' + tag;
            }
            
            updateCharCount();
            elements.tweetTextarea.focus();
        });
    });

    // Submit Tweet (Redirects to Web Intent)
    elements.btnModalSubmit.addEventListener('click', () => {
        const text = elements.tweetTextarea.value;
        
        if (text.length > 280) {
            showToast('Cannot tweet! Content exceeds 280 characters limit.', 'error');
            return;
        }
        
        if (text.trim().length === 0) {
            showToast('Cannot tweet empty message.', 'error');
            return;
        }
        
        // Encode and redirect
        const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(tweetUrl, '_blank');
        
        closeTweetModal();
        deselectUpdate();
        showToast('Redirected to Twitter/X to post your update!', 'success');
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
    fetchReleaseNotes();
});
