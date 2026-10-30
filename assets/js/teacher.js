// assets/js/teacher.js - Teacher Portal JavaScript

let currentTeacher = null;
// Expose currentTeacher globally for teacher-recommendations.js
window.currentTeacher = null;
// Use window.teacherSubjects to share with teacher-portal-enhanced.js
let teacherSubjects = window.teacherSubjects || [];
let teacherStudents = window.teacherStudents || [];
let currentAcademicYear = null;
let currentSubjectGrades = {}; // Cache for grades data
let currentSubjectAttendance = {}; // Cache for attendance data

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

// Helper function to get auth headers
function getAuthHeaders() {
    const token = localStorage.getItem('teacher_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Hide notification after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}

// Close modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('تم نسخ النص إلى الحافظة', 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showNotification('فشل في النسخ', 'error');
    });
}

// Initialize Portal with enhanced teacher information display
async function initializePortal() {
    if (!currentTeacher) {
        console.warn('initializePortal: currentTeacher is null');
        return;
    }
    
    console.log('Initializing portal for teacher:', currentTeacher.id);
    
    // Display teacher info in header
    const teacherNameEl = document.getElementById('teacherName');
    const teacherCodeDisplayEl = document.getElementById('teacherCodeDisplay');
    if (teacherNameEl) teacherNameEl.textContent = currentTeacher.full_name;
    if (teacherCodeDisplayEl) teacherCodeDisplayEl.textContent = currentTeacher.teacher_code;
    
    // Display detailed teacher information
    const teacherFullNameEl = document.getElementById('teacherFullName');
    const teacherCodeDetailEl = document.getElementById('teacherCodeDetail');
    const teacherSpecializationEl = document.getElementById('teacherSpecialization');
    const teacherPhoneEl = document.getElementById('teacherPhone');
    const teacherEmailEl = document.getElementById('teacherEmail');
    if (teacherFullNameEl) teacherFullNameEl.textContent = currentTeacher.full_name;
    if (teacherCodeDetailEl) teacherCodeDetailEl.textContent = currentTeacher.teacher_code;
    if (teacherSpecializationEl) teacherSpecializationEl.textContent = currentTeacher.specialization || 'لم يُحدد';
    if (teacherPhoneEl) teacherPhoneEl.textContent = currentTeacher.phone || 'لم يُحدد';
    if (teacherEmailEl) teacherEmailEl.textContent = currentTeacher.email || 'لم يُحدد';
    
    // Load current academic year
    await loadCurrentAcademicYear();
    
    // Load teacher's subjects
    await loadTeacherSubjects();
    
    // Load teacher's students
    await loadTeacherStudents();
    
    // Update dashboard
    updateDashboard();
    
    console.log('Portal initialization complete');
}

// Copy teacher code from dashboard with visual feedback
function copyTeacherCodeFromDashboard(element = null) {
    const code = currentTeacher?.teacher_code;
    if (!code) {
        showNotification('رمز المعلم غير متوفر', 'error');
        return;
    }
    
    navigator.clipboard.writeText(code).then(() => {
        showNotification('تم نسخ رمز المعلم إلى الحافظة', 'success');
        
        // Visual feedback on the code element
        if (element) {
            const originalBg = element.style.backgroundColor;
            const originalColor = element.style.color;
            element.style.backgroundColor = '#4CAF50';
            element.style.color = 'white';
            setTimeout(() => {
                element.style.backgroundColor = originalBg;
                element.style.color = originalColor;
            }, 1000);
        }
        
        // Visual feedback on header code display
        const headerCodeElement = document.getElementById('teacherCodeDisplay');
        if (headerCodeElement && !element) {
            const originalBg = headerCodeElement.style.backgroundColor;
            headerCodeElement.style.backgroundColor = '#4CAF50';
            headerCodeElement.style.color = 'white';
            setTimeout(() => {
                headerCodeElement.style.backgroundColor = originalBg;
                headerCodeElement.style.color = '';
            }, 1000);
        }
        
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showNotification('فشل في النسخ، يرجى المحاولة مرة أخرى', 'error');
        
        // Fallback for older browsers
        fallbackCopyTextToClipboard(code);
    });
}

// Fallback copy method for older browsers
function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showNotification('تم نسخ رمز المعلم إلى الحافظة', 'success');
        } else {
            showNotification('فشل في النسخ التلقائي، يرجى نسخ الرمز يدوياً', 'error');
        }
    } catch (err) {
        console.error('Fallback copy failed: ', err);
        showNotification('فشل في النسخ، يرجى نسخ الرمز يدوياً: ' + text, 'error');
    }
    
    document.body.removeChild(textArea);
}

// Enhanced Teacher Login with better validation and user feedback
document.getElementById('teacherLoginForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const teacherCodeInput = document.getElementById('teacherCode');
    const teacherCode = teacherCodeInput.value.trim();
    const teacherPasswordInput = document.getElementById('teacherPassword');
    const teacherPassword = teacherPasswordInput ? teacherPasswordInput.value : '';
    
    // Validate code format
    if (!teacherCode) {
        showNotification('يرجى إدخال رمز المعلم', 'error');
        teacherCodeInput.focus();
        return;
    }
    
    // Basic format validation (TCHR-XXXXX-XXXX)
    if (!/^TCHR-\d{5}-[A-Z0-9]{4}$/i.test(teacherCode)) {
        showNotification('تنسيق رمز المعلم غير صحيح. الرجاء استخدام التنسيق: TCHR-XXXXX-XXXX', 'error');
        teacherCodeInput.focus();
        teacherCodeInput.select();
        return;
    }
    
    // Add loading state to button
    const loginButton = e.submitter || this.querySelector('button[type="submit"]');
    const originalButtonText = loginButton.innerHTML;
    loginButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تسجيل الدخول...';
    loginButton.disabled = true;
    
    try {
        const response = await fetch('/api/teacher/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ teacher_code: teacherCode, password: teacherPassword })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Store teacher data and token
            currentTeacher = result.teacher;
            window.currentTeacher = result.teacher; // Expose globally
            localStorage.setItem('teacher_token', result.token);
            localStorage.setItem('teacher', JSON.stringify(currentTeacher));
            
            showNotification('تم تسجيل الدخول بنجاح!', 'success');
            
            // Hide login screen and show portal
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('portalScreen').style.display = 'block';
            
            // Initialize portal
            initializePortal();
        } else {
            showNotification(result.error_ar || result.error || 'رمز المعلم غير صحيح', 'error');
            teacherCodeInput.focus();
            teacherCodeInput.select();
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        // Restore button state
        loginButton.innerHTML = originalButtonText;
        loginButton.disabled = false;
    }
});

// Load current academic year
async function loadCurrentAcademicYear() {
    try {
        const response = await fetch('/api/academic-year/current');
        const result = await response.json();
        
        if (result.success) {
            currentAcademicYear = result.current_academic_year;
        }
    } catch (error) {
        console.error('Error loading academic year:', error);
    }
}

// Load teacher's subjects
async function loadTeacherSubjects() {
    if (!currentTeacher) {
        console.warn('loadTeacherSubjects: currentTeacher is null');
        return;
    }
    
    try {
        console.log('Loading subjects for teacher:', currentTeacher.id);
        const response = await fetch(`/api/teacher/${currentTeacher.id}/subjects`, {
            headers: getAuthHeaders()
        });
        
        console.log('Subjects API response status:', response.status);
        const result = await response.json();
        console.log('Subjects API result:', result);
        
        if (result.success) {
            // Store in window global to share with teacher-portal-enhanced.js
            window.teacherSubjects = result.subjects || [];
            // Update local reference
            teacherSubjects = window.teacherSubjects;
            console.log('Teacher subjects loaded:', teacherSubjects);
            renderSubjectsTable();
            updateSubjectsOverview();
        } else {
            console.warn('API returned success: false', result);
        }
    } catch (error) {
        console.error('Error loading teacher subjects:', error);
        showNotification('حدث خطأ في تحميل المواد', 'error');
    }
}

// Load teacher's students
async function loadTeacherStudents() {
    if (!currentTeacher) {
        console.warn('loadTeacherStudents: currentTeacher is null');
        return;
    }
    
    try {
        console.log('Loading students for teacher:', currentTeacher.id);
        const response = await fetch(`/api/teacher/${currentTeacher.id}/students`, {
            headers: getAuthHeaders()
        });
        
        console.log('Students API response status:', response.status);
        const result = await response.json();
        console.log('Students API result:', result);
        
        if (result.success) {
            // Store in window global to share with teacher-portal-enhanced.js
            window.teacherStudents = result.students || [];
            // Update local reference
            teacherStudents = window.teacherStudents;
            console.log('Teacher students loaded:', teacherStudents);
            updateStudentsCount();
            renderSubjectsTable();
            // Call renderTeacherStudents from teacher-portal-enhanced.js if available
            if (typeof renderTeacherStudents === 'function') {
                renderTeacherStudents();
            } else if (typeof window.renderTeacherStudents === 'function') {
                window.renderTeacherStudents();
            }
        } else {
            console.warn('API returned success: false for students', result);
        }
    } catch (error) {
        console.error('Error loading teacher students:', error);
    }
}

// Update dashboard overview
function updateDashboard() {
    updateSubjectsOverview();
    updateStudentsCount();
    renderSubjectsTable(); // Ensure subjects table is rendered with latest data
    
    // Calculate and display attendance rate and grades average
    calculateAndDisplayStats();
}

// Calculate and display statistics
function calculateAndDisplayStats() {
    const attendanceRateEl = document.getElementById('attendanceRate');
    const gradesAverageEl = document.getElementById('gradesAverage');
    
    // Get students from window global
    const students = window.teacherStudents || teacherStudents || [];
    
    if (students.length === 0) {
        if (attendanceRateEl) attendanceRateEl.textContent = '0%';
        if (gradesAverageEl) gradesAverageEl.textContent = '0';
        return;
    }
    
    // Calculate attendance rate
    let totalAttendanceDays = 0;
    let presentDays = 0;
    
    students.forEach(student => {
        const attendance = student.daily_attendance || {};
        const days = Object.values(attendance);
        if (days.length > 0) {
            totalAttendanceDays += days.length;
            presentDays += days.filter(day => day === 'present' || day === 'حاضر').length;
        }
    });
    
    const attendanceRate = totalAttendanceDays > 0 
        ? Math.round((presentDays / totalAttendanceDays) * 100) 
        : 0;
    
    // Calculate grades average
    let totalScore = 0;
    let scoreCount = 0;
    
    students.forEach(student => {
        const scores = student.detailed_scores || {};
        Object.values(scores).forEach(subjectScores => {
            if (typeof subjectScores === 'object') {
                // Sum up all score fields (month1, month2, midterm, month3, month4, final)
                ['month1', 'month2', 'midterm', 'month3', 'month4', 'final'].forEach(field => {
                    if (subjectScores[field] && !isNaN(subjectScores[field])) {
                        totalScore += parseFloat(subjectScores[field]);
                        scoreCount++;
                    }
                });
            }
        });
    });
    
    const gradesAverage = scoreCount > 0 
        ? Math.round((totalScore / scoreCount) * 10) / 10 // Round to 1 decimal
        : 0;
    
    if (attendanceRateEl) attendanceRateEl.textContent = attendanceRate + '%';
    if (gradesAverageEl) gradesAverageEl.textContent = gradesAverage;
}

// Update subjects overview
function updateSubjectsOverview() {
    const container = document.getElementById('subjectsOverview');
    
    if (!container) {
        console.warn('subjectsOverview container not found');
        return;
    }
    
    // Always use window.teacherSubjects to get latest data
    const subjects = window.teacherSubjects || teacherSubjects || [];
    console.log('updateSubjectsOverview called, teacherSubjects:', subjects);
    
    if (subjects.length === 0) {
        container.innerHTML = '<p>لا توجد مواد معينة لك حالياً</p>';
        return;
    }
    
    let html = '<div class="subjects-list">';
    subjects.forEach(subject => {
        html += `
            <div class="subject-item">
                <span class="subject-name">${escapeHtml(subject.name)}</span>
                <span class="subject-grade">${escapeHtml(subject.grade_level)}</span>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Update students count
function updateStudentsCount() {
    const studentsCountEl = document.getElementById('studentsCount');
    if (studentsCountEl) {
        // Always use window.teacherStudents to get latest data
        const students = window.teacherStudents || teacherStudents || [];
        studentsCountEl.textContent = students.length;
    } else {
        console.warn('studentsCount element not found');
    }
}

// Render subjects table
function renderSubjectsTable() {
    const tbody = document.getElementById('subjectsTableBody');
    
    if (!tbody) {
        console.warn('subjectsTableBody container not found');
        return;
    }
    
    // Always use window globals to get latest data
    const subjects = window.teacherSubjects || teacherSubjects || [];
    const students = window.teacherStudents || teacherStudents || [];
    
    console.log('renderSubjectsTable called, teacherSubjects:', subjects);
    
    if (subjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">لا توجد مواد معينة لك</td></tr>';
        return;
    }
    
    let html = '';
    subjects.forEach(subject => {
        // Count students in this subject's grade level
        // Handle grade format mismatch: student grade is "ابتدائي - الأول الابتدائي"
        // while subject grade_level is "الأول الابتدائي"
        const subjectStudents = students.filter(student => {
            return student.grade === subject.grade_level || 
                   student.grade.endsWith(' - ' + subject.grade_level) ||
                   student.grade.includes(subject.grade_level);
        });
        
        html += `
            <tr>
                <td class="td-portal">${escapeHtml(subject.name)}</td>
                <td class="td-portal">${escapeHtml(subject.grade_level)}</td>
                <td class="td-portal">${subjectStudents.length} طالب</td>
                <td class="td-portal">
                    <button class="btn-small-portal btn-info-portal" onclick="openGradesModal(${subject.id}, '${escapeHtml(subject.name)}', '${escapeHtml(subject.grade_level)}')">
                        <i class="fas fa-chart-line"></i> الدرجات
                    </button>
                    <button class="btn-small-portal btn-success-portal" onclick="openAttendanceModal(${subject.id}, '${escapeHtml(subject.name)}', '${escapeHtml(subject.grade_level)}')">
                        <i class="fas fa-calendar-check"></i> الحضور
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// Open Grades Modal
async function openGradesModal(subjectId, subjectName, gradeLevel) {
    document.getElementById('gradesSubjectName').textContent = subjectName;
    
    // Get students for this subject
    // Handle grade format mismatch: student grade is "ابتدائي - الأول الابتدائي"
    // while subject grade_level is "الأول الابتدائي"
    const students = window.teacherStudents || teacherStudents || [];
    // Deduplicate students before filtering to ensure no duplicates
    const uniqueStudents = deduplicateStudents(students);
    const subjectStudents = uniqueStudents.filter(student => {
        return student.grade === gradeLevel || 
               student.grade.endsWith(' - ' + gradeLevel) ||
               student.grade.includes(gradeLevel);
    });
    
    // Load existing grades
    await loadSubjectGrades(subjectId, subjectName, gradeLevel);
    
    // Render grades table
    renderGradesTable(subjectStudents, subjectName);
    
    // Show modal
    document.getElementById('gradesModal').style.display = 'flex';
}

// Load subject grades
async function loadSubjectGrades(subjectId, subjectName, gradeLevel) {
    if (!currentAcademicYear) {
        await loadCurrentAcademicYear();
    }
    if (!currentAcademicYear) {
        console.warn('No academic year available for loading grades');
        return;
    }
    
    // Initialize the subject grades cache
    if (!currentSubjectGrades[subjectName]) {
        currentSubjectGrades[subjectName] = {};
    }
    
    // Get students for this grade level
    const students = window.teacherStudents || teacherStudents || [];
    const uniqueStudents = deduplicateStudents(students);
    const subjectStudents = uniqueStudents.filter(student => {
        return student.grade === gradeLevel || 
               student.grade.endsWith(' - ' + gradeLevel) ||
               student.grade.includes(gradeLevel);
    });
    
    // Fetch grades for each student from the database
    for (const student of subjectStudents) {
        try {
            const response = await fetch(`/api/student/${student.id}/grades/${currentAcademicYear.id}`, {
                headers: getAuthHeaders()
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.grades && result.grades[subjectName]) {
                    currentSubjectGrades[subjectName][student.id] = result.grades[subjectName];
                } else {
                    // No grades found for this student/subject, initialize with zeros
                    if (!currentSubjectGrades[subjectName][student.id]) {
                        currentSubjectGrades[subjectName][student.id] = {
                            month1: 0, month2: 0, midterm: 0, month3: 0, month4: 0, final: 0
                        };
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading grades for student ${student.id}:`, error);
        }
    }
}

// Render grades table
function renderGradesTable(students, subjectName) {
    const tbody = document.getElementById('gradesTableBody');
    
    if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">لا يوجد طلاب في هذا الصف</td></tr>';
        return;
    }
    
    let html = '';
    students.forEach(student => {
        // Get existing grades for this student and subject
        const studentGrades = currentSubjectGrades[subjectName]?.[student.id] || {
            month1: 0, month2: 0, midterm: 0, month3: 0, month4: 0, final: 0
        };
        
        // Calculate average for display
        const grades = Object.values(studentGrades).filter(g => g > 0);
        const avg = grades.length > 0 ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : '-';
        
        html += `
            <tr>
                <td class="td-portal">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span>${escapeHtml(student.full_name)}</span>
                        <button class="btn-small-portal btn-info-portal" onclick="showStudentPerformanceInsights(${student.id}, '${student.grade}', '${subjectName}')" title="عرض رؤى الأداء">
                            <i class="fas fa-chart-line"></i>
                        </button>
                    </div>
                </td>
                <td class="td-portal">
                    <input type="number" min="0" max="100" value="${studentGrades.month1}" 
                           class="form-input grade-input" data-student="${student.id}" data-period="month1"
                           style="width: 70px; padding: 0.2rem;">
                </td>
                <td class="td-portal">
                    <input type="number" min="0" max="100" value="${studentGrades.month2}" 
                           class="form-input grade-input" data-student="${student.id}" data-period="month2"
                           style="width: 70px; padding: 0.2rem;">
                </td>
                <td class="td-portal">
                    <input type="number" min="0" max="100" value="${studentGrades.midterm}" 
                           class="form-input grade-input" data-student="${student.id}" data-period="midterm"
                           style="width: 70px; padding: 0.2rem;">
                </td>
                <td class="td-portal">
                    <input type="number" min="0" max="100" value="${studentGrades.month3}" 
                           class="form-input grade-input" data-student="${student.id}" data-period="month3"
                           style="width: 70px; padding: 0.2rem;">
                </td>
                <td class="td-portal">
                    <input type="number" min="0" max="100" value="${studentGrades.month4}" 
                           class="form-input grade-input" data-student="${student.id}" data-period="month4"
                           style="width: 70px; padding: 0.2rem;">
                </td>
                <td class="td-portal">
                    <input type="number" min="0" max="100" value="${studentGrades.final}" 
                           class="form-input grade-input" data-student="${student.id}" data-period="final"
                           style="width: 70px; padding: 0.2rem;">
                </td>
                <td class="td-portal">
                    <button class="btn-small-portal btn-success-portal" onclick="saveStudentGrades(${student.id}, '${subjectName}')">
                        <i class="fas fa-save"></i> حفظ
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Add event listeners for grade inputs
    document.querySelectorAll('.grade-input').forEach(input => {
        input.addEventListener('change', function() {
            const studentId = this.dataset.student;
            const period = this.dataset.period;
            const value = parseInt(this.value) || 0;
            
            // Update cache
            if (!currentSubjectGrades[subjectName]) {
                currentSubjectGrades[subjectName] = {};
            }
            if (!currentSubjectGrades[subjectName][studentId]) {
                currentSubjectGrades[subjectName][studentId] = {};
            }
            currentSubjectGrades[subjectName][studentId][period] = value;
        });
    });
}

// Save student grades
async function saveStudentGrades(studentId, subjectName) {
    if (!currentAcademicYear || !currentTeacher) return;
    
    const studentGrades = currentSubjectGrades[subjectName]?.[studentId];
    if (!studentGrades) {
        showNotification('لا توجد درجات للحفظ', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/teacher/grades', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                student_id: studentId,
                subject_name: subjectName,
                academic_year_id: currentAcademicYear.id,
                grades: studentGrades
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showNotification('تم حفظ الدرجات بنجاح', 'success');
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ في حفظ الدرجات', 'error');
        }
    } catch (error) {
        console.error('Error saving grades:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Save all grades
async function saveAllGrades() {
    if (!currentAcademicYear || !currentTeacher) {
        showNotification('يرجى التأكد من تسجيل الدخول وتحديد السنة الدراسية', 'error');
        return;
    }
    
    // Get the current subject name from the modal header
    const subjectName = document.getElementById('gradesSubjectName')?.textContent;
    if (!subjectName || !currentSubjectGrades[subjectName]) {
        showNotification('لا توجد درجات للحفظ', 'error');
        return;
    }
    
    const studentGrades = currentSubjectGrades[subjectName];
    const studentIds = Object.keys(studentGrades);
    
    if (studentIds.length === 0) {
        showNotification('لا توجد درجات للحفظ', 'error');
        return;
    }
    
    showNotification('جارٍ حفظ جميع الدرجات...', 'info');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const studentId of studentIds) {
        const grades = studentGrades[studentId];
        // Only save if at least one grade is non-zero
        const hasGrades = Object.values(grades).some(g => parseInt(g) > 0);
        if (!hasGrades) continue;
        
        try {
            const response = await fetch('/api/teacher/grades', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    student_id: parseInt(studentId),
                    subject_name: subjectName,
                    academic_year_id: currentAcademicYear.id,
                    grades: grades
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                successCount++;
            } else {
                errorCount++;
                console.error(`Error saving grades for student ${studentId}:`, result.error_ar || result.error);
            }
        } catch (error) {
            errorCount++;
            console.error(`Error saving grades for student ${studentId}:`, error);
        }
    }
    
    if (errorCount === 0 && successCount > 0) {
        showNotification(`تم حفظ درجات ${successCount} طالب بنجاح`, 'success');
    } else if (successCount > 0) {
        showNotification(`تم حفظ ${successCount} وفشل ${errorCount}`, 'warning');
    } else if (errorCount > 0) {
        showNotification('فشل في حفظ الدرجات', 'error');
    } else {
        showNotification('لا توجد درجات جديدة للحفظ', 'info');
    }
}

// Open Attendance Modal
async function openAttendanceModal(subjectId, subjectName, gradeLevel) {
    document.getElementById('attendanceSubjectName').textContent = subjectName;
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendanceDate').value = today;
    
    // Get students for this subject
    // Handle grade format mismatch: student grade is "ابتدائي - الأول الابتدائي"
    // while subject grade_level is "الأول الابتدائي"
    const students = window.teacherStudents || teacherStudents || [];
    // Deduplicate students before filtering to ensure no duplicates
    const uniqueStudents = deduplicateStudents(students);
    const subjectStudents = uniqueStudents.filter(student => {
        return student.grade === gradeLevel || 
               student.grade.endsWith(' - ' + gradeLevel) ||
               student.grade.includes(gradeLevel);
    });
    
    // Load existing attendance
    await loadSubjectAttendance(subjectId, subjectName, gradeLevel);
    
    // Render attendance records
    renderAttendanceRecords(subjectStudents, subjectName);
    
    // Show modal
    document.getElementById('attendanceModal').style.display = 'flex';
}

// Load subject attendance
async function loadSubjectAttendance(subjectId, subjectName, gradeLevel) {
    // This would typically fetch from the database
    // For now, we'll initialize with empty attendance
    if (!currentSubjectAttendance[subjectName]) {
        currentSubjectAttendance[subjectName] = {};
    }
}

// Render attendance records
function renderAttendanceRecords(students, subjectName) {
    const container = document.getElementById('attendanceRecords');
    
    if (students.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 2rem;">لا يوجد طلاب في هذا الصف</p>';
        return;
    }
    
    let html = '<div class="table-responsive">';
    html += '<table class="table-portal">';
    html += '<thead><tr><th class="th-portal">اسم الطالب</th><th class="th-portal">الحالة</th><th class="th-portal">الإجراءات</th></tr></thead>';
    html += '<tbody>';
    
    students.forEach(student => {
        html += `
            <tr>
                <td class="td-portal">${escapeHtml(student.full_name)}</td>
                <td class="td-portal">
                    <select class="form-input attendance-select" data-student="${student.id}" style="width: 120px;">
                        <option value="present">حاضر</option>
                        <option value="absent">غائب</option>
                        <option value="late">متأخر</option>
                        <option value="excused">معذور</option>
                    </select>
                </td>
                <td class="td-portal">
                    <button class="btn-small-portal btn-success-portal" onclick="saveStudentAttendance(${student.id}, '${subjectName}')">
                        <i class="fas fa-save"></i> تسجيل
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Add attendance day
function addAttendanceDay() {
    const date = document.getElementById('attendanceDate').value;
    if (!date) {
        showNotification('يرجى اختيار تاريخ', 'error');
        return;
    }
    
    showNotification(`تم إضافة سجل حضور ليوم ${date}`, 'success');
    // In a real implementation, you would add this date to the attendance records
}

// Save student attendance
async function saveStudentAttendance(studentId, subjectName) {
    if (!currentAcademicYear || !currentTeacher) return;
    
    const select = document.querySelector(`.attendance-select[data-student="${studentId}"]`);
    const status = select.value;
    const date = document.getElementById('attendanceDate').value;
    
    if (!date) {
        showNotification('يرجى اختيار تاريخ', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/teacher/attendance', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                student_id: studentId,
                academic_year_id: currentAcademicYear.id,
                attendance_date: date,
                status: status,
                notes: ''
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showNotification('تم تسجيل الحضور بنجاح', 'success');
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ في تسجيل الحضور', 'error');
        }
    } catch (error) {
        console.error('Error saving attendance:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Logout teacher
function logoutTeacher() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        // Clear local storage
        localStorage.removeItem('teacher_token');
        localStorage.removeItem('teacher');
        
        // Reset variables
        currentTeacher = null;
        window.currentTeacher = null; // Clear global
        teacherSubjects = [];
        teacherStudents = [];
        
        // Reset form
        document.getElementById('teacherLoginForm').reset();
        
        // Show logout notification
        showNotification('تم تسجيل الخروج بنجاح', 'info');
        
        // Redirect to main homepage after a short delay to show the notification
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    }
}

// ============================================================================
// PERFORMANCE MODEL FOR PREDICTIONS
// ============================================================================

// Grade trend analysis constants
const TEACHER_PERIOD_ORDER = ['month1', 'month2', 'midterm', 'month3', 'month4', 'final'];
const TEACHER_PERIOD_NAMES = {
    month1: 'شهر الأول',
    month2: 'شهر الثاني',
    midterm: 'نصف السنة',
    month3: 'شهر الثالث',
    month4: 'شهر الرابع',
    final: 'نهاية السنة'
};

// Analyze grade trends for a subject
function analyzeTeacherGradeTrend(grades, maxGrade) {
    const thresholds = maxGrade === 10 ? 
        { passThreshold: 5, safeThreshold: 7 } : 
        { passThreshold: 50, safeThreshold: 70 };
    
    const gradeSequence = [];
    let firstNonZeroIndex = -1;
    let lastNonZeroIndex = -1;
    
    TEACHER_PERIOD_ORDER.forEach((period, index) => {
        const grade = parseInt(grades[period]) || 0;
        gradeSequence.push({ period, grade, index });
        if (grade > 0) {
            if (firstNonZeroIndex === -1) firstNonZeroIndex = index;
            lastNonZeroIndex = index;
        }
    });
    
    if (firstNonZeroIndex === -1) {
        return {
            trend: 'none',
            hasImprovement: false,
            hasDeterioration: false,
            latestGrade: 0,
            firstGrade: 0,
            consistency: 'unknown'
        };
    }
    
    const nonZeroGrades = gradeSequence.filter(g => g.grade > 0);
    const firstGrade = nonZeroGrades[0];
    const latestGrade = nonZeroGrades[nonZeroGrades.length - 1];
    
    let hasSignificantImprovement = false;
    let hasSignificantDeterioration = false;
    let hadZeroBeforeGoodGrade = false;
    
    // Check for zeros before good grades
    for (let i = 0; i < gradeSequence.length; i++) {
        const current = gradeSequence[i];
        if (current.grade === 0 && i < lastNonZeroIndex) {
            for (let j = i + 1; j < gradeSequence.length; j++) {
                if (gradeSequence[j].grade > 0) {
                    if (gradeSequence[j].grade >= thresholds.safeThreshold) {
                        hadZeroBeforeGoodGrade = true;
                    }
                    break;
                }
            }
        }
    }
    
    // Analyze consecutive grade changes
    for (let i = 1; i < nonZeroGrades.length; i++) {
        const prev = nonZeroGrades[i - 1];
        const curr = nonZeroGrades[i];
        const changePercent = ((curr.grade - prev.grade) / maxGrade) * 100;
        
        if (changePercent >= 30) hasSignificantImprovement = true;
        if (changePercent <= -30) hasSignificantDeterioration = true;
    }
    
    let trend = 'stable';
    const overallChangePercent = ((latestGrade.grade - firstGrade.grade) / maxGrade) * 100;
    if (overallChangePercent >= 20) trend = 'improving';
    else if (overallChangePercent <= -20) trend = 'declining';
    
    const avgGrade = nonZeroGrades.reduce((sum, g) => sum + g.grade, 0) / nonZeroGrades.length;
    const variance = nonZeroGrades.reduce((sum, g) => sum + Math.pow(g.grade - avgGrade, 2), 0) / nonZeroGrades.length;
    const consistencyRatio = Math.sqrt(variance) / maxGrade;
    
    let consistency = 'consistent';
    if (consistencyRatio > 0.25) consistency = 'inconsistent';
    else if (consistencyRatio > 0.15) consistency = 'variable';
    
    return {
        trend,
        hasImprovement: hasSignificantImprovement || hadZeroBeforeGoodGrade,
        hasDeterioration: hasSignificantDeterioration,
        hadZeroBeforeGoodGrade,
        latestGrade: latestGrade.grade,
        latestPeriod: latestGrade.period,
        firstGrade: firstGrade.grade,
        firstPeriod: firstGrade.period,
        avgGrade,
        consistency
    };
}

class TeacherPerformanceModel {
    predictPerformance(studentGrades, studentGrade) {
        if (!studentGrades || Object.keys(studentGrades).length === 0) return { 
            level: 'average', 
            score: 0, 
            recommendations: ['لا توجد بيانات كافية'],
            riskLevel: 'unknown',
            subjectTrends: {},
            passFailPrediction: 'غير محدد',
            predictedGrades: {}
        };
        
        const scores = studentGrades;
        let totalGrades = 0;
        let gradeCount = 0;
        let maxGrade = this.getMaxGradeForStudent(studentGrade);
        let thresholds = this.getThresholds(maxGrade);
        let poorSubjects = [];
        let atRiskSubjects = [];
        let safeSubjects = [];
        let improvingSubjects = [];
        let decliningSubjects = [];
        let inconsistentSubjects = [];
        let subjectTrends = {};
        let subjectPredictions = {};
        
        for (const subject in scores) {
            const subjectGrades = scores[subject];
            let subjectTotal = 0;
            let subjectGradeCount = 0;
            
            // Analyze trend for this subject
            const trendAnalysis = analyzeTeacherGradeTrend(subjectGrades, maxGrade);
            subjectTrends[subject] = trendAnalysis;
            
            // Predict future grades for this subject
            subjectPredictions[subject] = this.predictSubjectGrades(subjectGrades, trendAnalysis, maxGrade);
            
            for (const period in subjectGrades) {
                const grade = parseInt(subjectGrades[period]) || 0;
                if (grade > 0) {
                    subjectTotal += grade;
                    subjectGradeCount++;
                    totalGrades += grade;
                    gradeCount++;
                }
            }
            
            if (subjectGradeCount > 0) {
                const subjectAvg = subjectTotal / subjectGradeCount;
                const subjectData = {
                    name: subject,
                    avg: subjectAvg,
                    trend: trendAnalysis,
                    latestGrade: trendAnalysis.latestGrade,
                    prediction: subjectPredictions[subject]
                };
                
                if (subjectAvg < thresholds.passThreshold) {
                    poorSubjects.push(subjectData);
                } else if (subjectAvg < thresholds.safeThreshold) {
                    atRiskSubjects.push(subjectData);
                } else {
                    safeSubjects.push(subjectData);
                }
                
                // Track trend categories
                if (trendAnalysis.hasImprovement) {
                    improvingSubjects.push(subjectData);
                }
                if (trendAnalysis.hasDeterioration) {
                    decliningSubjects.push(subjectData);
                }
                if (trendAnalysis.consistency === 'inconsistent') {
                    inconsistentSubjects.push(subjectData);
                }
            }
        }

        const avg = gradeCount > 0 ? (totalGrades / (gradeCount * maxGrade)) * 100 : 0;
        const rawAvg = gradeCount > 0 ? totalGrades / gradeCount : 0;
        let level = 'average';
        let riskLevel = 'safe';

        const safePercentage = (thresholds.safeThreshold / maxGrade) * 100;
        const passPercentage = (thresholds.passThreshold / maxGrade) * 100;

        if (avg >= 90) {
            level = 'excellent';
            riskLevel = 'safe';
        } else if (avg >= safePercentage) {
            level = 'good';
            riskLevel = 'safe';
        } else if (avg >= passPercentage) {
            level = 'average';
            riskLevel = 'at-risk';
        } else {
            level = 'needs-improvement';
            riskLevel = 'fail';
        }

        // Calculate pass/fail prediction
        const passFailPrediction = this.calculatePassFailPrediction(
            rawAvg, thresholds, subjectPredictions, poorSubjects.length, 
            atRiskSubjects.length, safeSubjects.length
        );

        // Generate recommendations
        const recommendations = this.generateRecommendations(scores, maxGrade, thresholds, poorSubjects, atRiskSubjects, safeSubjects);

        return { 
            level, 
            score: avg, 
            recommendations, 
            riskLevel, 
            rawAvg, 
            maxGrade,
            thresholds,
            subjectTrends,
            improvingSubjects,
            decliningSubjects,
            inconsistentSubjects,
            poorSubjects,
            atRiskSubjects,
            safeSubjects,
            passFailPrediction,
            subjectPredictions
        };
    }

    predictSubjectGrades(subjectGrades, trendAnalysis, maxGrade) {
        const periods = ['month1', 'month2', 'midterm', 'month3', 'month4', 'final'];
        const periodNames = {
            'month1': 'شهر أول',
            'month2': 'شهر ثاني', 
            'midterm': 'نصف السنة',
            'month3': 'شهر ثالث',
            'month4': 'شهر رابع',
            'final': 'نهائي'
        };
        
        const existingGrades = {};
        const missingPeriods = [];
        
        periods.forEach(period => {
            const grade = parseInt(subjectGrades[period]) || 0;
            if (grade > 0) {
                existingGrades[period] = grade;
            } else {
                missingPeriods.push(period);
            }
        });

        if (missingPeriods.length === 0) {
            return {
                currentAverage: trendAnalysis.avgGrade || 0,
                predictedAverage: trendAnalysis.avgGrade || 0,
                missingPeriods: [],
                forecast: {}
            };
        }

        let predictedGrade = trendAnalysis.latestGrade || trendAnalysis.avgGrade || (maxGrade * 0.6);
        
        if (trendAnalysis.trend === 'improving') {
            predictedGrade = Math.min(maxGrade, predictedGrade * 1.05);
        } else if (trendAnalysis.trend === 'declining') {
            predictedGrade = Math.max(0, predictedGrade * 0.95);
        }

        const forecast = {};
        missingPeriods.forEach(period => {
            const variation = (Math.random() - 0.5) * (maxGrade * 0.1);
            let periodPrediction = Math.round(Math.max(0, Math.min(maxGrade, predictedGrade + variation)));
            
            if (trendAnalysis.trend === 'improving' && periodPrediction < maxGrade * 0.5) {
                periodPrediction = Math.round(maxGrade * 0.55);
            }
            
            forecast[period] = {
                grade: periodPrediction,
                periodName: periodNames[period]
            };
        });

        let totalPredicted = Object.values(existingGrades).reduce((a, b) => a + b, 0);
        Object.values(forecast).forEach(f => totalPredicted += f.grade);
        const predictedAverage = Math.round(totalPredicted / periods.length);

        return {
            currentAverage: trendAnalysis.avgGrade || 0,
            predictedAverage: predictedAverage,
            missingPeriods: missingPeriods,
            forecast: forecast
        };
    }

    calculatePassFailPrediction(rawAvg, thresholds, subjectPredictions, poorCount, atRiskCount, safeCount) {
        const totalSubjects = poorCount + atRiskCount + safeCount;
        if (totalSubjects === 0) return { status: 'غير محدد', confidence: 0, message: 'لا توجد بيانات كافية' };

        const poorWeight = poorCount * 0;
        const atRiskWeight = atRiskCount * 0.5;
        const safeWeight = safeCount * 1;
        const passProbability = (poorWeight + atRiskWeight + safeWeight) / totalSubjects;

        let subjectsPredictedToPass = 0;
        let subjectsPredictedToFail = 0;
        
        for (const subject in subjectPredictions) {
            const pred = subjectPredictions[subject];
            if (pred.predictedAverage >= thresholds.passThreshold) {
                subjectsPredictedToPass++;
            } else {
                subjectsPredictedToFail++;
            }
        }

        let status, confidence, message, icon;
        
        if (rawAvg >= thresholds.safeThreshold) {
            status = 'ناجح';
            confidence = 95;
            message = 'أداء متميز - المتوقع النجاح بدرجات عالية';
            icon = '✅';
        } else if (rawAvg >= thresholds.passThreshold) {
            if (subjectsPredictedToFail === 0) {
                status = 'ناجح';
                confidence = 80;
                message = 'على المسار الصحيح - المتوقع النجاح';
                icon = '✅';
            } else {
                status = 'ناجح بصعوبة';
                confidence = 65;
                message = 'على حدود النجاح - يحتاج مزيد من الجهد';
                icon = '⚠️';
            }
        } else {
            const improving = Object.values(subjectPredictions).some(p => p.predictedAverage > rawAvg);
            if (improving) {
                status = 'راسب (قابل للتحسن)';
                confidence = 40;
                message = 'حالياً راسب لكن التحسن ممكن بالاجتهاد';
                icon = '⚠️';
            } else {
                status = 'راسب';
                confidence = 85;
                message = 'تحذير: المتوقع الرسوب بدون تدخل عاجل';
                icon = '❌';
            }
        }

        return {
            status,
            confidence,
            message,
            icon,
            passProbability: Math.round(passProbability * 100),
            subjectsPredictedToPass,
            subjectsPredictedToFail
        };
    }

    getMaxGradeForStudent(studentGrade) {
        if (!studentGrade) return 100;
        
        const gradeParts = studentGrade.split(' - ');
        if (gradeParts.length < 2) return 100;
        
        const educationalLevel = gradeParts[0].trim();
        const gradeLevel = gradeParts[1].trim();
        
        const isElementary = educationalLevel.includes('ابتدائي') || 
                             gradeLevel.includes('ابتدائي') || 
                             gradeLevel.includes('الابتدائي');
        
        if (isElementary) {
            const isGrades1to4 = gradeLevel.includes('الأول') || gradeLevel.includes('الثاني') || 
                                 gradeLevel.includes('الثالث') || gradeLevel.includes('الرابع') ||
                                 gradeLevel.includes('اول') || gradeLevel.includes('ثاني') || 
                                 gradeLevel.includes('ثالث') || gradeLevel.includes('رابع') ||
                                 gradeLevel.includes('الاول');
            
            const isGrades5or6 = gradeLevel.includes('الخامس') || gradeLevel.includes('السادس') ||
                                 gradeLevel.includes('خامس') || gradeLevel.includes('سادس');
            
            if (isGrades1to4 && !isGrades5or6) {
                return 10;
            }
        }
        
        return 100;
    }

    getThresholds(maxGrade) {
        if (maxGrade === 10) {
            return {
                maxGrade: 10,
                passThreshold: 5,
                safeThreshold: 7
            };
        } else {
            return {
                maxGrade: 100,
                passThreshold: 50,
                safeThreshold: 70
            };
        }
    }

    generateRecommendations(scores, maxGrade, thresholds, poorSubjects, atRiskSubjects, safeSubjects) {
        // Use the same professional card-based layout as school dashboard
        const totalSubjects = poorSubjects.length + atRiskSubjects.length + safeSubjects.length;
        if (totalSubjects === 0) {
            return '<div class="academic-guidance"><div class="guidance-card"><p>لا توجد بيانات كافية للتوصيات</p></div></div>';
        }
            
        // Calculate overall average
        let totalGrades = 0;
        let gradeCount = 0;
        for (const subject in scores) {
            for (const period in scores[subject]) {
                const grade = parseInt(scores[subject][period]) || 0;
                if (grade > 0) {
                    totalGrades += grade;
                    gradeCount++;
                }
            }
        }
        const avg = gradeCount > 0 ? totalGrades / gradeCount : 0;
        const percentage = (avg / maxGrade) * 100;
            
        // Determine performance level
        let perfLevel, perfLabel, perfIcon, perfColor, perfBgColor;
        if (percentage >= 90) {
            perfLevel = 'excellent'; perfLabel = 'متميز'; perfIcon = 'fa-star'; perfColor = '#10b981'; perfBgColor = '#d1fae5';
        } else if (percentage >= 80) {
            perfLevel = 'very-good'; perfLabel = 'جيد جداً'; perfIcon = 'fa-star-half-alt'; perfColor = '#3b82f6'; perfBgColor = '#dbeafe';
        } else if (percentage >= 70) {
            perfLevel = 'good'; perfLabel = 'جيد'; perfIcon = 'fa-check-circle'; perfColor = '#22c55e'; perfBgColor = '#dcfce7';
        } else if (percentage >= 60) {
            perfLevel = 'satisfactory'; perfLabel = 'مقبول'; perfIcon = 'fa-exclamation-circle'; perfColor = '#f59e0b'; perfBgColor = '#fef3c7';
        } else if (percentage >= 50) {
            perfLevel = 'at-risk'; perfLabel = 'يحتاج متابعة'; perfIcon = 'fa-exclamation-triangle'; perfColor = '#f97316'; perfBgColor = '#ffedd5';
        } else {
            perfLevel = 'critical'; perfLabel = 'تدخل عاجل'; perfIcon = 'fa-times-circle'; perfColor = '#ef4444'; perfBgColor = '#fee2e2';
        }
            
        // Build strengths list (max 2)
        let strengthsHTML = '';
        if (safeSubjects.length > 0) {
            const topSafe = safeSubjects.slice(0, 2);
            strengthsHTML = topSafe.map(s => `
                <li>
                    <span class="subject-name">${escapeHtml(s.name)}</span>
                    <span class="subject-detail">${s.avg.toFixed(1)}/${maxGrade}</span>
                </li>
            `).join('');
        } else if (atRiskSubjects.length === 0 && poorSubjects.length === 0) {
            strengthsHTML = '<li><span class="subject-name">جاري التقييم</span></li>';
        }
            
        // Build improvements list (max 2)
        let improvementsHTML = '';
        const needsHelp = [...poorSubjects, ...atRiskSubjects].slice(0, 2);
        if (needsHelp.length > 0) {
            improvementsHTML = needsHelp.map(s => `
                <li>
                    <span class="subject-name">${escapeHtml(s.name)}</span>
                    <span class="priority-badge">${s.avg < thresholds.passThreshold ? 'عاجل' : 'متوسط'}</span>
                    <span class="subject-detail">${s.avg.toFixed(1)}/${maxGrade}</span>
                </li>
            `).join('');
        } else {
            improvementsHTML = '<li><span class="subject-name">لا توجد</span><span class="subject-detail">أداء جيد</span></li>';
        }
            
        // Build actions list (max 2)
        let actionsHTML = '';
        if (perfLevel === 'critical' || perfLevel === 'at-risk') {
            actionsHTML = `
                <li><i class="fas fa-chevron-left"></i>جدول دراسي مكثف</li>
                <li><i class="fas fa-chevron-left"></i>حضور دروس التقوية</li>
            `;
        } else if (perfLevel === 'satisfactory') {
            actionsHTML = `
                <li><i class="fas fa-chevron-left"></i>زيادة وقت المراجعة</li>
                <li><i class="fas fa-chevron-left"></i>التركيز على المفاهيم</li>
            `;
        } else {
            actionsHTML = `
                <li><i class="fas fa-chevron-left"></i>الاستمرار في التفوق</li>
                <li><i class="fas fa-chevron-left"></i>توسيع المعرفة</li>
            `;
        }
            
        // Generate professional HTML
        return `
            <div class="academic-guidance">
                <!-- Performance Summary Card -->
                <div class="guidance-card performance-card" style="background: ${perfBgColor}; border-right: 4px solid ${perfColor};">
                    <div class="card-header">
                        <i class="fas ${perfIcon}" style="color: ${perfColor};"></i>
                        <span class="performance-label" style="color: ${perfColor};">${perfLabel}</span>
                    </div>
                    <div class="card-content">
                        <span class="performance-value">${avg.toFixed(1)}/${maxGrade}</span>
                        <span class="performance-percentage">(${percentage.toFixed(0)}%)</span>
                    </div>
                </div>
    
                <div class="guidance-grid">
                    <!-- Strengths Card -->
                    <div class="guidance-card strengths-card">
                        <div class="card-title">
                            <i class="fas fa-thumbs-up"></i>
                            نقاط القوة
                        </div>
                        <ul class="guidance-list">${strengthsHTML}</ul>
                    </div>
    
                    <!-- Improvements Card -->
                    <div class="guidance-card improvements-card">
                        <div class="card-title">
                            <i class="fas fa-bullseye"></i>
                            مجالات التطوير
                        </div>
                        <ul class="guidance-list">${improvementsHTML}</ul>
                    </div>
    
                    <!-- Action Plan Card -->
                    <div class="guidance-card actions-card">
                        <div class="card-title">
                            <i class="fas fa-tasks"></i>
                            خطة العمل
                        </div>
                        <ul class="guidance-list action-list">${actionsHTML}</ul>
                    </div>
                </div>
            </div>
        `;
    }
}

// Show performance insights for a specific student when the chart icon is clicked
function showStudentPerformanceInsights(studentId, studentGrade, subjectName) {
    // Get the student's grades
    const studentGrades = currentSubjectGrades[subjectName]?.[studentId] || {
        month1: 0, month2: 0, midterm: 0, month3: 0, month4: 0, final: 0
    };
    
    // Create a grades object for the prediction model
    const gradesObj = {};
    gradesObj[subjectName] = studentGrades;
    
    // Update the insights display
    const model = new TeacherPerformanceModel();
    const prediction = model.predictPerformance(gradesObj, studentGrade);
    
    // Show the insights container
    const insightsContainer = document.getElementById('teacherPerformanceInsights');
    if (insightsContainer) {
        insightsContainer.style.display = 'block';
        // Scroll to insights
        insightsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Update main insight cards
    const avgGradeEl = document.getElementById('teacherStudentAvgGrade');
    const performanceEl = document.getElementById('teacherStudentPerformancePrediction');
    const passFailEl = document.getElementById('teacherPassFailPrediction');
    const recommendationsEl = document.getElementById('teacherStudentRecommendations');
    
    if (avgGradeEl) {
        avgGradeEl.textContent = `${prediction.rawAvg.toFixed(1)}/${prediction.maxGrade}`;
    }
    
    if (performanceEl) {
        const levelText = {
            'excellent': 'ممتاز',
            'good': 'جيد',
            'average': 'متوسط',
            'needs-improvement': 'يحتاج تحسين'
        };
        performanceEl.textContent = levelText[prediction.level] || prediction.level;
        performanceEl.style.color = prediction.riskLevel === 'safe' ? '#22c55e' : 
                                    prediction.riskLevel === 'at-risk' ? '#f59e0b' : '#ef4444';
    }
    
    if (passFailEl) {
        passFailEl.textContent = `${prediction.passFailPrediction.icon} ${prediction.passFailPrediction.status}`;
        passFailEl.style.color = prediction.passFailPrediction.status.includes('ناجح') ? '#22c55e' : '#ef4444';
    }
    
    if (recommendationsEl) {
        recommendationsEl.innerHTML = prediction.recommendations;
    }
    
    // Show prediction details
    const predictionDetailsBox = document.getElementById('teacherPredictionDetailsBox');
    const predictionMessage = document.getElementById('teacherPredictionMessage');
    const predictionConfidence = document.getElementById('teacherPredictionConfidence');
    
    if (predictionDetailsBox && predictionMessage && predictionConfidence) {
        predictionDetailsBox.style.display = 'block';
        predictionMessage.textContent = prediction.passFailPrediction.message;
        predictionConfidence.textContent = `نسبة الثقة: ${prediction.passFailPrediction.confidence}%`;
        
        // Update border color based on status
        if (prediction.passFailPrediction.status.includes('ناجح')) {
            predictionDetailsBox.style.borderRightColor = '#28a745';
        } else if (prediction.passFailPrediction.status.includes('راسب')) {
            predictionDetailsBox.style.borderRightColor = '#dc3545';
        } else {
            predictionDetailsBox.style.borderRightColor = '#ffc107';
        }
    }
    
    // Display forecasted grades
    const forecastSection = document.getElementById('teacherForecastSection');
    const forecastContainer = document.getElementById('teacherForecastContainer');
    
    if (forecastSection && forecastContainer) {
        let hasForecasts = false;
        let forecastHTML = '';
        
        for (const subject in prediction.subjectPredictions) {
            const pred = prediction.subjectPredictions[subject];
            if (pred.missingPeriods.length > 0) {
                hasForecasts = true;
                forecastHTML += `
                    <div style="background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h4 style="margin: 0 0 0.5rem 0; color: var(--brand-primary-700);">${subject}</h4>
                        <div style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
                            المتوسط الحالي: ${pred.currentAverage.toFixed(1)}/${prediction.maxGrade}
                        </div>
                        <div style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
                            المتوسط المتوقع: ${pred.predictedAverage}/${prediction.maxGrade}
                        </div>
                        <div style="margin-top: 0.5rem;">
                `;
                
                for (const period in pred.forecast) {
                    const forecast = pred.forecast[period];
                    forecastHTML += `
                        <div style="display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid #eee;">
                            <span>${escapeHtml(forecast.periodName)}:</span>
                            <span style="font-weight: 600; color: var(--brand-primary-600);">${forecast.grade}/${prediction.maxGrade}</span>
                        </div>
                    `;
                }
                
                forecastHTML += '</div></div>';
            }
        }
        
        if (hasForecasts) {
            forecastSection.style.display = 'block';
            forecastContainer.innerHTML = forecastHTML;
        } else {
            forecastSection.style.display = 'none';
        }
    }
}

// Display performance insights for a student in the teacher portal
function displayTeacherPerformanceInsights(studentId, studentGrade) {
    const insightsContainer = document.getElementById('teacherPerformanceInsights');
    if (!insightsContainer) return;
    
    // Get the student's grades from currentSubjectGrades
    let studentGrades = {};
    const subjectName = document.getElementById('gradesSubjectName').textContent;
    
    // Try to get grades from the current subject
    if (currentSubjectGrades[subjectName] && currentSubjectGrades[subjectName][studentId]) {
        // Create a single-subject grade object for prediction
        studentGrades[subjectName] = currentSubjectGrades[subjectName][studentId];
    }
    
    // If no grades available, hide insights
    if (Object.keys(studentGrades).length === 0) {
        insightsContainer.style.display = 'none';
        return;
    }
    
    const model = new TeacherPerformanceModel();
    const prediction = model.predictPerformance(studentGrades, studentGrade);
    
    // Update main insight cards
    const avgGradeEl = document.getElementById('teacherStudentAvgGrade');
    const performanceEl = document.getElementById('teacherStudentPerformancePrediction');
    const passFailEl = document.getElementById('teacherPassFailPrediction');
    const recommendationsEl = document.getElementById('teacherStudentRecommendations');
    
    if (avgGradeEl) {
        avgGradeEl.textContent = `${prediction.rawAvg.toFixed(1)}/${prediction.maxGrade}`;
    }
    
    if (performanceEl) {
        const levelText = {
            'excellent': 'ممتاز',
            'good': 'جيد',
            'average': 'متوسط',
            'needs-improvement': 'يحتاج تحسين'
        };
        performanceEl.textContent = levelText[prediction.level] || prediction.level;
        performanceEl.style.color = prediction.riskLevel === 'safe' ? '#22c55e' : 
                                    prediction.riskLevel === 'at-risk' ? '#f59e0b' : '#ef4444';
    }
    
    if (passFailEl) {
        passFailEl.textContent = `${prediction.passFailPrediction.icon} ${prediction.passFailPrediction.status}`;
        passFailEl.style.color = prediction.passFailPrediction.status.includes('ناجح') ? '#22c55e' : '#ef4444';
    }
    
    if (recommendationsEl) {
        recommendationsEl.innerHTML = prediction.recommendations;
    }
    
    // Show prediction details
    const predictionDetailsBox = document.getElementById('teacherPredictionDetailsBox');
    const predictionMessage = document.getElementById('teacherPredictionMessage');
    const predictionConfidence = document.getElementById('teacherPredictionConfidence');
    
    if (predictionDetailsBox && predictionMessage && predictionConfidence) {
        predictionDetailsBox.style.display = 'block';
        predictionMessage.textContent = prediction.passFailPrediction.message;
        predictionConfidence.textContent = `نسبة الثقة: ${prediction.passFailPrediction.confidence}%`;
        
        // Update border color based on status
        if (prediction.passFailPrediction.status.includes('ناجح')) {
            predictionDetailsBox.style.borderRightColor = '#28a745';
        } else if (prediction.passFailPrediction.status.includes('راسب')) {
            predictionDetailsBox.style.borderRightColor = '#dc3545';
        } else {
            predictionDetailsBox.style.borderRightColor = '#ffc107';
        }
    }
    
    // Display forecasted grades
    const forecastSection = document.getElementById('teacherForecastSection');
    const forecastContainer = document.getElementById('teacherForecastContainer');
    
    if (forecastSection && forecastContainer) {
        let hasForecasts = false;
        let forecastHTML = '';
        
        for (const subject in prediction.subjectPredictions) {
            const pred = prediction.subjectPredictions[subject];
            if (pred.missingPeriods.length > 0) {
                hasForecasts = true;
                forecastHTML += `
                    <div style="background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h4 style="margin: 0 0 0.5rem 0; color: var(--brand-primary-700);">${subject}</h4>
                        <div style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
                            المتوسط الحالي: ${pred.currentAverage.toFixed(1)}/${prediction.maxGrade}
                        </div>
                        <div style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
                            المتوسط المتوقع: ${pred.predictedAverage}/${prediction.maxGrade}
                        </div>
                        <div style="margin-top: 0.5rem;">
                `;
                
                for (const period in pred.forecast) {
                    const forecast = pred.forecast[period];
                    forecastHTML += `
                        <div style="display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid #eee;">
                            <span>${escapeHtml(forecast.periodName)}:</span>
                            <span style="font-weight: 600; color: var(--brand-primary-600);">${forecast.grade}/${prediction.maxGrade}</span>
                        </div>
                    `;
                }
                
                forecastHTML += '</div></div>';
            }
        }
        
        if (hasForecasts) {
            forecastSection.style.display = 'block';
            forecastContainer.innerHTML = forecastHTML;
        } else {
            forecastSection.style.display = 'none';
        }
    }
    
    // Show the insights container
    insightsContainer.style.display = 'block';
}

// Check if teacher is already logged in
document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('teacher_token');
    const teacherData = localStorage.getItem('teacher');
    
    if (token && teacherData) {
        try {
            currentTeacher = JSON.parse(teacherData);
            window.currentTeacher = currentTeacher; // Expose globally
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('portalScreen').style.display = 'block';
            initializePortal();
        } catch (error) {
            console.error('Error parsing teacher data:', error);
            localStorage.removeItem('teacher_token');
            localStorage.removeItem('teacher');
        }
    }
});

