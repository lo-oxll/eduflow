/**
 * Enhanced Teacher Portal Functions for Subject Display
 */

// Global variables for teacher portal
// Note: teacherStudents is now shared via window.teacherStudents from teacher.js
let currentTeacherData = null;
// teacherSubjects is also managed by teacher.js, but we sync it here if needed

/**
 * Initialize teacher portal with enhanced subject display
 */
async function initializeTeacherPortal() {
    try {
        // Get teacher data from localStorage
        const teacherData = localStorage.getItem('teacher');
        if (!teacherData) {
            console.error('No teacher data found');
            return;
        }
        
        currentTeacherData = JSON.parse(teacherData);
        console.log('Teacher data loaded:', currentTeacherData);
        
        // Load teacher's subjects
        await loadTeacherSubjects();
        
        // Load teacher's students
        await loadTeacherStudents();
        
        // Update UI elements
        updateTeacherPortalUI();
        
        // Set up periodic refresh
        setInterval(refreshTeacherData, 300000); // Refresh every 5 minutes
        
    } catch (error) {
        console.error('Error initializing teacher portal:', error);
        showNotification('حدث خطأ في تحميل بيانات المعلم', 'error');
    }
}

/**
 * Load teacher's assigned subjects
 */
async function loadTeacherSubjects() {
    try {
        // Check if currentTeacherData is available, otherwise try to load from localStorage
        if (!currentTeacherData) {
            const teacherData = localStorage.getItem('teacher');
            if (teacherData) {
                currentTeacherData = JSON.parse(teacherData);
            }
        }
        
        if (!currentTeacherData || !currentTeacherData.id) {
            console.warn('loadTeacherSubjects: No teacher data available');
            window.teacherSubjects = [];
            return;
        }
        
        const teacherId = currentTeacherData.id;
        const response = await fetch(`/api/teacher/${teacherId}/subjects/assignments`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch teacher subjects');
        }
        
        const result = await response.json();
        // Store in global window.teacherSubjects for sharing with teacher.js
        window.teacherSubjects = result.subjects || [];
        
        console.log('Teacher subjects loaded:', window.teacherSubjects);
        
    } catch (error) {
        console.error('Error loading teacher subjects:', error);
        window.teacherSubjects = [];
        showNotification('حدث خطأ في تحميل المواد المعينة', 'error');
    }
}

/**
 * Load students based on teacher's assigned subjects
 */
async function loadTeacherStudents() {
    try {
        // Check if currentTeacherData is available, otherwise try to load from localStorage
        if (!currentTeacherData) {
            const teacherData = localStorage.getItem('teacher');
            if (teacherData) {
                currentTeacherData = JSON.parse(teacherData);
            }
        }
        
        if (!currentTeacherData || !currentTeacherData.id) {
            console.warn('loadTeacherStudents: No teacher data available');
            window.teacherStudents = [];
            return;
        }
        
        const teacherId = currentTeacherData.id;
        const response = await fetch(`/api/teacher/${teacherId}/students`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch teacher students');
        }
        
        const result = await response.json();
        // Store in global window.teacherStudents for sharing with teacher.js
        window.teacherStudents = result.students || [];
        
        console.log('Teacher students loaded:', window.teacherStudents);
        
    } catch (error) {
        console.error('Error loading teacher students:', error);
        window.teacherStudents = [];
        showNotification('حدث خطأ في تحميل بيانات الطلاب', 'error');
    }
}

/**
 * Update teacher portal UI with subject information
 */
function updateTeacherPortalUI() {
    // Update teacher profile information
    updateTeacherProfile();
    
    // Render subjects section
    renderTeacherSubjects();
    
    // Render students section
    renderTeacherStudents();
    
    // Update summary statistics
    updateTeacherSummary();
}

/**
 * Update teacher profile information display
 */
function updateTeacherProfile() {
    // Removed teacher personal information display
    // Only showing teacher name in header
    const nameElement = document.getElementById('teacherName');
    if (nameElement) {
        nameElement.textContent = currentTeacherData.full_name;
    }
}

/**
 * Render the teacher's assigned subjects
 */
function renderTeacherSubjects() {
    const container = document.getElementById('teacherSubjectsContainer');
    if (!container) return;
    
    // Use shared global teacherSubjects
    const subjects = window.teacherSubjects || [];
    
    if (subjects.length === 0) {
        container.innerHTML = `
            <div class="no-subjects-assigned-portal">
                <i class="fas fa-book-open"></i>
                <h3>لا توجد مواد معينة</h3>
                <p>سيتم تعيين المواد من قبل إدارة المدرسة</p>
            </div>
        `;
        return;
    }
    
    // Group subjects by grade level
    const subjectsByGrade = {};
    subjects.forEach(subject => {
        const grade = subject.grade_level || 'غير محدد';
        if (!subjectsByGrade[grade]) {
            subjectsByGrade[grade] = [];
        }
        subjectsByGrade[grade].push(subject);
    });
    
    const html = `
        <div class="subjects-overview">
            <div class="subjects-summary">
                <div class="summary-card">
                    <i class="fas fa-book"></i>
                    <div>
                        <h3>${subjects.length}</h3>
                        <p>إجمالي المواد</p>
                    </div>
                </div>
                <div class="summary-card">
                    <i class="fas fa-layer-group"></i>
                    <div>
                        <h3>${Object.keys(subjectsByGrade).length}</h3>
                        <p>مستويات دراسية</p>
                    </div>
                </div>
            </div>
            
            <div class="subjects-detail">
                ${Object.entries(subjectsByGrade).map(([grade, subjects]) => `
                    <div class="grade-subjects-section">
                        <h3><i class="fas fa-graduation-cap"></i> ${grade}</h3>
                        <div class="subjects-grid">
                            ${subjects.map(subject => `
                                <div class="subject-card-portal">
                                    <div class="subject-header">
                                        <h4>${escapeHtml(subject.name)}</h4>
                                        <span class="subject-id">#${subject.id}</span>
                                    </div>
                                    <div class="subject-details-portal">
                                        <div class="detail-item">
                                            <i class="fas fa-calendar"></i>
                                            <span>معين منذ: ${formatDate(subject.assigned_at)}</span>
                                        </div>
                                        <div class="detail-item">
                                            <i class="fas fa-users"></i>
                                            <span>الطلاب: ${getStudentCountForSubject(subject.name)} طالب</span>
                                        </div>
                                    </div>
                                    <div class="subject-actions-portal">
                                        <button class="btn-small btn-primary" onclick="viewSubjectDetails(${subject.id})">
                                            <i class="fas fa-eye"></i> عرض التفاصيل
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Extract display name from full name (first name or first two names)
 * This helps distinguish siblings who share the same father's name
 */
function getDisplayName(fullName) {
    if (!fullName) return '';
    const names = fullName.trim().split(/\s+/);
    // Return first name only for cleaner display in cards
    // Full name is still shown in details modal
    return names[0] || fullName;
}

/**
 * Remove duplicate students from array based on student id
 */
function deduplicateStudents(students) {
    const seen = new Set();
    return students.filter(student => {
        if (seen.has(student.id)) {
            return false;
        }
        seen.add(student.id);
        return true;
    });
}

/**
 * Render teacher's students based on assigned subjects
 */
function renderTeacherStudents() {
    const container = document.getElementById('teacherStudentsContainer');
    if (!container) return;
    
    // Use shared global teacherStudents and deduplicate
    const students = deduplicateStudents(window.teacherStudents || []);
    
    if (students.length === 0) {
        container.innerHTML = `
            <div class="no-students-assigned">
                <i class="fas fa-users"></i>
                <h3>لا توجد بيانات طلاب</h3>
                <p>سيتم عرض الطلاب المرتبطين بموادك المعينة</p>
            </div>
        `;
        return;
    }
    
    // Group students by grade level
    const studentsByGrade = {};
    students.forEach(student => {
        const grade = student.grade || 'غير محدد';
        if (!studentsByGrade[grade]) {
            studentsByGrade[grade] = [];
        }
        studentsByGrade[grade].push(student);
    });
    
    const html = `
        <div class="students-overview">
            <div class="students-summary">
                <div class="summary-card">
                    <i class="fas fa-users"></i>
                    <div>
                        <h3>${students.length}</h3>
                        <p>إجمالي الطلاب</p>
                    </div>
                </div>
                <div class="summary-card">
                    <i class="fas fa-layer-group"></i>
                    <div>
                        <h3>${Object.keys(studentsByGrade).length}</h3>
                        <p>صفوف دراسية</p>
                    </div>
                </div>
            </div>
            
            <div class="students-detail">
                ${Object.entries(studentsByGrade).map(([grade, students]) => `
                    <div class="grade-students-section">
                        <h3><i class="fas fa-graduation-cap"></i> ${grade} (${students.length} طالب)</h3>
                        <div class="students-grid">
                            ${students.slice(0, 12).map(student => `
                                <div class="student-card-portal">
                                    <div class="student-avatar">
                                        <i class="fas fa-user"></i>
                                    </div>
                                    <div class="student-info">
                                        <h4>${getDisplayName(student.full_name)}</h4>
                                        <div class="student-details">
                                            <span class="student-room" title="الفصل">${student.room || '-'}</span>
                                        </div>
                                    </div>
                                    <div class="student-actions">
                                        <button class="btn-small btn-info" onclick="viewStudentDetails(${student.id})" title="عرض التفاصيل">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                            ${students.length > 12 ? `
                                <div class="more-students-card">
                                    <p>+${students.length - 12} طالب إضافي</p>
                                    <button class="btn-small btn-secondary" onclick="showAllStudents('${grade}')">
                                        عرض الكل
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Update teacher summary statistics
 */
function updateTeacherSummary() {
    const summaryElement = document.getElementById('teacherSummary');
    if (!summaryElement) return;
    
    // Use shared global variables from teacher.js
    const subjectCount = window.teacherSubjects ? window.teacherSubjects.length : 0;
    const studentCount = window.teacherStudents ? window.teacherStudents.length : 0;
    const gradeLevels = window.teacherSubjects ? [...new Set(window.teacherSubjects.map(s => s.grade_level))].length : 0;
    
    summaryElement.innerHTML = `
        <div class="teacher-summary-stats">
            <span><i class="fas fa-book"></i> ${subjectCount} مادة</span>
            <span><i class="fas fa-users"></i> ${studentCount} طالب</span>
            <span><i class="fas fa-layer-group"></i> ${gradeLevels} صف دراسي</span>
        </div>
    `;
}

/**
 * Get student count for a specific subject
 */
function getStudentCountForSubject(subjectName) {
    // Use shared global variables
    const subjects = window.teacherSubjects || [];
    const students = window.teacherStudents || [];
    
    // This would typically come from the backend
    // For now, we'll estimate based on grade level
    const subject = subjects.find(s => s.name === subjectName);
    if (!subject) return 0;
    
    const studentsInGrade = students.filter(s => s.grade === subject.grade_level);
    return studentsInGrade.length;
}

/**
 * View detailed information about a subject
 */
function viewSubjectDetails(subjectId) {
    const subject = teacherSubjects.find(s => s.id === subjectId);
    if (!subject) return;
    
    // Create modal or navigate to subject details page
    showSubjectDetailsModal(subject);
}

/**
 * View detailed information about a student
 */
function viewStudentDetails(studentId) {
    const students = window.teacherStudents || [];
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    
    // Create modal or navigate to student details page
    showStudentDetailsModal(student);
}

/**
 * Show all students for a specific grade
 */
function showAllStudents(gradeLevel) {
    const students = window.teacherStudents || [];
    const filteredStudents = students.filter(s => s.grade === gradeLevel);
    showStudentsListModal(filteredStudents, gradeLevel);
}

/**
 * Show subject details in modal
 */
function showSubjectDetailsModal(subject) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <span class="close-modal" onclick="this.closest('.modal').remove()">&times;</span>
            <h2><i class="fas fa-book"></i> تفاصيل المادة</h2>
            <div class="subject-details-modal">
                <div class="detail-row">
                    <strong>اسم المادة:</strong>
                    <span>${escapeHtml(subject.name)}</span>
                </div>
                <div class="detail-row">
                    <strong>المستوى الدراسي:</strong>
                    <span>${escapeHtml(subject.grade_level)}</span>
                </div>
                <div class="detail-row">
                    <strong>تاريخ التعيين:</strong>
                    <span>${formatDate(subject.assigned_at)}</span>
                </div>
                <div class="detail-row">
                    <strong>عدد الطلاب:</strong>
                    <span>${getStudentCountForSubject(subject.name)} طالب</span>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-primary" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i> إغلاق
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

/**
 * Show student details in modal
 */
function showStudentDetailsModal(student) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <span class="close-modal" onclick="this.closest('.modal').remove()">&times;</span>
            <h2><i class="fas fa-user"></i> تفاصيل الطالب</h2>
            <div class="student-details-modal">
                <div class="detail-row">
                    <strong>الاسم:</strong>
                    <span>${escapeHtml(student.full_name)}</span>
                </div>
                <div class="detail-row">
                    <strong>الصف:</strong>
                    <span>${student.grade}</span>
                </div>
                <div class="detail-row">
                    <strong>الفصل:</strong>
                    <span>${student.room || '-'}</span>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-primary" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i> إغلاق
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

/**
 * Show list of all students for a grade
 */
function showStudentsListModal(students, gradeLevel) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    // Deduplicate students before displaying
    const uniqueStudents = deduplicateStudents(students);
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
            <span class="close-modal" onclick="this.closest('.modal').remove()">&times;</span>
            <h2><i class="fas fa-users"></i> جميع الطلاب - ${gradeLevel}</h2>
            <div class="students-list-modal">
                <div class="table-responsive">
                    <table class="table-school">
                        <thead>
                            <tr>
                                <th>الاسم</th>
                                <th>الفصل</th>
                                <th>الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${uniqueStudents.map(student => `
                                <tr>
                                    <td>${escapeHtml(student.full_name)}</td>
                                    <td>${student.room || '-'}</td>
                                    <td>
                                        <button class="btn-small btn-info" onclick="viewStudentDetails(${student.id})">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-primary" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i> إغلاق
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

/**
 * Refresh teacher data periodically
 */
async function refreshTeacherData() {
    try {
        await loadTeacherSubjects();
        await loadTeacherStudents();
        updateTeacherPortalUI();
        console.log('Teacher data refreshed');
    } catch (error) {
        console.error('Error refreshing teacher data:', error);
    }
}

/**
 * Format date for display
 */
function formatDate(dateString) {
    if (!dateString) return 'غير محدد';
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Get authentication headers
 */
function getAuthHeaders() {
    const token = localStorage.getItem('teacher_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

/**
 * Show notification message
 */
function showNotification(message, type = 'info') {
    // This would integrate with existing notification system
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Initialize when DOM is loaded - check for portalScreen which is the main container in teacher-portal.html
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the teacher portal page by looking for the portal screen or subjects container
    if (document.getElementById('portalScreen') || document.getElementById('subjectsOverview')) {
        // Check if teacher data is already loaded (from login)
        const teacherData = localStorage.getItem('teacher');
        if (teacherData) {
            currentTeacherData = JSON.parse(teacherData);
            console.log('Teacher data loaded from localStorage:', currentTeacherData);
            
            // Check if data is already loaded by teacher.js
            const dataAlreadyLoaded = window.teacherStudents && window.teacherStudents.length > 0;
            
            if (dataAlreadyLoaded) {
                // Data already loaded, just render the UI
                console.log('Teacher data already loaded, rendering UI...');
                updateTeacherPortalUI();
            } else {
                // Load teacher's subjects and students
                Promise.all([loadTeacherSubjects(), loadTeacherStudents()])
                    .then(() => {
                        updateTeacherPortalUI();
                    })
                    .catch(error => {
                        console.error('Error loading teacher data:', error);
                    });
            }
        }
    }
});

// Make functions globally available
window.initializeTeacherPortal = initializeTeacherPortal;
window.viewSubjectDetails = viewSubjectDetails;
window.viewStudentDetails = viewStudentDetails;
window.showAllStudents = showAllStudents;