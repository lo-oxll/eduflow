/**
 * EduFlow Admin Portal - UI Control Functions
 * Handles sidebar navigation, tab switching, and modal management
 */

// ========== SIDEBAR TOGGLE ==========
function toggleAdminSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }
}

// Close sidebar when clicking outside on mobile
document.addEventListener('DOMContentLoaded', function() {
    const overlay = document.getElementById('adminSidebarOverlay');
    if (overlay) {
        overlay.addEventListener('click', function() {
            toggleAdminSidebar();
        });
    }

    // Close sidebar when a nav item is clicked on mobile
    const navItems = document.querySelectorAll('.admin-nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                toggleAdminSidebar();
            }
        });
    });

    // Update academic year display
    updateAdminAcademicYearDisplay();
});

// ========== TAB SWITCHING ==========
function switchAdminTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.admin-tab-content');
    tabContents.forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all nav items
    const navItems = document.querySelectorAll('.admin-nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });

    // Show selected tab
    const selectedTab = document.getElementById('admin-tab-' + tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // Add active class to clicked nav item
    const activeNavItem = document.querySelector(`.admin-nav-item[data-tab="${tabName}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }

    // Auto-load settings when settings tab is opened
    if (tabName === 'settings') {
        loadSystemSettings();
    }
}

// ========== MODAL MANAGEMENT ==========
function showCreateAcademicYearModal() {
    const modal = document.getElementById('createAcademicYearModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeCreateAcademicYearModal() {
    const modal = document.getElementById('createAcademicYearModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function showAllAcademicYearsModal() {
    const modal = document.getElementById('allAcademicYearsModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeAllAcademicYearsModal() {
    const modal = document.getElementById('allAcademicYearsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Close modals when clicking outside the modal content
document.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        if (event.target === modal) {
            const closeButtons = modal.querySelectorAll('.modal-close');
            if (closeButtons.length > 0) {
                closeButtons[0].click();
            }
        }
    });
});

// Close modals with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => {
            if (modal.style.display === 'flex') {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    }
});

// ========== ACADEMIC YEAR DISPLAY ==========
function updateAdminAcademicYearDisplay() {
    // This function updates the academic year display badge
    // It will be called after the admin.js loads the current academic year
    const apiUrl = '/api/academic-years/current';
    
    fetch(apiUrl, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(response => response.json())
    .then(data => {
        const badge = document.getElementById('adminCurrentAcademicYearDisplay');
        if (badge && data.success && data.data) {
            const year = data.data;
            badge.innerHTML = `
                <i class="fas fa-calendar-alt"></i>
                <span>${year.start_year}-${year.end_year}</span>
            `;
        }
    })
    .catch(error => {
        console.error('Error loading academic year:', error);
    });
}

// ========== STATS LOADING ==========
// Called from admin.js after schools and academic years are loaded
function updateDashboardStats() {
    // Use the global 'schools' and 'allAcademicYears' arrays populated by admin.js
    const schoolsArray = (typeof schools !== 'undefined' && Array.isArray(schools)) ? schools : [];
    const yearsArray = (typeof allAcademicYears !== 'undefined' && Array.isArray(allAcademicYears)) ? allAcademicYears : [];

    const totalSchoolsEl   = document.getElementById('adminTotalSchools');
    const totalYearsEl     = document.getElementById('adminTotalYears');
    const activeSchoolsEl  = document.getElementById('adminActiveSchools');
    const suspendedEl      = document.getElementById('adminSuspendedSchools');

    const totalSchools    = schoolsArray.length;
    const activeSchools   = schoolsArray.filter(s => !s.is_suspended).length;
    const suspendedSchools = schoolsArray.filter(s => s.is_suspended).length;
    const totalYears      = yearsArray.length;

    // Animate counter update
    function animateCount(el, target) {
        if (!el) return;
        let start = 0;
        const duration = 600;
        const step = Math.ceil(target / (duration / 16));
        const timer = setInterval(() => {
            start = Math.min(start + step, target);
            el.textContent = start;
            if (start >= target) clearInterval(timer);
        }, 16);
    }

    animateCount(totalSchoolsEl,  totalSchools);
    animateCount(totalYearsEl,    totalYears);
    animateCount(activeSchoolsEl, activeSchools);
    animateCount(suspendedEl,     suspendedSchools);
}

// Expose globally so admin.js can call it after data loads
window.updateDashboardStats = updateDashboardStats;

// ========== SYSTEM SETTINGS ==========
let _currentSettings = {};

async function loadSystemSettings() {
    const loadingEl = document.getElementById('settingsLoading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/settings', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        if (result.success && result.settings) {
            _currentSettings = result.settings;
            _populateSettingsForms(_currentSettings);
        }
    } catch (error) {
        console.warn('Could not load settings from server, using defaults:', error);
        _populateSettingsForms(_getDefaultSettings());
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function _getDefaultSettings() {
    return {
        system: { system_name: 'EduFlow', maintenance_mode: false, default_language: 'ar', allow_registration: false, max_schools: 100 },
        user_management: { min_password_length: 8, require_uppercase: true, require_numbers: true, require_special_chars: false, session_timeout_hours: 24, max_login_attempts: 5, lockout_duration_minutes: 30 },
        data_management: { backup_enabled: true, backup_frequency_days: 7, data_retention_days: 365, export_enabled: true },
        security: { two_factor_required: false, force_https: true, allowed_ips: '', audit_logs_enabled: true, audit_retention_days: 90 },
        interface: { default_theme: 'light', show_animations: true, items_per_page: 20, date_format: 'dd/mm/yyyy' }
    };
}

function _populateSettingsForms(s) {
    _setVal('setting-system-name',       s.system?.system_name        ?? 'EduFlow');
    _setVal('setting-maintenance-mode',  s.system?.maintenance_mode   ?? false);
    _setVal('setting-default-language',  s.system?.default_language   ?? 'ar');
    _setVal('setting-allow-registration',s.system?.allow_registration ?? false);
    _setVal('setting-max-schools',       s.system?.max_schools        ?? 100);

    _setVal('setting-min-password-length',   s.user_management?.min_password_length    ?? 8);
    _setVal('setting-require-uppercase',     s.user_management?.require_uppercase      ?? true);
    _setVal('setting-require-numbers',       s.user_management?.require_numbers        ?? true);
    _setVal('setting-require-special-chars', s.user_management?.require_special_chars  ?? false);
    _setVal('setting-session-timeout',       s.user_management?.session_timeout_hours  ?? 24);
    _setVal('setting-max-login-attempts',    s.user_management?.max_login_attempts     ?? 5);
    _setVal('setting-lockout-duration',      s.user_management?.lockout_duration_minutes ?? 30);

    _setVal('setting-backup-enabled',   s.data_management?.backup_enabled      ?? true);
    _setVal('setting-backup-frequency', s.data_management?.backup_frequency_days ?? 7);
    _setVal('setting-data-retention',   s.data_management?.data_retention_days  ?? 365);
    _setVal('setting-export-enabled',   s.data_management?.export_enabled       ?? true);

    _setVal('setting-2fa-required',     s.security?.two_factor_required  ?? false);
    _setVal('setting-force-https',      s.security?.force_https          ?? true);
    _setVal('setting-allowed-ips',      s.security?.allowed_ips          ?? '');
    _setVal('setting-audit-logs',       s.security?.audit_logs_enabled   ?? true);
    _setVal('setting-audit-retention',  s.security?.audit_retention_days ?? 90);

    _setVal('setting-default-theme',    s.interface?.default_theme    ?? 'light');
    _setVal('setting-show-animations',  s.interface?.show_animations  ?? true);
    _setVal('setting-items-per-page',   String(s.interface?.items_per_page ?? 20));
    _setVal('setting-date-format',      s.interface?.date_format      ?? 'dd/mm/yyyy');
}

function _setVal(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') {
        el.checked = Boolean(value);
    } else {
        el.value = value;
    }
}

const _settingsMap = {
    system: {
        system_name:        { id: 'setting-system-name',        type: 'text' },
        maintenance_mode:   { id: 'setting-maintenance-mode',   type: 'checkbox' },
        default_language:   { id: 'setting-default-language',   type: 'text' },
        allow_registration: { id: 'setting-allow-registration', type: 'checkbox' },
        max_schools:        { id: 'setting-max-schools',        type: 'number' }
    },
    user_management: {
        min_password_length:    { id: 'setting-min-password-length',   type: 'number' },
        require_uppercase:      { id: 'setting-require-uppercase',     type: 'checkbox' },
        require_numbers:        { id: 'setting-require-numbers',       type: 'checkbox' },
        require_special_chars:  { id: 'setting-require-special-chars', type: 'checkbox' },
        session_timeout_hours:  { id: 'setting-session-timeout',       type: 'number' },
        max_login_attempts:     { id: 'setting-max-login-attempts',    type: 'number' },
        lockout_duration_minutes:{ id: 'setting-lockout-duration',     type: 'number' }
    },
    data_management: {
        backup_enabled:        { id: 'setting-backup-enabled',   type: 'checkbox' },
        backup_frequency_days: { id: 'setting-backup-frequency', type: 'number' },
        data_retention_days:   { id: 'setting-data-retention',  type: 'number' },
        export_enabled:        { id: 'setting-export-enabled',  type: 'checkbox' }
    },
    security: {
        two_factor_required: { id: 'setting-2fa-required',    type: 'checkbox' },
        force_https:         { id: 'setting-force-https',     type: 'checkbox' },
        allowed_ips:         { id: 'setting-allowed-ips',     type: 'text' },
        audit_logs_enabled:  { id: 'setting-audit-logs',      type: 'checkbox' },
        audit_retention_days:{ id: 'setting-audit-retention', type: 'number' }
    },
    interface: {
        default_theme:   { id: 'setting-default-theme',   type: 'text' },
        show_animations: { id: 'setting-show-animations', type: 'checkbox' },
        items_per_page:  { id: 'setting-items-per-page',  type: 'number' },
        date_format:     { id: 'setting-date-format',     type: 'text' }
    }
};

function _collectSection(section) {
    const sectionMap = _settingsMap[section];
    if (!sectionMap) return {};
    const values = {};
    for (const [key, config] of Object.entries(sectionMap)) {
        const el = document.getElementById(config.id);
        if (!el) continue;
        if (config.type === 'checkbox') {
            values[key] = el.checked;
        } else if (config.type === 'number') {
            values[key] = parseInt(el.value, 10) || 0;
        } else {
            values[key] = el.value;
        }
    }
    return values;
}

async function saveSettings(section) {
    const values = _collectSection(section);
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ section, values })
        });
        const result = await response.json();
        if (result.success) {
            // Only update the saved section, preserve other sections' in-memory values
            if (result.settings) {
                if (result.settings[section]) {
                    _currentSettings[section] = result.settings[section];
                } else {
                    // Server returned full settings object – merge only the saved section
                    _currentSettings[section] = values;
                }
            } else {
                _currentSettings[section] = values;
            }
            _showSettingsNotif(result.message || 'تم حفظ الإعدادات بنجاح', 'success');
        } else {
            _showSettingsNotif(result.error_ar || result.error || 'حدث خطأ في حفظ الإعدادات', 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        _showSettingsNotif('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

function switchSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
    const pane = document.getElementById('settings-tab-' + tabName);
    if (pane) pane.classList.add('active');
    const btn = document.querySelector(`.settings-nav-btn[data-stab="${tabName}"]`);
    if (btn) btn.classList.add('active');
}

async function triggerBackup() {
    _showSettingsNotif('جاري إنشاء النسخة الاحتياطية...', 'info');
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/backup', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            _showSettingsNotif(result.message || 'تم إنشاء النسخة الاحتياطية بنجاح', 'success');
        } else {
            _showSettingsNotif(result.error_ar || 'تعذر إنشاء النسخة الاحتياطية', 'warning');
        }
    } catch (error) {
        _showSettingsNotif('تعذر الاتصال بالخادم لإنشاء النسخة الاحتياطية', 'warning');
    }
}

function showAuditLogsModal() {
    _showSettingsNotif('عرض سجلات التدقيق قيد التطوير', 'info');
}

function _showSettingsNotif(message, type) {
    if (typeof showNotification === 'function') {
        showNotification(message, type);
    } else {
        const colors = { success: '#22c55e', error: '#ef4444', warning: '#f97316', info: '#3b82f6' };
        const notif = document.createElement('div');
        notif.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:.875rem 1.5rem;border-radius:.75rem;background:${colors[type]||colors.info};color:white;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);font-family:Cairo,sans-serif`;
        notif.textContent = message;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 4000);
    }
}

/**
 * Restore defaults for a single settings section only,
 * without touching values in other sections.
 */
function restoreSectionDefaults(section) {
    const defaults = _getDefaultSettings();
    if (!defaults[section]) {
        _showSettingsNotif('لا توجد إعدادات افتراضية لهذا القسم', 'warning');
        return;
    }
    // Build a minimal settings object containing only the target section
    const partial = {};
    partial[section] = defaults[section];
    _populateSectionForm(section, partial);
    _showSettingsNotif('تم استعادة الإعدادات الافتراضية لهذا القسم', 'info');
}

/**
 * Populate only the form fields that belong to a single section.
 */
function _populateSectionForm(section, settingsObj) {
    const sectionMap = _settingsMap[section];
    if (!sectionMap) return;
    const sectionData = settingsObj[section] || {};
    for (const [key, config] of Object.entries(sectionMap)) {
        const val = sectionData[key];
        if (val !== undefined) {
            _setVal(config.id, val);
        }
    }
}

window.loadSystemSettings     = loadSystemSettings;
window.saveSettings           = saveSettings;
window.restoreSectionDefaults = restoreSectionDefaults;
window.switchSettingsTab      = switchSettingsTab;
window.triggerBackup          = triggerBackup;
window.showAuditLogsModal     = showAuditLogsModal;

// ========== RESPONSIVE HANDLING ==========
// Adjust sidebar on resize
window.addEventListener('resize', function() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    
    if (window.innerWidth > 768) {
        if (sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
        if (overlay && overlay.classList.contains('open')) {
            overlay.classList.remove('open');
        }
    }
});
