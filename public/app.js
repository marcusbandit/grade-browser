// State
let assignments = [];
let currentAssignmentIndex = -1;
let currentHandoutIndex = -1;
let currentGradeCheckIndex = 0;
let currentCheckIndex = 0;
let ws = null;
let currentAutoLabPath = null;
let pendingRefreshTimer = null;
let lastFileActivity = null;
let newTimestampDetected = false;
let preservedCheckId = null;
let isGrading = false;
const FILE_ACTIVITY_DELAY = 800;

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = function () {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        refreshAssignments();
    };

    ws.onclose = function () {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = function (error) {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };

    ws.onmessage = function (event) {
        const message = JSON.parse(event.data);
        console.log('WebSocket message:', message);

        if (message.event === 'newReport' || message.event === 'reportChanged') {
            const filePath = message.data.filePath;
            
            if (!filePath.endsWith('-report.html')) {
                return;
            }
            
            // Show grading indicator
            setGradingIndicator(true);
            
            if (currentAssignmentIndex >= 0 && currentHandoutIndex >= 0) {
                const currentHandout = getCurrentHandout();
                if (currentHandout && filePath.includes(currentHandout.name)) {
                    handleNewReport(filePath);
                }
            } else {
                refreshAssignments();
            }
        }
    };
}

function getCurrentHandout() {
    if (currentAssignmentIndex < 0 || currentHandoutIndex < 0) return null;
    const assignment = assignments[currentAssignmentIndex];
    if (!assignment) return null;
    return assignment.handouts[currentHandoutIndex];
}

function handleNewReport(filePath) {
    const timestampMatch = filePath.match(/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})/);
    
    if (!timestampMatch) {
        return;
    }
    
    const newTimestamp = timestampMatch[1];
    const currentHandout = getCurrentHandout();
    const currentTimestamp = currentHandout?.gradeChecks[currentGradeCheckIndex]?.timestamp;
    
    if (newTimestamp === currentTimestamp) {
        refreshAssignments();
        return;
    }
    
    lastFileActivity = Date.now();
    
    if (!newTimestampDetected) {
        newTimestampDetected = true;
        
        if (currentHandout?.gradeChecks[currentGradeCheckIndex]?.checks[currentCheckIndex]) {
            preservedCheckId = currentHandout.gradeChecks[currentGradeCheckIndex].checks[currentCheckIndex].checkId;
        }
        
        updateConnectionStatus('waiting');
    }
    
    if (pendingRefreshTimer) {
        clearTimeout(pendingRefreshTimer);
    }
    
    pendingRefreshTimer = setTimeout(() => {
        updateConnectionStatus(true);
        refreshAssignments(true);
        newTimestampDetected = false;
        setGradingIndicator(false);
    }, FILE_ACTIVITY_DELAY);
}

function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (connected === 'waiting') {
        statusEl.textContent = 'Waiting for files...';
        statusEl.className = 'status waiting';
    } else if (connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'status connected';
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'status disconnected';
    }
}

function setGradingIndicator(active) {
    const indicator = document.getElementById('gradingIndicator');
    if (active) {
        indicator.classList.add('active');
    } else {
        indicator.classList.remove('active');
    }
}

async function setAutoLabPath() {
    const pathInput = document.getElementById('autolabPath');
    const path = pathInput.value.trim();
    
    if (!path) {
        alert('Please enter a path to the AutoLab root directory');
        return;
    }

    try {
        const response = await fetch('/api/set-path', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path: path })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to set path');
        }

        currentAutoLabPath = path;
        refreshAssignments();
        
    } catch (error) {
        console.error('Error setting path:', error);
        alert('Error setting path: ' + error.message);
    }
}

async function refreshAssignments(shouldPreserveCheckId = false) {
    try {
        let targetCheckId = null;
        if (shouldPreserveCheckId && preservedCheckId !== null) {
            targetCheckId = preservedCheckId;
            preservedCheckId = null;
        }

        const url = currentAutoLabPath 
            ? `/api/assignments?path=${encodeURIComponent(currentAutoLabPath)}` 
            : '/api/assignments';
            
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch assignments');
        }

        const newAssignments = await response.json();
        assignments = newAssignments;

        updateAssignmentDropdown();

        if (currentAssignmentIndex < 0 && assignments.length > 0) {
            autoSelectNewest();
        } else if (currentAssignmentIndex >= 0 && currentAssignmentIndex < assignments.length) {
            document.getElementById('assignmentDropdown').value = currentAssignmentIndex;
            onAssignmentChange(true);
            
            if (shouldPreserveCheckId && targetCheckId && currentHandoutIndex >= 0) {
                const handout = getCurrentHandout();
                if (handout && handout.gradeChecks.length > 0) {
                    currentGradeCheckIndex = 0;
                    const checkIdx = handout.gradeChecks[0].checks.findIndex(
                        c => c.checkId === targetCheckId
                    );
                    currentCheckIndex = checkIdx >= 0 ? checkIdx : 0;
                }
                updateCheckDropdown();
                updateTabs();
                updateNavButtons();
                updateReportInfo();
                loadCurrentReport();
            }
        } else if (assignments.length === 0) {
            showEmptyState('No assignments found with grade reports');
        }

        setGradingIndicator(false);

    } catch (error) {
        console.error('Error loading assignments:', error);
        showError('Failed to load assignments: ' + error.message);
    }
}

function autoSelectNewest() {
    let newestTimestamp = '';
    let newestAssignmentIdx = -1;
    let newestHandoutIdx = -1;

    assignments.forEach((assignment, aIdx) => {
        assignment.handouts.forEach((handout, hIdx) => {
            if (handout.gradeChecks && handout.gradeChecks.length > 0) {
                const timestamp = handout.gradeChecks[0].timestamp;
                if (timestamp > newestTimestamp) {
                    newestTimestamp = timestamp;
                    newestAssignmentIdx = aIdx;
                    newestHandoutIdx = hIdx;
                }
            }
        });
    });

    if (newestAssignmentIdx >= 0) {
        currentAssignmentIndex = newestAssignmentIdx;
        currentHandoutIndex = newestHandoutIdx;
        currentGradeCheckIndex = 0;
        currentCheckIndex = 0;

        document.getElementById('assignmentDropdown').value = newestAssignmentIdx;
        updateHandoutDropdown();
        document.getElementById('handoutDropdown').value = newestHandoutIdx;
        updateCheckDropdown();
        document.getElementById('checkDropdown').value = 0;

        updateTabs();
        updateNavButtons();
        updateReportInfo();
        loadCurrentReport();
    } else {
        showEmptyState('No grade reports found. Run some AutoLab tests to generate reports.');
    }
}

function goToNewest() {
    const handout = getCurrentHandout();
    if (!handout || handout.gradeChecks.length === 0) return;
    
    if (currentGradeCheckIndex !== 0) {
        currentGradeCheckIndex = 0;
        currentCheckIndex = 0;
        document.getElementById('checkDropdown').value = 0;
        updateTabs();
        updateNavButtons();
        updateReportInfo();
        loadCurrentReport();
    }
}

function updateAssignmentDropdown() {
    const dropdown = document.getElementById('assignmentDropdown');
    dropdown.innerHTML = '<option value="">-- Select --</option>';
    
    assignments.forEach((assignment, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = assignment.name;
        dropdown.appendChild(option);
    });
}

function updateHandoutDropdown() {
    const handoutDropdown = document.getElementById('handoutDropdown');
    const assignment = assignments[currentAssignmentIndex];
    
    handoutDropdown.innerHTML = '<option value="">-- Select --</option>';
    
    if (assignment) {
        assignment.handouts.forEach((handout, idx) => {
            const option = document.createElement('option');
            option.value = idx;
            option.textContent = handout.name;
            handoutDropdown.appendChild(option);
        });
        handoutDropdown.disabled = false;
    } else {
        handoutDropdown.disabled = true;
    }
}

function updateCheckDropdown() {
    const checkDropdown = document.getElementById('checkDropdown');
    const handout = getCurrentHandout();
    
    checkDropdown.innerHTML = '<option value="">-- Select --</option>';
    
    if (handout && handout.gradeChecks && handout.gradeChecks.length > 0) {
        handout.gradeChecks.forEach((check, idx) => {
            const option = document.createElement('option');
            option.value = idx;
            option.textContent = check.timestamp;
            checkDropdown.appendChild(option);
        });
        checkDropdown.disabled = false;
        checkDropdown.value = currentGradeCheckIndex;
    } else {
        checkDropdown.disabled = true;
    }
}

function onAssignmentChange(preserveHandout = false) {
    const dropdown = document.getElementById('assignmentDropdown');
    const index = parseInt(dropdown.value);
    
    if (isNaN(index) || index < 0) {
        currentAssignmentIndex = -1;
        currentHandoutIndex = -1;
        document.getElementById('handoutDropdown').innerHTML = '<option value="">-- Select --</option>';
        document.getElementById('handoutDropdown').disabled = true;
        document.getElementById('checkDropdown').innerHTML = '<option value="">-- Select --</option>';
        document.getElementById('checkDropdown').disabled = true;
        clearTabs();
        showEmptyState('Select an assignment and handout');
        updateNavButtons();
        updateReportInfo();
        return;
    }

    currentAssignmentIndex = index;
    updateHandoutDropdown();

    if (preserveHandout && currentHandoutIndex >= 0 && currentHandoutIndex < assignments[currentAssignmentIndex].handouts.length) {
        document.getElementById('handoutDropdown').value = currentHandoutIndex;
        updateCheckDropdown();
    } else {
        currentHandoutIndex = -1;
        currentGradeCheckIndex = 0;
        currentCheckIndex = 0;
        document.getElementById('checkDropdown').innerHTML = '<option value="">-- Select --</option>';
        document.getElementById('checkDropdown').disabled = true;
        clearTabs();
        showEmptyState('Select a handout');
    }

    updateNavButtons();
    updateReportInfo();
}

function onHandoutChange() {
    const dropdown = document.getElementById('handoutDropdown');
    const index = parseInt(dropdown.value);
    
    if (isNaN(index) || index < 0) {
        currentHandoutIndex = -1;
        currentGradeCheckIndex = 0;
        currentCheckIndex = 0;
        document.getElementById('checkDropdown').innerHTML = '<option value="">-- Select --</option>';
        document.getElementById('checkDropdown').disabled = true;
        clearTabs();
        showEmptyState('Select a handout');
        updateNavButtons();
        updateReportInfo();
        return;
    }

    currentHandoutIndex = index;
    currentGradeCheckIndex = 0;
    currentCheckIndex = 0;

    updateCheckDropdown();
    updateTabs();
    updateNavButtons();
    updateReportInfo();
    
    const handout = getCurrentHandout();
    if (handout && handout.gradeChecks.length > 0) {
        loadCurrentReport();
    } else {
        showError('No grade checks found for this handout');
    }
}

function onCheckChange() {
    const dropdown = document.getElementById('checkDropdown');
    const index = parseInt(dropdown.value);
    
    if (isNaN(index) || index < 0) return;
    
    currentGradeCheckIndex = index;
    currentCheckIndex = 0;
    
    updateTabs();
    updateNavButtons();
    updateReportInfo();
    loadCurrentReport();
}

function navigateGradeCheck(direction) {
    const handout = getCurrentHandout();
    if (!handout) return;
    
    const gradeChecks = handout.gradeChecks;
    
    if (direction === -1) {
        // Previous (older) = higher index
        if (currentGradeCheckIndex < gradeChecks.length - 1) {
            currentGradeCheckIndex++;
            currentCheckIndex = 0;
            document.getElementById('checkDropdown').value = currentGradeCheckIndex;
            updateTabs();
            updateNavButtons();
            updateReportInfo();
            loadCurrentReport();
        }
    } else {
        // Next (newer) = lower index
        if (currentGradeCheckIndex > 0) {
            currentGradeCheckIndex--;
            currentCheckIndex = 0;
            document.getElementById('checkDropdown').value = currentGradeCheckIndex;
            updateTabs();
            updateNavButtons();
            updateReportInfo();
            loadCurrentReport();
        }
    }
}

function updateNavButtons() {
    const prevBtn = document.getElementById('prevCheckBtn');
    const nextBtn = document.getElementById('nextCheckBtn');
    const newestBtn = document.getElementById('newestBtn');
    
    const handout = getCurrentHandout();
    if (!handout || handout.gradeChecks.length === 0) {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        newestBtn.disabled = true;
        return;
    }

    const gradeChecks = handout.gradeChecks;
    
    prevBtn.disabled = currentGradeCheckIndex >= gradeChecks.length - 1;
    nextBtn.disabled = currentGradeCheckIndex <= 0;
    newestBtn.disabled = currentGradeCheckIndex === 0;
}

function updateReportInfo() {
    const infoEl = document.getElementById('reportInfo');
    
    const handout = getCurrentHandout();
    if (!handout || handout.gradeChecks.length === 0) {
        infoEl.textContent = 'No reports available';
        return;
    }

    const gradeCheck = handout.gradeChecks[currentGradeCheckIndex];
    const check = gradeCheck.checks[currentCheckIndex];
    const total = handout.gradeChecks.length;
    const current = total - currentGradeCheckIndex;
    
    if (check) {
        infoEl.textContent = `Viewing: ${check.filename} | Check ${current}/${total}`;
    } else {
        infoEl.textContent = `Check ${current}/${total}`;
    }
}

function updateTabs() {
    const tabsContainer = document.getElementById('tabs');
    tabsContainer.innerHTML = '';
    
    const handout = getCurrentHandout();
    if (!handout || !handout.gradeChecks || handout.gradeChecks.length === 0) return;
    
    const gradeCheck = handout.gradeChecks[currentGradeCheckIndex];
    if (!gradeCheck || !gradeCheck.checks) return;

    gradeCheck.checks.forEach((check, index) => {
        const tab = document.createElement('button');
        tab.className = 'tab';
        tab.onclick = () => selectTab(index);
        
        const indicator = document.createElement('span');
        indicator.className = `status-indicator ${check.status}`;
        tab.appendChild(indicator);
        
        const labelSpan = document.createElement('span');
        labelSpan.textContent = check.displayName;
        tab.appendChild(labelSpan);
        
        if (index === currentCheckIndex) {
            tab.classList.add('active');
        }
        
        tabsContainer.appendChild(tab);
    });
}

function clearTabs() {
    document.getElementById('tabs').innerHTML = '';
}

function selectTab(index) {
    currentCheckIndex = index;
    updateTabs();
    updateReportInfo();
    loadCurrentReport();
}

async function loadCurrentReport() {
    const handout = getCurrentHandout();
    if (!handout) {
        showEmptyState('Select an assignment and handout');
        return;
    }

    if (!handout.gradeChecks || handout.gradeChecks.length === 0) {
        showError('No grade checks available');
        return;
    }

    const gradeCheck = handout.gradeChecks[currentGradeCheckIndex];
    if (!gradeCheck.checks || gradeCheck.checks.length === 0) {
        showError('No reports in this grade check');
        return;
    }

    const check = gradeCheck.checks[currentCheckIndex];
    if (!check) {
        showError('Report not found');
        return;
    }

    try {
        showLoading();

        const pathParam = currentAutoLabPath 
            ? `?path=${encodeURIComponent(currentAutoLabPath)}` 
            : '';
        const url = `/api/handout-report/${encodeURIComponent(handout.name)}/${gradeCheck.timestamp}/${check.checkId}${pathParam}`;
        
        console.log('Loading report from:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to load report: ${response.status} - ${errText}`);
        }

        const htmlContent = await response.text();
        console.log('Received HTML content, length:', htmlContent.length);

        const frame = document.getElementById('reportFrame');
        frame.classList.remove('hidden');
        frame.srcdoc = htmlContent;
        
        hideLoading();
        hideError();
        hideEmptyState();

    } catch (error) {
        console.error('Error loading report:', error);
        showError('Failed to load report: ' + error.message);
    }
}

function showLoading() {
    document.getElementById('loadingMessage').classList.remove('hidden');
    document.getElementById('reportFrame').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
}

function hideLoading() {
    document.getElementById('loadingMessage').classList.add('hidden');
}

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorMessage').classList.remove('hidden');
    document.getElementById('reportFrame').classList.add('hidden');
    document.getElementById('loadingMessage').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
}

function hideError() {
    document.getElementById('errorMessage').classList.add('hidden');
}

function showEmptyState(message = 'Select an assignment and handout to view reports') {
    const el = document.getElementById('emptyState');
    el.innerHTML = `<div>📋</div><div>${message}</div>`;
    el.classList.remove('hidden');
    document.getElementById('reportFrame').classList.add('hidden');
    document.getElementById('loadingMessage').classList.add('hidden');
    document.getElementById('errorMessage').classList.add('hidden');
}

function hideEmptyState() {
    document.getElementById('emptyState').classList.add('hidden');
}

// Keyboard navigation
document.addEventListener('keydown', function (event) {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') {
        return;
    }

    switch (event.key) {
        case 'ArrowLeft':
            event.preventDefault();
            if (currentCheckIndex > 0) {
                selectTab(currentCheckIndex - 1);
            }
            break;
        case 'ArrowRight':
            event.preventDefault();
            const handout = getCurrentHandout();
            if (handout) {
                const checks = handout.gradeChecks[currentGradeCheckIndex]?.checks || [];
                if (currentCheckIndex < checks.length - 1) {
                    selectTab(currentCheckIndex + 1);
                }
            }
            break;
        case 'ArrowUp':
            event.preventDefault();
            navigateGradeCheck(1);
            break;
        case 'ArrowDown':
            event.preventDefault();
            navigateGradeCheck(-1);
            break;
        case 'r':
        case 'R':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                refreshAssignments();
            }
            break;
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    initWebSocket();
    refreshAssignments();
});

