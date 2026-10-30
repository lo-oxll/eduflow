/**
 * Enhanced Teacher-Subject Assignment Functions for School Dashboard
 */

// Global variables for subject assignment management
let currentTeacherId = null;
// Import the filtering system
// Note: This assumes the filtering system is loaded before this file

let currentTeacherSubjects = [];
let availableSubjects = [];
let subjectAssignmentCache = new Map();

/**
 * Load and display subject assignment interface for a teacher
 */
async function loadTeacherSubjectAssignment(teacherId) {
    try {
        // Validate teacherId
        if (!teacherId) {
            console.error('No teacher ID provided');
            showNotification('معرف المعلم غير صالح', 'error');
            return;
        }

        currentTeacherId = teacherId;
        
        // Show loading state
        showSubjectAssignmentLoading();
        
        console.log('Loading subject assignment for teacher:', teacherId);

        // Check if teachers array is available
        if (typeof teachers === 'undefined' || !Array.isArray(teachers)) {
            console.error('Teachers array not available');
            showNotification('بيانات المعلمين غير متوفرة. يرجى تحديث الصفحة', 'error');
            hideSubjectAssignmentInterface();
            return;
        }

        // Find teacher in the array
        const teacher = teachers.find(t => t.id === teacherId);
        if (!teacher) {
            console.error('Teacher not found in teachers array:', teacherId);
            showNotification('المعلم غير موجود في قائمة المعلمين', 'error');
            hideSubjectAssignmentInterface();
            return;
        }
        
        // Fetch teacher's current subjects
        const subjectsResponse = await fetch(`/api/teacher/${teacherId}/subjects/assignments`, {
            headers: getAuthHeaders()
        });
        
        console.log('Teacher subjects response status:', subjectsResponse.status);
        
        if (!subjectsResponse.ok) {
            const errorText = await subjectsResponse.text();
            console.error('Failed to fetch teacher subjects:', errorText);
            throw new Error('Failed to fetch teacher subjects');
        }
        
        const subjectsData = await subjectsResponse.json();
        console.log('Teacher subjects data:', subjectsData);
        currentTeacherSubjects = subjectsData.subjects || [];
        
        // Fetch available subjects for this school
        const schoolId = (typeof currentSchool !== 'undefined' && currentSchool?.id) ? currentSchool.id : teacher.school_id;
        console.log('Using school ID:', schoolId);
        
        // Try the available subjects endpoint first
        let availableResponse = await fetch(`/api/school/${schoolId}/subjects/available`, {
            headers: getAuthHeaders()
        });
        
        console.log('Available subjects response status:', availableResponse.status);
        
        if (!availableResponse.ok) {
            // Try fallback endpoint
            console.log('Trying fallback endpoint...');
            availableResponse = await fetch(`/api/school/${schoolId}/subjects`, {
                headers: getAuthHeaders()
            });
        }
        
        if (availableResponse.ok) {
            const availableData = await availableResponse.json();
            console.log('Available subjects response data:', availableData);
            availableSubjects = availableData.subjects || [];
        } else {
            // If both endpoints fail, use empty array
            console.warn('Could not fetch available subjects, using empty array');
            availableSubjects = [];
        }
        
        console.log('Available subjects count:', availableSubjects.length);
        
        // Render the assignment interface first
        renderSubjectAssignmentInterface();
        
        // Apply authorization filtering (wrapped in try-catch to prevent blocking)
        try {
            if (typeof initializeTeacherSubjectFiltering === 'function') {
                await initializeTeacherSubjectFiltering(teacherId);
            }
        } catch (filterError) {
            console.warn('Subject filtering initialization failed (non-critical):', filterError);
            // Don't block the interface if filtering fails
        }
        
        // Update cache
        subjectAssignmentCache.set(teacherId, {
            currentSubjects: currentTeacherSubjects,
            availableSubjects: availableSubjects,
            timestamp: Date.now()
        });
        
    } catch (error) {
        console.error('Error loading subject assignment:', error);
        showNotification('حدث خطأ في تحميل واجهة تعيين المواد', 'error');
        hideSubjectAssignmentInterface();
    }
}

/**
 * Show loading state for subject assignment
 */
function showSubjectAssignmentLoading() {
    const container = document.getElementById('subjectAssignmentContainer');
    if (container) {
        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>جارٍ تحميل المواد...</p>
            </div>
        `;
        container.style.display = 'block';
    }
}

/**
 * Render the complete subject assignment interface
 */
function renderSubjectAssignmentInterface() {
    const container = document.getElementById('subjectAssignmentContainer');
    if (!container) {
        console.error('Subject assignment container not found');
        return;
    }
    
    // Ensure container is properly styled as a modal
    container.style.display = 'block';
    container.classList.add('modal');
    
    // Check if teachers array is available
    if (typeof teachers === 'undefined' || !Array.isArray(teachers)) {
        console.error('Teachers array not available when rendering interface');
        container.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <span class="close-modal" onclick="closeSubjectAssignmentSilently()">&times;</span>
                <div class="error-state" style="padding: 2rem; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #dc3545; margin-bottom: 1rem;"></i>
                    <h3>خطأ في تحميل البيانات</h3>
                    <p>بيانات المعلمين غير متوفرة. يرجى تحديث الصفحة والمحاولة مرة أخرى.</p>
                    <button type="button" class="btn-primary-school btn-primary" onclick="closeSubjectAssignmentSilently()" style="margin-top: 1rem;">
                        <i class="fas fa-times"></i> إغلاق
                    </button>
                </div>
            </div>
        `;
        return;
    }
    
    const teacher = teachers.find(t => t.id === currentTeacherId);
    if (!teacher) {
        console.error('Teacher not found when rendering interface');
        container.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <span class="close-modal" onclick="closeSubjectAssignmentSilently()">&times;</span>
                <div class="error-state" style="padding: 2rem; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #dc3545; margin-bottom: 1rem;"></i>
                    <h3>المعلم غير موجود</h3>
                    <p>لم يتم العثور على المعلم المحدد. يرجى تحديث الصفحة والمحاولة مرة أخرى.</p>
                    <button type="button" class="btn-primary-school btn-primary" onclick="closeSubjectAssignmentSilently()" style="margin-top: 1rem;">
                        <i class="fas fa-times"></i> إغلاق
                    </button>
                </div>
            </div>
        `;
        return;
    }
    
    const html = `
        <div class="modal-content" style="width: 100vw; height: 100vh; max-width: none; max-height: none; overflow-y: auto; padding: 2rem;">
            <div class="subject-assignment-header" style="margin-bottom: 2rem; padding: 1.5rem; background: linear-gradient(135deg, var(--brand-primary-50) 0%, var(--brand-primary-100) 100%); border-radius: 12px; border: 2px solid var(--brand-primary-200);">
                <h3 style="margin: 0 0 1rem 0; font-size: 2rem; color: var(--brand-primary-700); display: flex; align-items: center; gap: 0.5rem;">
                    <i class="fas fa-book" style="font-size: 1.5rem;"></i> تعيين المواد للمعلم: ${escapeHtml(teacher.full_name)}
                </h3>
                <div class="teacher-info" style="display: flex; gap: 2rem; align-items: center;">
                    <span class="teacher-code" style="background: var(--neutral-100); padding: 0.5rem 1rem; border-radius: 8px; font-family: monospace; font-weight: 600; color: var(--text-secondary); font-size: 1.1rem;">
                        <i class="fas fa-key" style="margin-left: 0.5rem;"></i> الرمز: ${escapeHtml(teacher.teacher_code)}
                    </span>
                    <span class="grade-level" style="background: var(--warning-100); color: var(--warning-700); padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; font-size: 1.1rem;">
                        <i class="fas fa-layer-group" style="margin-left: 0.5rem;"></i> الصف: ${teacher.grade_level || 'غير محدد'}
                    </span>
                </div>
            </div>
            
            <div class="assignment-content" style="display: grid; grid-template-columns: 1fr 2fr; gap: 2rem; height: calc(100vh - 200px);">
                <div class="current-subjects-section" style="background: white; border-radius: 12px; border: 1px solid var(--neutral-200); padding: 1.5rem; overflow-y: auto;">
                    <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem;">
                        <i class="fas fa-check-circle" style="color: var(--success-500);"></i> المواد المعينة حالياً (${currentTeacherSubjects.length})
                    </h4>
                    ${renderCurrentSubjects()}
                </div>
                
                <div class="subject-assignment-controls" style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div class="search-filter-section" style="background: white; border-radius: 12px; border: 1px solid var(--neutral-200); padding: 1.5rem;">
                        <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem;">
                            <i class="fas fa-search" style="color: var(--brand-primary-500);"></i> البحث والتصفية
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="form-group">
                                <label style="font-size: 0.9rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.25rem;">
                                    <i class="fas fa-search" style="color: var(--brand-primary-500);"></i> البحث في المواد المتاحة
                                </label>
                                <input type="text" id="subjectSearch" class="form-input" 
                                       placeholder="ابحث بالاسم أو المستوى..." 
                                       oninput="filterAvailableSubjects()"
                                       style="width: 100%;">
                            </div>
                            <div class="form-group">
                                <label style="font-size: 0.9rem; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.25rem;">
                                    <i class="fas fa-filter" style="color: var(--brand-primary-500);"></i> تصفية حسب الصف
                                </label>
                                <select id="gradeLevelFilter" class="form-input" onchange="filterAvailableSubjects()" style="width: 100%;">
                                    <option value="">جميع المستويات</option>
                                    ${getGradeLevelOptions()}
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="available-subjects-section" style="background: white; border-radius: 12px; border: 1px solid var(--neutral-200); padding: 1.5rem; flex: 1; overflow-y: auto;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <h4 style="margin: 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; font-size: 1.2rem;">
                                <i class="fas fa-plus-circle" style="color: var(--success-500);"></i> المواد المتاحة للتعيين (${availableSubjects.length})
                            </h4>
                            <div class="subject-selection-actions" style="display: flex; gap: 0.5rem;">
                                <button type="button" class="btn-secondary-school" onclick="selectAllSubjects()" style="padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem;">
                                    <i class="fas fa-check-square"></i> تحديد الكل
                                </button>
                                <button type="button" class="btn-secondary-school" onclick="clearAllSubjects()" style="padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem;">
                                    <i class="fas fa-square"></i> إلغاء التحديد
                                </button>
                            </div>
                        </div>
                        ${renderAvailableSubjects()}
                    </div>
                </div>
            </div>
            
            <div class="assignment-summary" style="position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 2px solid var(--neutral-200); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 -4px 20px rgba(0,0,0,0.1);">
                <div class="selected-count" style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary);">
                    <i class="fas fa-check-circle" style="color: var(--success-500); margin-left: 0.5rem;"></i>
                    <span id="selectedCount">0</span> مادة محددة للتعيين
                </div>
                <div class="assignment-actions" style="display: flex; gap: 1rem;">
                    <button type="button" class="btn-secondary-school" onclick="cancelSubjectAssignment()" style="padding: 0.75rem 1.5rem; border-radius: 10px; font-size: 1rem;">
                        <i class="fas fa-times"></i> إلغاء
                    </button>
                    <button type="button" class="btn-primary-school btn-primary" onclick="saveSubjectAssignments()" id="saveAssignmentsBtn" style="padding: 0.75rem 1.5rem; border-radius: 10px; font-size: 1rem; background: linear-gradient(135deg, var(--success-500) 0%, var(--success-600) 100%); border: none;">
                        <i class="fas fa-save"></i> حفظ التعيينات
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Update selected count
    updateSelectedCount();
}

/**
 * Render current assigned subjects
 */
function renderCurrentSubjects() {
    if (currentTeacherSubjects.length === 0) {
        return `
            <div class="no-subjects-assigned">
                <i class="fas fa-info-circle"></i>
                <p>لا توجد مواد معينة لهذا المعلم</p>
            </div>
        `;
    }
    
    return `
        <div class="current-subjects-grid">
            ${currentTeacherSubjects.map(subject => `
                <div class="subject-card assigned" data-subject-id="${subject.id}">
                    <div class="subject-info">
                        <h5>${escapeHtml(subject.name)}</h5>
                        <div class="subject-details">
                            <span class="grade-level">${escapeHtml(subject.grade_level)}</span>
                            <span class="assigned-date">معين منذ: ${formatDate(subject.assigned_at)}</span>
                        </div>
                    </div>
                    <div class="subject-actions">
                        <button type="button" class="btn-small btn-danger" 
                                onclick="removeSubjectAssignment(${subject.id})" 
                                title="إزالة التعيين">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Render available subjects for selection
 */
function renderAvailableSubjects() {
    console.log('Rendering available subjects. Available subjects:', availableSubjects); // Debug log
    console.log('Current teacher subjects:', currentTeacherSubjects); // Debug log
    
    const assignedSubjectIds = new Set(currentTeacherSubjects.map(s => s.id));
    
    const availableForAssignment = availableSubjects.filter(subject => 
        !assignedSubjectIds.has(subject.id)
    );
    
    console.log('Available for assignment:', availableForAssignment); // Debug log
    
    if (availableForAssignment.length === 0) {
        // Check if we have any subjects at all
        if (availableSubjects.length === 0) {
            return `
                <div class="no-available-subjects">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>لا توجد مواد متوفرة في النظام</p>
                    <small>يرجى إضافة مواد من خلال إدارة المواد أولاً</small>
                </div>
            `;
        } else {
            return `
                <div class="no-available-subjects">
                    <i class="fas fa-check-circle"></i>
                    <p>جميع المواد مخصصة بالفعل</p>
                </div>
            `;
        }
    }
    
    return `
        <div class="available-subjects-list" id="availableSubjectsList">
            ${availableForAssignment.map(subject => `
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
                            </div>
                        </div>
                    </label>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Get grade level options for filtering
 */
function getGradeLevelOptions() {
    const gradeLevels = [...new Set(availableSubjects.map(s => s.grade_level))].sort();
    return gradeLevels.map(grade => `<option value="${grade}">${grade}</option>`).join('');
}

/**
 * Filter available subjects based on search and grade level
 */
function filterAvailableSubjects() {
    const searchTerm = document.getElementById('subjectSearch')?.value.toLowerCase() || '';
    const gradeFilter = document.getElementById('gradeLevelFilter')?.value || '';
    
    const list = document.getElementById('availableSubjectsList');
    if (!list) return;
    
    const items = list.querySelectorAll('.subject-checkbox-item');
    
    items.forEach(item => {
        const subjectName = item.querySelector('.subject-info strong')?.textContent.toLowerCase() || '';
        const gradeLevel = item.dataset.gradeLevel || '';
        const matchesSearch = !searchTerm || subjectName.includes(searchTerm);
        const matchesGrade = !gradeFilter || gradeLevel === gradeFilter;
        
        item.style.display = (matchesSearch && matchesGrade) ? 'block' : 'none';
    });
}

/**
 * Select all available subjects
 */
function selectAllSubjects() {
    const checkboxes = document.querySelectorAll('input[name="subject_ids"]:not(:checked)');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    updateSelectedCount();
}

/**
 * Clear all subject selections
 */
function clearAllSubjects() {
    const checkboxes = document.querySelectorAll('input[name="subject_ids"]:checked');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateSelectedCount();
}

/**
 * Update the selected subjects count display
 */
function updateSelectedCount() {
    const selectedCheckboxes = document.querySelectorAll('input[name="subject_ids"]:checked');
    const count = selectedCheckboxes.length;
    
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
        countElement.textContent = count;
    }
    
    // Update save button state
    const saveButton = document.getElementById('saveAssignmentsBtn');
    if (saveButton) {
        saveButton.disabled = count === 0;
        saveButton.classList.toggle('btn-disabled', count === 0);
    }
}

/**
 * Save subject assignments to backend
 */
async function saveSubjectAssignments() {
    if (!currentTeacherId) return;
    
    const selectedCheckboxes = document.querySelectorAll('input[name="subject_ids"]:checked');
    const subjectIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));
    
    // Check if there's a free-text subjects input field
    const freeTextSubjectInput = document.getElementById('teacherSubjects');
    let freeTextSubjects = '';
    if (freeTextSubjectInput) {
        freeTextSubjects = freeTextSubjectInput.value.trim();
    }
    
    // If no predefined subjects are selected and no free-text subjects, show error
    if (subjectIds.length === 0 && !freeTextSubjects) {
        showNotification('يرجى اختيار مادة واحدة على الأقل أو إدخال مواد نصية', 'error');
        return;
    }
    
    try {
        // Show loading state
        const saveButton = document.getElementById('saveAssignmentsBtn');
        const originalText = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        saveButton.disabled = true;
        
        const response = await fetch(`/api/teacher/${currentTeacherId}/subjects/assignments`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 
                subject_ids: subjectIds,
                free_text_subjects: freeTextSubjects
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showNotification(`تم تعيين ${result.assigned_count} مادة للمعلم بنجاح`, 'success');
            
            // Refresh teacher data and close interface
            await fetchTeachers();
            hideSubjectAssignmentInterface();
            
            // Update the main teacher list display
            updateTeacherSubjectsDisplay(currentTeacherId, result.teacher.subjects);
        } else {
            const errorMessage = result.error_ar || result.error || 'حدث خطأ في حفظ التعيينات';
            showNotification(errorMessage, 'error');
        }
        
    } catch (error) {
        console.error('Error saving subject assignments:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        // Restore button state
        const saveButton = document.getElementById('saveAssignmentsBtn');
        if (saveButton) {
            saveButton.innerHTML = '<i class="fas fa-save"></i> حفظ التعيينات';
            saveButton.disabled = false;
        }
    }
}

/**
 * Remove a specific subject assignment
 */
async function removeSubjectAssignment(subjectId) {
    if (!currentTeacherId || !subjectId) return;
    
    const subject = currentTeacherSubjects.find(s => s.id === subjectId);
    if (!subject) return;
    
    if (!confirm(`هل أنت متأكد من إزالة مادة "${subject.name}" من هذا المعلم؟`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/teacher/${currentTeacherId}/subjects/${subjectId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showNotification('تم إزالة المادة بنجاح', 'success');
            
            // Refresh teacher data and update interface
            await fetchTeachers();
            await loadTeacherSubjectAssignment(currentTeacherId);
            
            // Update the main teacher list display
            updateTeacherSubjectsDisplay(currentTeacherId, result.teacher.subjects);
        } else {
            const errorMessage = result.error_ar || result.error || 'حدث خطأ في إزالة المادة';
            showNotification(errorMessage, 'error');
        }
        
    } catch (error) {
        console.error('Error removing subject assignment:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

/**
 * Cancel subject assignment and close interface
 */
function cancelSubjectAssignment() {
    if (confirm('هل أنت متأكد من إلغاء التغييرات؟')) {
        hideSubjectAssignmentInterface();
        // Reopen the teacher assignment modal
        const teacherAssignmentModal = document.getElementById('teacherAssignmentModal');
        if (teacherAssignmentModal) {
            teacherAssignmentModal.style.display = 'block';
            // Refresh the teachers list to show updated data
            if (typeof loadTeachersForAssignment === 'function') {
                loadTeachersForAssignment();
            }
        }
    }
}

/**
 * Hide the subject assignment interface
 */
function hideSubjectAssignmentInterface() {
    const container = document.getElementById('subjectAssignmentContainer');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
    currentTeacherId = null;
    currentTeacherSubjects = [];
    availableSubjects = [];
}

/**
 * Close subject assignment without confirmation (for use with X button)
 */
function closeSubjectAssignmentSilently() {
    hideSubjectAssignmentInterface();
    // Reopen the teacher assignment modal
    const teacherAssignmentModal = document.getElementById('teacherAssignmentModal');
    if (teacherAssignmentModal) {
        teacherAssignmentModal.style.display = 'block';
        // Refresh the teachers list to show updated data
        if (typeof loadTeachersForAssignment === 'function') {
            loadTeachersForAssignment();
        }
    }
}

/**
 * Update teacher subjects display in the main teacher list
 */
function updateTeacherSubjectsDisplay(teacherId, subjects) {
    const teacherRow = document.querySelector(`tr[data-id="${teacherId}"]`);
    if (!teacherRow) return;
    
    // Extract subject names from predefined subjects
    const predefinedSubjectNames = subjects
        .filter(subject => subject.id !== null)  // Only predefined subjects have IDs
        .map(s => s.name);
    
    // For free-text subjects, we need to get them separately from the teacher object
    // The subjects array might also contain free-text subjects with id: null
    const freeTextSubjects = subjects
        .filter(subject => subject.id === null && subject.grade_level === 'free_text')
        .map(s => s.name);
    
    // Combine both types of subjects
    const allSubjectNames = [...predefinedSubjectNames, ...freeTextSubjects];
    const subjectNames = allSubjectNames.join(', ') || 'غير محدد';
    
    const subjectsCell = teacherRow.cells[2]; // Assuming subjects column is index 2
    if (subjectsCell) {
        subjectsCell.innerHTML = subjectNames;
    }
    
    // Update the teacher object in memory
    const teacherIndex = teachers.findIndex(t => t.id === teacherId);
    if (teacherIndex !== -1) {
        teachers[teacherIndex].subjects = subjects;
        teachers[teacherIndex].subject_names = subjectNames;
        teachers[teacherIndex].subject_ids = subjects.filter(s => s.id !== null).map(s => s.id);
    }
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'غير محدد';
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-EG');
}

/**
 * Initialize subject assignment functionality
 */
function initializeSubjectAssignment() {
    // Add event listeners
    console.log('Subject assignment functionality initialized');
}

// Make functions globally available
window.loadTeacherSubjectAssignment = loadTeacherSubjectAssignment;
window.hideSubjectAssignmentInterface = hideSubjectAssignmentInterface;
window.initializeSubjectAssignment = initializeSubjectAssignment;
window.closeSubjectAssignmentSilently = closeSubjectAssignmentSilently;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeSubjectAssignment);