// assets/js/admin.js

// متغيرات عامة
let schools = [];
let allAcademicYears = [];
let currentAcademicYearName = '';

// Helper function to get auth headers
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

// Mapping between stages and educational levels
const stageToLevelMapping = {
    "ابتدائي": "ابتدائي",
    "متوسط": "متوسطة",
    "ثانوي": "ثانوية",
    "إعدادي": "إعدادية"
};

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', () => {
    fetchSchools();
    setupEventListeners();
    setupStageLevelMapping();
    loadCurrentAcademicYear();
    loadAllAcademicYears();
});

// Add manual refresh function for debugging
function refreshSchoolsList() {
    console.log('Manual refresh triggered');
    fetchSchools();
}

// Add this to window for debugging
window.refreshSchoolsList = refreshSchoolsList;
window.debugInfo = function() {
    console.log('Current schools:', schools);
    console.log('Table body element:', document.getElementById('schoolsTableBody'));
};

// Setup stage to level mapping
function setupStageLevelMapping() {
    const stageSelect = document.getElementById('stageSelect');
    
    if (stageSelect) {
        stageSelect.addEventListener('change', function() {
            // The mapping is handled automatically on the server side now
        });
    }
}

// إعداد الأحداث
function setupEventListeners() {
    document.getElementById('addSchoolForm')?.addEventListener('submit', addSchool);
}

// جلب قائمة المدارس
async function fetchSchools() {
    try {
        console.log('Fetching schools from API...');
        const response = await fetch('/api/schools', { headers: getAuthHeaders() });
        console.log('API Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        console.log('API Response text:', text);
        
        // Try to parse JSON
        let result;
        try {
            result = JSON.parse(text);
        } catch (parseError) {
            console.error('JSON parsing error:', parseError);
            console.error('Response text:', text);
            throw new Error('Invalid JSON response from server');
        }
        
        console.log('API Response:', result); // Debug: Log API response
        
        if (result && result.success && Array.isArray(result.schools)) {
            schools = result.schools;
        } else {
            console.warn('Invalid response format, using empty array');
            schools = [];
        }
        
        console.log('Schools array:', schools); // Debug: Log schools array
        renderSchoolsTable();
    } catch (error) {
        console.error('Error fetching schools:', error);
        alert('حدث خطأ في جلب بيانات المدارس: ' + error.message);
    }
}

// عرض جدول المدارس
function renderSchoolsTable() {
    console.log('Rendering schools table...');
    const tbody = document.getElementById('schoolsTableBody');
    console.log('Table body element:', tbody);
    
    if (!tbody) {
        console.error('Table body element not found!');
        return;
    }

    // Debug: Log schools data
    console.log('Rendering schools:', schools);

    // Check if schools is an array
    if (!Array.isArray(schools)) {
        console.error('Schools is not an array:', schools);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">لا توجد مدارس مسجلة</td></tr>';
        return;
    }

    if (schools.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">لا توجد مدارس مسجلة</td></tr>';
        return;
    }

    tbody.innerHTML = schools.map((school, index) => `
        <tr data-id="${school.id}">
            <td>${index + 1}</td>
            <td>
                <input type="text" class="edit-name" value="${school.name || ''}" 
                       onchange="updateSchoolField(${school.id}, 'name', this.value)">
            </td>
            <td><code class="code-btn" onclick="copyToClipboard('${escapeHtml(school.code)}')">${school.code || ''}</code></td>
            <td>
                <select class="edit-study-type" onchange="updateSchoolField(${school.id}, 'study_type', this.value)">
                    <option value="صباحي" ${school.study_type === 'صباحي' ? 'selected' : ''}>صباحي</option>
                    <option value="مسائي" ${school.study_type === 'مسائي' ? 'selected' : ''}>مسائي</option>
                </select>
            </td>
            <td>
                <select class="edit-stage" onchange="updateSchoolStage(${school.id}, this.value)">
                    <option value="ابتدائي" ${school.level === 'ابتدائي' ? 'selected' : ''}>ابتدائي</option>
                    <option value="متوسط" ${school.level === 'متوسطة' ? 'selected' : ''}>متوسط</option>
                    <option value="ثانوي" ${school.level === 'ثانوية' ? 'selected' : ''}>ثانوي</option>
                    <option value="إعدادي" ${school.level === 'إعدادية' ? 'selected' : ''}>إعدادي</option>
                </select>
            </td>
            <td>
                <select class="edit-gender-type" onchange="updateSchoolField(${school.id}, 'gender_type', this.value)">
                    <option value="بنين" ${school.gender_type === 'بنين' ? 'selected' : ''}>بنين</option>
                    <option value="بنات" ${school.gender_type === 'بنات' ? 'selected' : ''}>بنات</option>
                    <option value="مختلطة" ${school.gender_type === 'مختلطة' ? 'selected' : ''}>مختلطة</option>
                </select>
            </td>
            <td>
                <button class="action-btn btn-info" onclick="openGradeLevelsModal(${school.id}, '${escapeHtml(school.name)}')" title="إدارة المستويات">
                    <i class="fas fa-layer-group"></i>
                </button>
            </td>
            <td>
                <button class="action-btn btn-save" onclick="saveSchool(${school.id})">
                    <i class="fas fa-save"></i>
                </button>
                <button class="action-btn btn-delete" onclick="deleteSchool(${school.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// إضافة مدرسة جديدة
async function addSchool(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    // Get the stage directly
    const schoolData = {
        name: formData.get('name'),
        study_type: formData.get('study_type'),
        level: formData.get('stage'), // Use the stage directly as the level
        gender_type: formData.get('gender_type')
    };
    
    // Validate that stage is set
    if (!schoolData.level) {
        alert('الرجاء اختيار مرحلة');
        return;
    }
    
    try {
        const response = await fetch('/api/schools', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(schoolData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            e.target.reset();
            fetchSchools();
            // Add null check for result and result.school
            const schoolCode = result && result.school ? result.school.code : 'غير متوفر';
            showNotification(`تم إضافة المدرسة بنجاح! رمز المدرسة: <code class="code-btn" onclick="copyToClipboard('${schoolCode}')">${schoolCode}</code>`, 'success');
        } else {
            alert(result.error || 'حدث خطأ في إضافة المدرسة');
        }
    } catch (error) {
        console.error('Error adding school:', error);
        alert('حدث خطأ في الاتصال بالخادم');
    }
}

// تحديث حقل في المدرسة
async function updateSchoolField(id, field, value) {
    const school = schools.find(s => s.id === id);
    if (school) {
        school[field] = value;
    }
}

// تحديث مرحلة المدرسة
async function updateSchoolStage(id, stage) {
    const school = schools.find(s => s.id === id);
    if (school) {
        // Use the stage directly as the level
        school.level = stage;
        
        // Save the changes
        await saveSchool(id);
    }
}

// حفظ تغييرات المدرسة
async function saveSchool(id) {
    const school = schools.find(s => s.id === id);
    if (!school) return;

    try {
        const response = await fetch(`/api/schools/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(school)
        });

        const result = await response.json();
        
        if (response.ok) {
            showNotification(`تم تحديث المدرسة بنجاح! رمز المدرسة: <code class="code-btn" onclick="copyToClipboard('${escapeHtml(school.code)}')">${escapeHtml(school.code)}</code>`, 'success');
        } else {
            alert(result.error || 'حدث خطأ في تحديث المدرسة');
        }
    } catch (error) {
        console.error('Error saving school:', error);
        alert('حدث خطأ في الاتصال بالخادم');
    }
}

// حذف مدرسة
async function deleteSchool(id) {
    if (!confirm('هل أنت متأكد من حذف هذه المدرسة وجميع طلابها؟')) return;

    try {
        const response = await fetch(`/api/schools/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        const result = await response.json();
        
        if (response.ok) {
            fetchSchools();
            showNotification('تم حذف المدرسة بنجاح', 'success');
        } else {
            alert(result.error || 'حدث خطأ في حذف المدرسة');
        }
    } catch (error) {
        console.error('Error deleting school:', error);
        alert('حدث خطأ في الاتصال بالخادم');
    }
}

// إشعارات
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000); // عرض لمدة 5 ثواني لقراءة الرمز
}

// دالة نسخ النص إلى الحافظة
function copyToClipboard(text) {
    // Always use fallback for compatibility
    fallbackCopy(text);
}

function fallbackCopy(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showNotification(`تم نسخ الرمز: ${text}`, 'info');
}

// دالة تصدير قائمة المدارس إلى Excel
function exportSchoolsToExcel() {
    if (!schools || schools.length === 0) {
        showNotification('لا توجد مدارس لتصديرها', 'error');
        return;
    }

    // Create workbook and worksheet
    const ws_data = [
        ['الرقم', 'الاسم', 'الرمز', 'نوع الدراسة', 'المرحلة', 'النوع']
    ];
    
    schools.forEach((school, index) => {
        ws_data.push([
            index + 1,
            school.name || '',
            school.code || '',
            school.study_type || '',
            school.level || '',
            school.gender_type || ''
        ]);
    });
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المدارس');
    
    // Export to Excel file
    XLSX.writeFile(wb, 'قائمة_المدارس.xlsx');
}

// تسجيل الخروج
function logout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    }
}

// إضافة مستمع الحدث لزر التصدير
document.addEventListener('DOMContentLoaded', function() {
    const exportBtn = document.getElementById('exportSchoolsBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportSchoolsToExcel);
    }
});

// Default grade levels for bulk adding
const defaultGradeLevels = {
    "ابتدائي": [
        "الأول الابتدائي", "الثاني الابتدائي", "الثالث الابتدائي",
        "الرابع الابتدائي", "الخامس الابتدائي", "السادس الابتدائي"
    ],
    "متوسط": [
        "الأول المتوسط", "الثاني المتوسط", "الثالث المتوسط"
    ],
    "إعدادي": [
        "الرابع الأدبي", "الخامس الأدبي", "السادس الأدبي",
        "الرابع العلمي", "الخامس العلمي", "السادس العلمي"
    ],
    "ثانوي": [
        "الأول المتوسط", "الثاني المتوسط", "الثالث المتوسط",
        "الرابع الأدبي", "الخامس الأدبي", "السادس الأدبي",
        "الرابع العلمي", "الخامس العلمي", "السادس العلمي"
    ]
};

// Current school for grade levels modal
let currentGradeLevelsSchoolId = null;

// Open grade levels management modal
async function openGradeLevelsModal(schoolId, schoolName) {
    currentGradeLevelsSchoolId = schoolId;
    
    // Fetch grade levels for this school
    let gradeLevels = [];
    try {
        const response = await fetch(`/api/school/${schoolId}/grade-levels`, { headers: getAuthHeaders() });
        const result = await response.json();
        if (result.success) {
            gradeLevels = result.grade_levels || [];
        }
    } catch (error) {
        console.error('Error fetching grade levels:', error);
    }
    
    // Create modal HTML
    const modalHtml = `
        <div id="gradeLevelsModal" class="modal" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
            <div class="modal-content" style="background: white; padding: 2rem; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0;"><i class="fas fa-layer-group"></i> إدارة المستويات الدراسية - ${schoolName}</h3>
                    <button onclick="closeGradeLevelsModal()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
                </div>
                
                <!-- Add new grade level form -->
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f5f5f5; border-radius: 8px;">
                    <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-plus"></i> إضافة مستوى جديد</h4>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="newGradeLevelInput" class="form-input" placeholder="اسم المستوى الدراسي" style="flex: 1;">
                        <button onclick="addGradeLevelFromModal()" class="btn-admin-dashboard btn-primary">
                            <i class="fas fa-plus"></i> إضافة
                        </button>
                    </div>
                </div>
                
                <!-- Quick add templates -->
                <div style="margin-bottom: 1.5rem;">
                    <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-magic"></i> إضافة سريعة من القوالب</h4>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button onclick="addBulkGradeLevels('ابتدائي')" class="action-btn" style="padding: 0.5rem 1rem;">ابتدائي</button>
                        <button onclick="addBulkGradeLevels('متوسط')" class="action-btn" style="padding: 0.5rem 1rem;">متوسط</button>
                        <button onclick="addBulkGradeLevels('إعدادي')" class="action-btn" style="padding: 0.5rem 1rem;">إعدادي</button>
                        <button onclick="addBulkGradeLevels('ثانوي')" class="action-btn" style="padding: 0.5rem 1rem;">ثانوي</button>
                    </div>
                </div>
                
                <!-- Existing grade levels -->
                <div>
                    <h4 style="margin-bottom: 0.5rem;"><i class="fas fa-list"></i> المستويات الحالية (${gradeLevels.length})</h4>
                    <div id="gradeLevelsList" style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                        ${gradeLevels.length === 0 ? 
                            '<div style="padding: 2rem; text-align: center; color: #666;"><i class="fas fa-info-circle"></i> لا توجد مستويات دراسية معرفة</div>' :
                            gradeLevels.map((gl, index) => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; ${index % 2 === 0 ? 'background: #fafafa;' : ''}">
                                    <span><i class="fas fa-graduation-cap"></i> ${escapeHtml(gl.name)}</span>
                                    <button onclick="deleteGradeLevelFromModal(${gl.id})" class="action-btn btn-delete" title="حذف">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('gradeLevelsModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeGradeLevelsModal() {
    const modal = document.getElementById('gradeLevelsModal');
    if (modal) modal.remove();
    currentGradeLevelsSchoolId = null;
}

async function addGradeLevelFromModal() {
    if (!currentGradeLevelsSchoolId) return;
    
    const input = document.getElementById('newGradeLevelInput');
    const name = input.value.trim();
    
    if (!name) {
        showNotification('يرجى إدخال اسم المستوى الدراسي', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/school/${currentGradeLevelsSchoolId}/grade-level`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ name, display_order: 0 })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('تم إضافة المستوى الدراسي بنجاح', 'success');
            // Refresh the modal
            const school = schools.find(s => s.id === currentGradeLevelsSchoolId);
            if (school) {
                openGradeLevelsModal(currentGradeLevelsSchoolId, school.name);
            }
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ', 'error');
        }
    } catch (error) {
        console.error('Error adding grade level:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

async function addBulkGradeLevels(levelType) {
    if (!currentGradeLevelsSchoolId) return;
    
    const defaults = defaultGradeLevels[levelType];
    if (!defaults || defaults.length === 0) {
        showNotification('لا توجد قوالب لهذا النوع', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/school/${currentGradeLevelsSchoolId}/grade-levels/bulk`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ grade_levels: defaults })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(result.message || 'تم إضافة المستويات الدراسية بنجاح', 'success');
            // Refresh the modal
            const school = schools.find(s => s.id === currentGradeLevelsSchoolId);
            if (school) {
                openGradeLevelsModal(currentGradeLevelsSchoolId, school.name);
            }
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ', 'error');
        }
    } catch (error) {
        console.error('Error adding bulk grade levels:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

async function deleteGradeLevelFromModal(gradeLevelId) {
    if (!confirm('هل أنت متأكد من حذف هذا المستوى الدراسي؟')) return;
    
    try {
        const response = await fetch(`/api/grade-level/${gradeLevelId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('تم حذف المستوى الدراسي بنجاح', 'success');
            // Refresh the modal
            const school = schools.find(s => s.id === currentGradeLevelsSchoolId);
            if (school) {
                openGradeLevelsModal(currentGradeLevelsSchoolId, school.name);
            }
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ', 'error');
        }
    } catch (error) {
        console.error('Error deleting grade level:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// ============================================================================
// ACADEMIC YEAR MANAGEMENT FUNCTIONS
// ============================================================================

// Load current academic year display
async function loadCurrentAcademicYear() {
    try {
        const response = await fetch('/api/academic-year/current');
        const result = await response.json();
        
        if (result.success) {
            currentAcademicYearName = result.academic_year_name || result.current_academic_year?.name;
            document.getElementById('currentAcademicYearDisplay').textContent = currentAcademicYearName;
        } else {
            document.getElementById('currentAcademicYearDisplay').textContent = 'غير محدد';
        }
    } catch (error) {
        console.error('Error loading current academic year:', error);
        document.getElementById('currentAcademicYearDisplay').textContent = 'خطأ';
    }
}

// Load all system-wide academic years (centralized management)
async function loadAllAcademicYears() {
    try {
        const summaryDiv = document.getElementById('academicYearsSummary');
        
        // Fetch system-wide academic years
        const response = await fetch('/api/system/academic-years', { headers: getAuthHeaders() });
        const result = await response.json();
        
        if (result.success && result.academic_years) {
            allAcademicYears = result.academic_years;
        } else {
            allAcademicYears = [];
        }
        
        // Update summary
        updateAcademicYearsSummary();
    } catch (error) {
        console.error('Error loading academic years:', error);
        document.getElementById('academicYearsSummary').innerHTML = `
            <p style="text-align: center; color: #dc3545;"><i class="fas fa-exclamation-triangle"></i> حدث خطأ في تحميل السنوات الدراسية</p>
        `;
    }
}

// Update academic years summary display
function updateAcademicYearsSummary() {
    const summaryDiv = document.getElementById('academicYearsSummary');
    
    if (allAcademicYears.length === 0) {
        summaryDiv.innerHTML = `
            <div style="text-align: center; color: #666;">
                <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 0.5rem;"></i>
                <p>لا توجد سنوات دراسية معرفة بعد</p>
                <p>اضغط على "إنشاء سنة دراسية" للبدء</p>
            </div>
        `;
        return;
    }
    
    summaryDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; text-align: center;">
            <div style="background: #e3f2fd; padding: 1rem; border-radius: 8px;">
                <div style="font-size: 2rem; font-weight: bold; color: #1976d2;">${allAcademicYears.length}</div>
                <div style="color: #666;">إجمالي السنوات</div>
            </div>
            <div style="background: #fff3e0; padding: 1rem; border-radius: 8px;">
                <div style="font-size: 2rem; font-weight: bold; color: #f57c00;">${schools.length}</div>
                <div style="color: #666;">مدارس في النظام</div>
            </div>
        </div>
        <p style="text-align: center; margin-top: 1rem; color: #666; font-size: 0.9rem;">
            <i class="fas fa-info-circle"></i> السنوات الدراسية مركزية وتطبق على جميع المدارس
        </p>
    `;
}

// Show modal with all academic years (centralized)
function showAllAcademicYearsModal() {
    const modal = document.getElementById('allAcademicYearsModal');
    const contentDiv = document.getElementById('allAcademicYearsContent');
    
    modal.style.display = 'flex';
    
    if (allAcademicYears.length === 0) {
        contentDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
                <i class="fas fa-calendar-times" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <p>لا توجد سنوات دراسية معرفة بعد</p>
                <button onclick="generateSystemYears()" class="btn-admin-dashboard btn-primary" style="margin-top: 1rem;">
                    <i class="fas fa-magic"></i> إنشاء سنوات تلقائياً
                </button>
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="margin-bottom: 1rem; padding: 0.75rem; background: #e3f2fd; border-radius: 8px;">
            <i class="fas fa-info-circle"></i> هذه السنوات الدراسية مركزية وتطبق على <strong>جميع المدارس</strong> في النظام
        </div>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f8f9fa;">
                    <th style="padding: 0.75rem; text-align: right; border-bottom: 2px solid #ddd;">السنة الدراسية</th>
                    <th style="padding: 0.75rem; text-align: center; border-bottom: 2px solid #ddd;">الإجراءات</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    allAcademicYears.forEach(year => {
        html += `
            <tr>
                <td style="padding: 0.75rem; border-bottom: 1px solid #eee;">
                    <i class="fas fa-calendar"></i> <strong>${escapeHtml(year.name)}</strong>
                </td>
                <td style="padding: 0.75rem; text-align: center; border-bottom: 1px solid #eee;">
                    <button onclick="deleteSystemAcademicYear(${year.id})" class="action-btn btn-delete" title="حذف"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    contentDiv.innerHTML = html;
}

function closeAllAcademicYearsModal() {
    document.getElementById('allAcademicYearsModal').style.display = 'none';
}

// Show create academic year modal (centralized - no school selection)
function showCreateAcademicYearModal() {
    console.log('showCreateAcademicYearModal() called');
    
    const modal = document.getElementById('createAcademicYearModal');
    if (!modal) {
        console.error('Create academic year modal not found!');
        showNotification('خطأ: لم يتم العثور على نموذج إنشاء السنة الدراسية', 'error');
        return;
    }
    
    console.log('Modal element found:', modal);
    
    // Hide the school select since it's now centralized
    const schoolSelectDiv = document.querySelector('#academicYearSchoolSelect')?.closest('.form-group-admin');
    if (schoolSelectDiv) {
        schoolSelectDiv.style.display = 'none';
        console.log('Hid school select div');
    }
    
    // Hide the "is current" checkbox since current year is now automatic
    const isCurrentDiv = document.getElementById('academicYearIsCurrent')?.closest('.form-group-admin');
    if (isCurrentDiv) {
        isCurrentDiv.style.display = 'none';
        console.log('Hid is current checkbox');
    }
    
    // Set default years based on current academic year (September-August cycle)
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    let startYear, endYear;
    if (currentMonth >= 9) {
        // September to December: current year to next year
        startYear = currentYear;
        endYear = currentYear + 1;
    } else {
        // January to August: previous year to current year
        startYear = currentYear - 1;
        endYear = currentYear;
    }
    
    const startInput = document.getElementById('academicYearStart');
    const endInput = document.getElementById('academicYearEnd');
    
    if (startInput) {
        startInput.value = startYear;
        console.log('Set start year:', startYear);
        
        // Add event listener to auto-calculate end year
        startInput.addEventListener('input', function() {
            const startVal = parseInt(this.value);
            if (!isNaN(startVal) && startVal >= 2020 && startVal <= 2050) {
                const calculatedEndYear = startVal + 1;
                if (endInput && calculatedEndYear >= 2021 && calculatedEndYear <= 2051) {
                    endInput.value = calculatedEndYear;
                }
            }
        });
    }
    
    if (endInput) {
        endInput.value = endYear;
        console.log('Set end year:', endYear);
        
        // Add event listener to validate end year
        endInput.addEventListener('input', function() {
            const endVal = parseInt(this.value);
            const startVal = startInput ? parseInt(startInput.value) : null;
            
            if (!isNaN(endVal) && !isNaN(startVal)) {
                if (endVal !== startVal + 1) {
                    this.setCustomValidity('سنة الانتهاء يجب أن تكون سنة البداية + 1');
                } else {
                    this.setCustomValidity('');
                }
            }
        });
    }
    
    modal.style.display = 'flex';
    console.log('Modal should now be visible');
    showNotification('تم فتح نموذج إنشاء السنة الدراسية', 'success');
}

function closeCreateAcademicYearModal() {
    document.getElementById('createAcademicYearModal').style.display = 'none';
}

// Create new system-wide academic year
async function createAcademicYear(e) {
    e.preventDefault();
    
    console.log('createAcademicYear() called');
    console.log('Event object:', e);
    console.log('Target element:', e.target);
    
    // Log form data
    const formData = new FormData(e.target);
    console.log('Form data entries:');
    for (let [key, value] of formData.entries()) {
        console.log(key, value);
    }
    
    const startInput = document.getElementById('academicYearStart');
    const endInput = document.getElementById('academicYearEnd');
    const schoolSelect = document.getElementById('academicYearSchoolSelect');
    
    console.log('Form elements found:');
    console.log('- Start input:', startInput);
    console.log('- End input:', endInput);
    console.log('- School select:', schoolSelect);
    
    if (!startInput || !endInput) {
        console.error('Academic year input fields not found!');
        showNotification('خطأ: لم يتم العثور على حقول إدخال السنة الدراسية', 'error');
        return;
    }
    
    const startYear = parseInt(startInput.value);
    const endYear = parseInt(endInput.value);
    const schoolId = schoolSelect ? schoolSelect.value : null;
    
    console.log('Values extracted:');
    console.log('- Start year:', startYear);
    console.log('- End year:', endYear);
    console.log('- School ID:', schoolId);
    
    // Validate required fields
    if (isNaN(startYear)) {
        showNotification('سنة البداية مطلوبة ويجب أن تكون رقماً', 'error');
        startInput.focus();
        return;
    }
    
    if (isNaN(endYear)) {
        showNotification('سنة الانتهاء مطلوبة ويجب أن تكون رقماً', 'error');
        endInput.focus();
        return;
    }
    
    console.log('Start year:', startYear, 'End year:', endYear);
    
    // Validate year ranges
    if (isNaN(startYear) || startYear < 2020 || startYear > 2050) {
        showNotification('سنة البداية يجب أن تكون بين 2020 و 2050', 'error');
        startInput.focus();
        return;
    }
    
    if (isNaN(endYear) || endYear < 2021 || endYear > 2051) {
        showNotification('سنة الانتهاء يجب أن تكون بين 2021 و 2051', 'error');
        endInput.focus();
        return;
    }
    
    // Validate that end year is exactly start year + 1
    if (endYear !== startYear + 1) {
        showNotification('سنة الانتهاء يجب أن تكون سنة البداية + 1 بالضبط', 'error');
        endInput.focus();
        return;
    }
    
    // Validate academic year name format
    const yearName = `${startYear}/${endYear}`;
    if (yearName.length !== 9 || yearName.indexOf('/') !== 4) {
        showNotification('تنسيق السنة الدراسية غير صحيح', 'error');
        return;
    }
    
    try {
        showNotification(`جارٍ إنشاء السنة الدراسية ${yearName}...`, 'info');
        
        console.log('Preparing API request...');
        console.log('- URL: /api/system/academic-year');
        console.log('- Method: POST');
        console.log('- Headers:', getAuthHeaders());
        console.log('- Body:', JSON.stringify({
            name: yearName,
            start_year: startYear,
            end_year: endYear
        }));
        
        const response = await fetch('/api/system/academic-year', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                name: yearName,
                start_year: startYear,
                end_year: endYear
                // Note: is_current is now automatic based on the current date
            })
        });
        
        console.log('API Response received:');
        console.log('- Status:', response.status);
        console.log('- Status Text:', response.statusText);
        console.log('- Headers:', [...response.headers.entries()]);
        
        const result = await response.json();
        console.log('API Response JSON:', result);
        
        if (response.ok && result.success) {
            showNotification(`تم إنشاء السنة الدراسية ${yearName} بنجاح (تطبق على جميع المدارس)`, 'success');
            closeCreateAcademicYearModal();
            await loadAllAcademicYears();
            loadCurrentAcademicYear();
        } else {
            const errorMessage = result.error_ar || result.error || 'حدث خطأ غير معروف';
            console.error('API Error:', errorMessage);
            console.error('Full error response:', result);
            showNotification(errorMessage, 'error');
        }
    } catch (error) {
        console.error('Network error creating academic year:', error);
        console.error('Error stack:', error.stack);
        showNotification('حدث خطأ في الاتصال بالخادم: ' + error.message, 'error');
    }
}

// Generate system academic years automatically
async function generateSystemYears() {
    try {
        const response = await fetch('/api/system/academic-years/generate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ count: 5 })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(result.message || 'تم إنشاء السنوات الدراسية بنجاح', 'success');
            await loadAllAcademicYears();
            loadCurrentAcademicYear();
            showAllAcademicYearsModal();
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ', 'error');
        }
    } catch (error) {
        console.error('Error generating academic years:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Set system academic year as current - DISABLED: Now automatic based on date
async function setSystemAcademicYearAsCurrent(yearId) {
    showNotification('السنة الدراسية الحالية يتم تحديدها تلقائياً بناءً على التاريخ الحالي', 'info');
}

// Delete system academic year
async function deleteSystemAcademicYear(yearId) {
    if (!confirm('هل أنت متأكد من حذف هذه السنة الدراسية؟\n\nتحذير: سيؤثر هذا على جميع المدارس في النظام!')) return;
    
    try {
        const response = await fetch(`/api/system/academic-year/${yearId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('تم حذف السنة الدراسية بنجاح', 'success');
            await loadAllAcademicYears();
            loadCurrentAcademicYear();
            showAllAcademicYearsModal(); // Refresh modal
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ', 'error');
        }
    } catch (error) {
        console.error('Error deleting academic year:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Legacy functions - kept for backward compatibility but now use system endpoints
const setAcademicYearAsCurrent = setSystemAcademicYearAsCurrent;
const deleteAcademicYear = deleteSystemAcademicYear;

// Refresh academic years on page load (no longer depends on schools)
const originalFetchSchools = fetchSchools;
fetchSchools = async function() {
    await originalFetchSchools.apply(this, arguments);
};