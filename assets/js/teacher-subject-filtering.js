/**
 * Teacher Subject Filtering System
 * Ensures each teacher only sees subjects they are authorized to teach
 */

// Cache for teacher-authorize subjects mapping
let teacherAuthorizedSubjects = new Map();
let subjectAuthorizationCache = new Map();

/**
 * Load authorized subjects for a specific teacher
 */
async function loadTeacherAuthorizedSubjects(teacherId) {
    try {
        // Check cache first
        const cacheKey = `${teacherId}_${Date.now() - (5 * 60 * 1000)}`; // 5 minutes cache
        if (subjectAuthorizationCache.has(teacherId) && 
            subjectAuthorizationCache.get(teacherId).timestamp > Date.now() - (5 * 60 * 1000)) {
            return subjectAuthorizationCache.get(teacherId).subjects;
        }

        const response = await fetch(`/api/teacher/${teacherId}/authorized-subjects`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error('Failed to fetch authorized subjects');
        }

        const data = await response.json();
        const authorizedSubjects = data.subjects || [];

        // Update cache
        subjectAuthorizationCache.set(teacherId, {
            subjects: authorizedSubjects,
            timestamp: Date.now()
        });

        console.log(`Loaded ${authorizedSubjects.length} authorized subjects for teacher ${teacherId}`);
        return authorizedSubjects;

    } catch (error) {
        console.error('Error loading authorized subjects:', error);
        return [];
    }
}

/**
 * Filter subjects based on teacher authorization
 */
function filterSubjectsByAuthorization(subjects, authorizedSubjectIds) {
    if (!authorizedSubjectIds || authorizedSubjectIds.length === 0) {
        return subjects; // If no authorization data, show all subjects
    }
    
    return subjects.filter(subject => 
        authorizedSubjectIds.includes(subject.id)
    );
}

/**
 * Get authorized subject IDs for a teacher
 */
async function getTeacherAuthorizedSubjectIds(teacherId) {
    const authorizedSubjects = await loadTeacherAuthorizedSubjects(teacherId);
    return authorizedSubjects.map(subject => subject.id);
}

/**
 * Apply subject filtering to teacher assignment interface
 */
async function applySubjectFiltering(teacherId, allSubjects) {
    try {
        const authorizedSubjectIds = await getTeacherAuthorizedSubjectIds(teacherId);
        
        // Filter available subjects
        const filteredSubjects = filterSubjectsByAuthorization(allSubjects, authorizedSubjectIds);
        
        console.log(`Filtered subjects for teacher ${teacherId}:`, {
            total: allSubjects.length,
            authorized: authorizedSubjectIds.length,
            filtered: filteredSubjects.length
        });
        
        return {
            authorizedSubjectIds,
            filteredSubjects,
            isFullyRestricted: authorizedSubjectIds.length > 0 && filteredSubjects.length < allSubjects.length
        };
        
    } catch (error) {
        console.error('Error applying subject filtering:', error);
        return {
            authorizedSubjectIds: [],
            filteredSubjects: allSubjects,
            isFullyRestricted: false
        };
    }
}

/**
 * Update subject assignment interface with authorization filtering
 */
async function updateSubjectAssignmentWithAuthorization(teacherId) {
    try {
        // Get current teacher data
        const teacher = teachers.find(t => t.id === teacherId);
        if (!teacher) {
            console.warn(`Teacher ${teacherId} not found`);
            return;
        }

        // Load teacher's authorized subjects
        const authResult = await applySubjectFiltering(teacherId, availableSubjects);
        
        // Update the available subjects list
        const restrictedAvailableSubjects = authResult.filteredSubjects;
        
        // Re-render the available subjects section
        const availableSubjectsSection = document.querySelector('.available-subjects-section');
        if (availableSubjectsSection) {
            const assignedSubjectIds = new Set(currentTeacherSubjects.map(s => s.id));
            
            const availableForAssignment = restrictedAvailableSubjects.filter(subject => 
                !assignedSubjectIds.has(subject.id)
            );
            
            // Update the count
            const countElement = availableSubjectsSection.querySelector('h4');
            if (countElement) {
                countElement.innerHTML = `<i class="fas fa-plus-circle"></i> المواد المتاحة للتعيين (${availableForAssignment.length})`;
                
                // Add restriction indicator if applicable
                if (authResult.isFullyRestricted) {
                    countElement.innerHTML += ` <span class="restriction-indicator" title="تم تقييد المواد حسب الصلاحية">×</span>`;
                }
            }
            
            // Update the subjects list
            const subjectsList = availableSubjectsSection.querySelector('.available-subjects-list');
            if (subjectsList) {
                if (availableForAssignment.length === 0) {
                    subjectsList.innerHTML = `
                        <div class="no-available-subjects">
                            <i class="fas fa-info-circle"></i>
                            <p>${authResult.isFullyRestricted ? 
                                'لا توجد مواد مصرح بها لهذا المعلم' : 
                                'جميع المواد مخصصة بالفعل'}</p>
                        </div>
                    `;
                } else {
                    subjectsList.innerHTML = availableForAssignment.map(subject => `
                        <div class="subject-checkbox-item" data-subject-id="${subject.id}" data-grade-level="${escapeHtml(subject.grade_level)}">
                            <label class="checkbox-container">
                                <input type="checkbox" name="subject_ids" value="${subject.id}" 
                                       onchange="updateSelectedCount()">
                                <span class="checkmark"></span>
                                <div class="subject-info">
                                    <strong>${escapeHtml(subject.name)}</strong>
                                    <div class="subject-meta">
                                        <span class="grade-level">${escapeHtml(subject.grade_level)}</span>
                                        <span class="subject-id">#${subject.id}</span>
                                        ${authResult.authorizedSubjectIds.includes(subject.id) ? 
                                            '<span class="authorized-badge" title="مصرح به">✓</span>' : ''}
                                    </div>
                                </div>
                            </label>
                        </div>
                    `).join('');
                }
            }
        }
        
        // Show authorization status
        showAuthorizationStatus(authResult, teacher);
        
    } catch (error) {
        console.error('Error updating subject assignment with authorization:', error);
        showNotification('حدث خطأ في تطبيق تصفية المواد', 'error');
    }
}

/**
 * Display authorization status information
 */
function showAuthorizationStatus(authResult, teacher) {
    const statusContainer = document.querySelector('.authorization-status');
    if (!statusContainer) {
        // Create status container if it doesn't exist
        const header = document.querySelector('.subject-assignment-header');
        if (header) {
            const statusDiv = document.createElement('div');
            statusDiv.className = 'authorization-status';
            header.appendChild(statusDiv);
        }
    }
    
    const statusElement = document.querySelector('.authorization-status');
    if (statusElement) {
        if (authResult.isFullyRestricted) {
            statusElement.innerHTML = `
                <div class="restriction-notice">
                    <i class="fas fa-shield-alt"></i>
                    <span>هذا المعلم مخول فقط بـ ${authResult.authorizedSubjectIds.length} مادة دراسية</span>
                </div>
            `;
            statusElement.style.display = 'block';
        } else {
            statusElement.style.display = 'none';
        }
    }
}

/**
 * Validate subject assignment against authorization
 */
async function validateSubjectAssignment(teacherId, selectedSubjectIds) {
    try {
        const authorizedSubjectIds = await getTeacherAuthorizedSubjectIds(teacherId);
        
        if (authorizedSubjectIds.length === 0) {
            return { valid: true, message: 'لا توجد قيود على المواد' };
        }
        
        const unauthorizedSubjects = selectedSubjectIds.filter(id => 
            !authorizedSubjectIds.includes(id)
        );
        
        if (unauthorizedSubjects.length > 0) {
            const unauthorizedSubjectNames = unauthorizedSubjects
                .map(id => {
                    const subject = availableSubjects.find(s => s.id === id);
                    return subject ? subject.name : `المادة #${id}`;
                })
                .join(', ');
                
            return {
                valid: false,
                message: `المعلم غير مصرح له ب преподавание المواد التالية: ${unauthorizedSubjectNames}`
            };
        }
        
        return { valid: true, message: 'جميع المواد مصرح بها' };
        
    } catch (error) {
        console.error('Error validating subject assignment:', error);
        return { valid: true, message: 'لا يمكن التحقق من الصلاحية حالياً' };
    }
}

/**
 * Initialize subject filtering for teacher assignment
 */
async function initializeTeacherSubjectFiltering(teacherId) {
    try {
        console.log(`Initializing subject filtering for teacher ${teacherId}`);
        
        // Load and apply authorization filtering
        await updateSubjectAssignmentWithAuthorization(teacherId);
        
        // Set up real-time validation
        setupAssignmentValidation(teacherId);
        
    } catch (error) {
        console.error('Error initializing teacher subject filtering:', error);
    }
}

/**
 * Set up real-time validation for subject assignments
 */
function setupAssignmentValidation(teacherId) {
    // Monitor checkbox changes
    const observer = new MutationObserver(() => {
        const checkboxes = document.querySelectorAll('input[name="subject_ids"]');
        checkboxes.forEach(checkbox => {
            checkbox.removeEventListener('change', handleSubjectSelectionChange);
            checkbox.addEventListener('change', handleSubjectSelectionChange);
        });
    });
    
    // Watch for changes in the subject list
    const subjectsContainer = document.querySelector('.available-subjects-list');
    if (subjectsContainer) {
        observer.observe(subjectsContainer, { childList: true, subtree: true });
    }
    
    // Initial setup
    const checkboxes = document.querySelectorAll('input[name="subject_ids"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', handleSubjectSelectionChange);
    });
}

/**
 * Handle subject selection changes with authorization validation
 */
async function handleSubjectSelectionChange(event) {
    const checkbox = event.target;
    const teacherId = currentTeacherId;
    
    if (!teacherId) return;
    
    // Get all selected subjects
    const selectedCheckboxes = document.querySelectorAll('input[name="subject_ids"]:checked');
    const selectedSubjectIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));
    
    // Validate selection
    const validationResult = await validateSubjectAssignment(teacherId, selectedSubjectIds);
    
    if (!validationResult.valid) {
        // Uncheck the unauthorized subject
        checkbox.checked = false;
        showNotification(validationResult.message, 'error');
        
        // Update selected count
        updateSelectedCount();
        return;
    }
    
    // Update selected count
    updateSelectedCount();
}

/**
 * Refresh authorization data
 */
async function refreshTeacherAuthorization(teacherId) {
    // Clear cache
    subjectAuthorizationCache.delete(teacherId);
    
    // Reload authorization data
    await initializeTeacherSubjectFiltering(teacherId);
    
    showNotification('تم تحديث بيانات الصلاحية', 'success');
}

// Make functions globally available
window.loadTeacherAuthorizedSubjects = loadTeacherAuthorizedSubjects;
window.applySubjectFiltering = applySubjectFiltering;
window.updateSubjectAssignmentWithAuthorization = updateSubjectAssignmentWithAuthorization;
window.validateSubjectAssignment = validateSubjectAssignment;
window.initializeTeacherSubjectFiltering = initializeTeacherSubjectFiltering;
window.refreshTeacherAuthorization = refreshTeacherAuthorization;