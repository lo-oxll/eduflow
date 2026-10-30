// assets/js/student.js

let currentStudent = null;
let academicYears = [];
let currentAcademicYearId = null;
let selectedAcademicYearId = 'current';

// Grade thresholds based on grade scale
const GRADE_THRESHOLDS = {
    scale10: {
        maxGrade: 10,
        passThreshold: 5,
        safeThreshold: 7,
        atRiskRange: '5-6',
        safeRange: '7-10',
        failRange: '0-4'
    },
    scale100: {
        maxGrade: 100,
        passThreshold: 50,
        safeThreshold: 70,
        atRiskRange: '50-69',
        safeRange: '70-100',
        failRange: '0-49'
    }
};

// Period order for trend analysis
const PERIOD_ORDER = ['month1', 'month2', 'midterm', 'month3', 'month4', 'final'];
const PERIOD_NAMES = {
    month1: 'شهر الأول',
    month2: 'شهر الثاني',
    midterm: 'نصف السنة',
    month3: 'شهر الثالث',
    month4: 'شهر الرابع',
    final: 'نهاية السنة'
};

// Analyze grade trends for a subject
function analyzeGradeTrend(grades, maxGrade) {
    const thresholds = maxGrade === 10 ? 
        { passThreshold: 5, safeThreshold: 7 } : 
        { passThreshold: 50, safeThreshold: 70 };
    
    const gradeSequence = [];
    let firstNonZeroIndex = -1;
    let lastNonZeroIndex = -1;
    
    PERIOD_ORDER.forEach((period, index) => {
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

// ============================================================================
// PROFESSIONAL ACADEMIC ADVISOR FOR STUDENT PORTAL
// ============================================================================
class StudentAcademicAdvisor {
    constructor(scores, maxGrade, thresholds) {
        this.scores = scores;
        this.maxGrade = maxGrade;
        this.thresholds = thresholds;
        this.analysis = this.analyzePerformance();
    }

    analyzePerformance() {
        const subjects = {};
        let totalGrades = 0;
        let gradeCount = 0;
        let strongSubjects = [];
        let moderateSubjects = [];
        let weakSubjects = [];
        let improvingSubjects = [];
        let decliningSubjects = [];
        let inconsistentSubjects = [];
        let missedAssessments = [];

        for (const subject in this.scores) {
            const subjectGrades = this.scores[subject];
            const trend = analyzeGradeTrend(subjectGrades, this.maxGrade);
            
            let subjectTotal = 0;
            let subjectCount = 0;

            PERIOD_ORDER.forEach(period => {
                const grade = parseInt(subjectGrades[period]) || 0;
                if (grade > 0) {
                    subjectTotal += grade;
                    subjectCount++;
                    totalGrades += grade;
                    gradeCount++;
                } else if (trend.latestGrade > 0) {
                    const hasLaterGrade = PERIOD_ORDER.slice(PERIOD_ORDER.indexOf(period) + 1)
                        .some(p => (parseInt(subjectGrades[p]) || 0) > 0);
                    if (hasLaterGrade) {
                        missedAssessments.push({ subject, period: PERIOD_NAMES[period] });
                    }
                }
            });

            if (subjectCount > 0) {
                const avg = subjectTotal / subjectCount;
                const percentage = (avg / this.maxGrade) * 100;
                
                const subjectData = {
                    name: subject,
                    average: avg,
                    percentage,
                    trend,
                    gradeCount: subjectCount,
                    latestGrade: trend.latestGrade,
                    consistency: trend.consistency
                };

                subjects[subject] = subjectData;

                if (avg >= this.thresholds.safeThreshold) {
                    strongSubjects.push(subjectData);
                } else if (avg >= this.thresholds.passThreshold) {
                    moderateSubjects.push(subjectData);
                } else {
                    weakSubjects.push(subjectData);
                }

                if (trend.hasImprovement) improvingSubjects.push(subjectData);
                if (trend.hasDeterioration) decliningSubjects.push(subjectData);
                if (trend.consistency === 'inconsistent') inconsistentSubjects.push(subjectData);
            }
        }

        const overallAvg = gradeCount > 0 ? totalGrades / gradeCount : 0;
        const overallPercentage = (overallAvg / this.maxGrade) * 100;

        return {
            subjects,
            overallAvg,
            overallPercentage,
            strongSubjects: strongSubjects.sort((a, b) => b.average - a.average),
            moderateSubjects: moderateSubjects.sort((a, b) => b.average - a.average),
            weakSubjects: weakSubjects.sort((a, b) => a.average - b.average),
            improvingSubjects,
            decliningSubjects,
            inconsistentSubjects,
            missedAssessments,
            totalSubjects: Object.keys(subjects).length
        };
    }

    getPerformanceLevel() {
        const pct = this.analysis.overallPercentage;
        if (pct >= 90) return { level: 'excellent', label: 'متميز', icon: '🌟', cssClass: 'success' };
        if (pct >= 80) return { level: 'very-good', label: 'جيد جداً', icon: '⭐', cssClass: 'success' };
        if (pct >= 70) return { level: 'good', label: 'جيد', icon: '✅', cssClass: 'success' };
        if (pct >= 60) return { level: 'satisfactory', label: 'مقبول', icon: '🟡', cssClass: 'warning' };
        if (pct >= 50) return { level: 'at-risk', label: 'تحذير', icon: '⚠️', cssClass: 'warning' };
        return { level: 'critical', label: 'حرج', icon: '🚨', cssClass: 'danger' };
    }

    generateSummaryHTML() {
        const a = this.analysis;
        const perf = this.getPerformanceLevel();
        return `
            <div class="rec-header">
                ${perf.icon} <strong>${perf.label}</strong> | ${a.overallAvg.toFixed(1)}/${this.maxGrade} (${a.overallPercentage.toFixed(0)}%)
            </div>
        `;
    }

    generateStrengthsHTML() {
        const a = this.analysis;
        if (a.strongSubjects.length === 0 && a.improvingSubjects.length === 0) {
            return '<div class="rec-section">💪 <strong>نقاط القوة:</strong> <span class="rec-text">لم يتم تحديد نقاط قوة واضحة بعد</span></div>';
        }

        let items = [];
        a.strongSubjects.forEach(s => {
            let note = s.trend.trend === 'improving' ? ' (تحسن)' : '';
            items.push(`${escapeHtml(s.name)}: ${s.average.toFixed(1)}/${this.maxGrade}${note}`);
        });

        const improving = a.improvingSubjects.filter(s => !a.strongSubjects.find(str => str.name === s.name));
        improving.forEach(s => {
            items.push(`${escapeHtml(s.name)}: تحسن (${s.trend.firstGrade} → ${s.trend.latestGrade})`);
        });

        return `<div class="rec-section">💪 <strong>نقاط القوة:</strong> <span class="rec-text">${items.join(' • ')}</span></div>`;
    }

    generateImprovementAreasHTML() {
        const a = this.analysis;
        
        if (a.weakSubjects.length === 0 && a.moderateSubjects.length === 0 && 
            a.decliningSubjects.length === 0 && a.inconsistentSubjects.length === 0) {
            return '<div class="rec-section">🎯 <strong>المجالات التي تحتاج تطوير:</strong> <span class="rec-text success">لا توجد مجالات تحتاج تطوير عاجل</span></div>';
        }

        let items = [];
        
        if (a.weakSubjects.length > 0) {
            a.weakSubjects.forEach(s => {
                let note = s.trend.hasDeterioration ? ' (تراجع)' : '';
                items.push(`${escapeHtml(s.name)}: ${s.average.toFixed(1)}/${this.maxGrade}${note}`);
            });
        }

        if (a.moderateSubjects.length > 0) {
            a.moderateSubjects.forEach(s => {
                const gap = (this.thresholds.safeThreshold - s.average).toFixed(1);
                items.push(`${escapeHtml(s.name)}: ${s.average.toFixed(1)}/${this.maxGrade} (يحتاج +${gap})`);
            });
        }

        const declining = a.decliningSubjects.filter(s => !a.weakSubjects.find(w => w.name === s.name));
        if (declining.length > 0) {
            declining.forEach(s => {
                items.push(`${escapeHtml(s.name)}: تراجع (${s.trend.firstGrade} → ${s.trend.latestGrade})`);
            });
        }

        if (a.inconsistentSubjects.length > 0) {
            a.inconsistentSubjects.forEach(s => {
                items.push(`${escapeHtml(s.name)}: أداء غير مستقر`);
            });
        }

        return `<div class="rec-section">🎯 <strong>المجالات التي تحتاج تطوير:</strong> <span class="rec-text">${items.join(' • ')}</span></div>`;
    }

    generateStudyPlanHTML() {
        const a = this.analysis;
        const perf = this.getPerformanceLevel();
        
        let tips = [];
        
        if (perf.level === 'excellent' || perf.level === 'very-good') {
            tips = ['الحفاظ على الأداء المتميز', 'المشاركة في الأنشطة الإثرائية', 'مساعدة الزملاء'];
        } else if (perf.level === 'good' || perf.level === 'satisfactory') {
            tips = ['30 دقيقة إضافية للمراجعة', 'التركيز على فهم المفاهيم', 'طلب المساعدة عند الحاجة'];
        } else {
            tips = ['جدول دراسي يومي (2-3 ساعات)', 'حضور دروس التقوية', 'مراجعة يومية للدروس'];
        }

        let priority = '';
        if (a.weakSubjects.length > 0) {
            priority = ` | أولوية: ${a.weakSubjects.slice(0, 2).map(s => s.name).join('، ')}`;
        }

        return `<div class="rec-section">📝 <strong>خطة العمل:</strong> <span class="rec-text">${tips.join(' • ')}${priority}</span></div>`;
    }

    generateMotivationHTML() {
        const perf = this.getPerformanceLevel();
        const a = this.analysis;
        let msg = '';
        let icon = '';
        
        if (perf.level === 'excellent' || perf.level === 'very-good') {
            icon = '🌟';
            msg = 'أداء متميز! استمر في التفوق.';
        } else if (perf.level === 'good') {
            icon = '⭐';
            msg = 'أداء جيد جداً! أنت قريب من التميز.';
        } else if (perf.level === 'satisfactory') {
            icon = '✅';
            msg = 'أداء مقبول. يمكنك الأفضل مع المزيد من الجهد.';
        } else if (perf.level === 'at-risk') {
            icon = '⚠️';
            msg = 'حان وقت العمل الجاد! لا تستسلم.';
        } else {
            icon = '💪';
            msg = 'كل خطوة صغيرة مهمة! ابدأ الآن.';
        }

        if (a.improvingSubjects && a.improvingSubjects.length > 0) {
            msg += ' لاحظنا تحسناً في أدائك!';
        }

        return `<div class="rec-motivation">${icon} ${msg}</div>`;
    }

    /**
     * Generate notification banner based on performance
     */
    generateNotificationBanner() {
        const perf = this.getPerformanceLevel();
        const a = this.analysis;
        
        let bannerType = '';
        let bannerTitle = '';
        let bannerMessage = '';
        
        if (perf.level === 'excellent' || perf.level === 'very-good') {
            bannerType = 'success';
            bannerTitle = 'ممتاز! أداء استثنائي';
            bannerMessage = `معدل درجاتك ${a.overallAvg.toFixed(1)}/${this.maxGrade} - تفوقك ملهم!继续保持努力，你的未来充满希望！`;
        } else if (perf.level === 'good') {
            bannerType = 'success';
            bannerTitle = 'أداء جيد جداً';
            bannerMessage = `معدل درجاتك ${a.overallAvg.toFixed(1)}/${this.maxGrade} - أنت في الطريق نحو التميز!`;
        } else if (perf.level === 'satisfactory') {
            bannerType = 'warning';
            bannerTitle = 'أداء مقبول';
            bannerMessage = `معدل درجاتك ${a.overallAvg.toFixed(1)}/${this.maxGrade} - يمكنك الأفضل مع مزيد من الجهد!`;
        } else if (perf.level === 'at-risk') {
            bannerType = 'warning';
            bannerTitle = 'تحذير: يحتاج اهتماماً';
            bannerMessage = `معدل درجاتك ${a.overallAvg.toFixed(1)}/${this.maxGrade} - حان الوقت للتركيز والمذاكرة المكثفة!`;
        } else {
            bannerType = 'danger';
            bannerTitle = 'تنبيه: يحتاج دعم فوري';
            bannerMessage = `معدل درجاتك ${a.overallAvg.toFixed(1)}/${this.maxGrade} - ابدأ الآن ولا تتردد في طلب المساعدة من معلميك!`;
        }
        
        return `
            <div class="notification-banner ${bannerType}">
                <div class="notification-banner-header">
                    <i class="fas fa-bell"></i>
                    <span class="notification-title">${bannerTitle}</span>
                </div>
                <div class="notification-banner-message">${bannerMessage}</div>
            </div>
        `;
    }

    /**
     * Generate personalized study tips based on specific academic situation
     */
    generatePersonalizedStudyTips() {
        const perf = this.getPerformanceLevel();
        const a = this.analysis;
        
        let tips = [];
        
        // General tips based on performance level
        if (perf.level === 'excellent' || perf.level === 'very-good') {
            tips = [
                'حافظ على مستواك المتميز',
                'شارك زملائك المعرفة',
                'استكشف مواضيع إضافية',
                'شارك في المسابقات المدرسية'
            ];
        } else if (perf.level === 'good') {
            tips = [
                'ركّز على نقاط الضعف',
                'مارس المزيد من التمارين',
                'راجع الدروس بانتظام',
                'اطلب توضيحاً عند الحاجة'
            ];
        } else if (perf.level === 'satisfactory') {
            tips = [
                'أضف وقتاً للمذاكرة اليومية',
                'أنشئ جدولاً زمنياً',
                'قسّم المواد لأجزاء صغيرة',
                'راجع قبل الاختبارات'
            ];
        } else {
            tips = [
                'خصص وقتاً أطول للدراسة',
                'اطلب مساعدة المعلم',
                'انضم لدراسة جماعية',
                'راجع الدروس فوراً بعد الحصة'
            ];
        }
        
        // Add subject-specific tips
        if (a.weakSubjects && a.weakSubjects.length > 0) {
            tips.push(`ركّز على: ${a.weakSubjects.slice(0, 2).map(s => s.name).join('، ')}`);
        }
        
        if (a.improvingSubjects && a.improvingSubjects.length > 0) {
            tips.push('استمر في التحسن - لاحظنا تقدمك!');
        }
        
        return `
            <div class="personalized-tips">
                <h4 class="tips-title"><i class="fas fa-lightbulb"></i> نصائح مخصصة لك</h4>
                <ul class="tips-list">
                    ${tips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    generateThresholdsHTML() {
        return `<div class="rec-footer">النجاح: ${this.thresholds.passThreshold}/${this.maxGrade} | الأمان: ${this.thresholds.safeThreshold}+</div>`;
    }

    generateFullHTML() {
        let html = '<div class="recommendations-section">';
        html += this.generateNotificationBanner();
        html += this.generateSummaryHTML();
        html += this.generateStrengthsHTML();
        html += this.generateImprovementAreasHTML();
        html += this.generateStudyPlanHTML();
        html += this.generateMotivationHTML();
        html += this.generateThresholdsHTML();
        html += '</div>';
        return html;
    }
}

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', () => {
    checkLoginStatus();
    setupEventListeners();
});

// إعداد الأحداث
function setupEventListeners() {
    document.getElementById('studentLoginForm')?.addEventListener('submit', loginStudent);
}

// التحقق من حالة تسجيل الدخول
function checkLoginStatus() {
    const student = localStorage.getItem('student');
    if (student) {
        currentStudent = JSON.parse(student);
        showPortal();
        displayStudentData();
    }
}

// تسجيل دخول الطالب
async function loginStudent(e) {
    e.preventDefault();
    
    const code = document.getElementById('studentCode').value;
    const passwordEl = document.getElementById('studentPassword');
    const password = passwordEl ? passwordEl.value : '';
    
    try {
        const response = await fetch('/api/student/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, password })
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert(result.error);
        } else {
            currentStudent = result.student;
            localStorage.setItem('student', JSON.stringify(currentStudent));
            showPortal();
            displayStudentData();
        }
    } catch (error) {
        alert('حدث خطأ في الاتصال بالخادم');
    }
}

// عرض بوابة الطالب
function showPortal() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('portalSection').style.display = 'block';
    document.getElementById('studentName').textContent = currentStudent.full_name;
    loadAcademicYears();
}

// عرض بيانات الطالب
function displayStudentData() {
    displayScores();
    displayAttendance();
    displayRecommendations();
    // Removed student personal information display
}

// Determine max grade based on student's grade level
function getMaxGradeForStudent(student) {
    if (!student || !student.grade) return 100;
    
    // Extract the grade parts from the grade string (e.g., "ابتدائي - الأول الابتدائي")
    const gradeParts = student.grade.split(' - ');
    if (gradeParts.length < 2) return 100;
    
    const educationalLevel = gradeParts[0].trim(); // e.g., "ابتدائي"
    const gradeLevel = gradeParts[1].trim(); // e.g., "الأول الابتدائي"
    
    // Check if this is an elementary (ابتدائي) school level
    const isElementary = educationalLevel.includes('ابتدائي') || 
                         gradeLevel.includes('ابتدائي') || 
                         gradeLevel.includes('الابتدائي');
    
    // Only apply 10-point scale to elementary grades 1-4
    if (isElementary) {
        // Check if grade is first, second, third, or fourth
        // Handle both formats: with and without the definite article "ال"
        const isGrades1to4 = gradeLevel.includes('الأول') || gradeLevel.includes('الثاني') || 
                             gradeLevel.includes('الثالث') || gradeLevel.includes('الرابع') ||
                             gradeLevel.includes('اول') || gradeLevel.includes('ثاني') || 
                             gradeLevel.includes('ثالث') || gradeLevel.includes('رابع') ||
                             gradeLevel.includes('الاول');
        
        // Make sure it's NOT fifth or sixth grade (which should use 100-point scale)
        const isGrades5or6 = gradeLevel.includes('الخامس') || gradeLevel.includes('السادس') ||
                             gradeLevel.includes('خامس') || gradeLevel.includes('سادس');
        
        if (isGrades1to4 && !isGrades5or6) {
            return 10;
        }
    }
    
    // For all other grades (including elementary 5-6, middle, secondary, preparatory), max grade is 100
    return 100;
}

// Get grade thresholds for student
function getThresholdsForStudent(student) {
    const maxGrade = getMaxGradeForStudent(student);
    return maxGrade === 10 ? GRADE_THRESHOLDS.scale10 : GRADE_THRESHOLDS.scale100;
}

// عرض الدرجات
function displayScores() {
    const tbody = document.getElementById('scoresTableBody');
    
    if (!tbody) return;

    const thresholds = getThresholdsForStudent(currentStudent);
    const maxGrade = thresholds.maxGrade;

    // First priority: Use grades from API (student_grades table - teacher-entered grades)
    if (currentStudent.gradesFromAPI && currentStudent.gradesFromAPI.length > 0) {
        const rows = currentStudent.gradesFromAPI.map(grade => {
            const scores = {
                month1: grade.month1 || 0,
                month2: grade.month2 || 0,
                midterm: grade.midterm || 0,
                month3: grade.month3 || 0,
                month4: grade.month4 || 0,
                final: grade.final || 0
            };

            // Calculate average
            let total = 0;
            let count = 0;
            for (const period in scores) {
                if (scores[period] > 0) {
                    total += scores[period];
                    count++;
                }
            }
            const avg = count > 0 ? total / count : 0;
            const status = getGradeStatus(avg, thresholds);
            
            return `
                <tr>
                    <td>${escapeHtml(grade.subject_name)}</td>
                    <td>${avg.toFixed(1)}/${maxGrade}</td>
                    <td><span class="${status.cssClass}">${status.text}</span></td>
                    <td>${escapeHtml(status.recommendation)}</td>
                </tr>
            `;
        }).join('');
        
        tbody.innerHTML = rows || '<tr><td colspan="4">لا توجد درجات مسجلة</td></tr>';
        return;
    }

    // Fallback: Use detailed_scores from student record (legacy storage)
    const scores = parseJSON(currentStudent.scores);
    const detailedScores = parseJSON(currentStudent.detailed_scores);

    // If detailed scores are available, use them
    if (Object.keys(detailedScores).length > 0) {
        const rows = Object.entries(detailedScores).map(([subject, periods]) => {
            // Calculate average for the subject
            let total = 0;
            let count = 0;
            for (const period in periods) {
                const grade = parseInt(periods[period]) || 0;
                if (grade > 0) {
                    total += grade;
                    count++;
                }
            }
            const avg = count > 0 ? total / count : 0;
            const status = getGradeStatus(avg, thresholds);
            
            return `
                <tr>
                    <td>${subject}</td>
                    <td>${avg.toFixed(1)}/${maxGrade}</td>
                    <td><span class="${status.cssClass}">${status.text}</span></td>
                    <td>${escapeHtml(status.recommendation)}</td>
                </tr>
            `;
        }).join('');
        
        tbody.innerHTML = rows || '<tr><td colspan="4">لا توجد درجات مسجلة</td></tr>';
    } else {
        // Use simple scores
        const rows = Object.entries(scores).map(([subject, score]) => {
            const numScore = parseFloat(score) || 0;
            const status = getGradeStatus(numScore, thresholds);
            
            return `
                <tr>
                    <td>${subject}</td>
                    <td>${numScore}/${maxGrade}</td>
                    <td><span class="${status.cssClass}">${status.text}</span></td>
                    <td>${escapeHtml(status.recommendation)}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="4">لا توجد درجات مسجلة</td></tr>';
    }
}

// Get grade status based on thresholds with trend analysis
function getGradeStatus(score, thresholds, trendAnalysis = null) {
    // Build trend icon and info
    let trendIcon = '';
    let trendInfo = '';
    
    if (trendAnalysis) {
        if (trendAnalysis.hadZeroBeforeGoodGrade) {
            trendIcon = ' 📈';
            trendInfo = `تحسن ممتاز من 0 إلى ${trendAnalysis.latestGrade}/${thresholds.maxGrade}`;
        } else if (trendAnalysis.hasImprovement) {
            trendIcon = ' ↑';
            trendInfo = `مسار تصاعدي: ${trendAnalysis.firstGrade} → ${trendAnalysis.latestGrade}`;
        } else if (trendAnalysis.hasDeterioration) {
            trendIcon = ' ↓';
            trendInfo = `مسار تنازلي: ${trendAnalysis.firstGrade} → ${trendAnalysis.latestGrade}`;
        } else if (trendAnalysis.consistency === 'inconsistent') {
            trendIcon = ' ⚡';
            trendInfo = 'أداء غير مستقر';
        }
    }
    
    if (score === 0) {
        return {
            status: 'pending',
            text: 'معلق',
            cssClass: 'grade-pending',
            recommendation: 'لم يتم إدخال الدرجة بعد',
            trendIcon: '',
            trendInfo: ''
        };
    } else if (score >= thresholds.safeThreshold) {
        let recommendation = 'أداء ممتاز - استمر على هذا المستوى!';
        if (trendAnalysis && trendAnalysis.hadZeroBeforeGoodGrade) {
            recommendation = `تحسن ممتاز! استمر في الحفاظ على الاستمرارية في جميع الفترات.`;
        } else if (trendAnalysis && trendAnalysis.hasImprovement) {
            recommendation = `مسار تصاعدي ممتاز! استمر في الحفاظ على هذا المستوى.`;
        }
        return {
            status: 'safe',
            text: 'آمن ✅' + trendIcon,
            cssClass: 'grade-safe',
            recommendation,
            trendIcon,
            trendInfo
        };
    } else if (score >= thresholds.passThreshold) {
        let recommendation = 'ناجح ولكن في منطقة الخطر - يحتاج مزيد من الجهد';
        if (trendAnalysis && trendAnalysis.hasImprovement) {
            recommendation = `مسار تصاعدي! استمر للوصول للمنطقة الآمنة (${thresholds.safeThreshold}/${thresholds.maxGrade}).`;
        } else if (trendAnalysis && trendAnalysis.hasDeterioration) {
            recommendation = `تحذير: مسار تنازلي - يحتاج تدخل عاجل`;
        }
        return {
            status: 'at-risk',
            text: 'تحذير ⚠️' + trendIcon,
            cssClass: 'grade-at-risk',
            recommendation,
            trendIcon,
            trendInfo
        };
    } else {
        let recommendation = 'يحتاج خطة تقوية عاجلة';
        if (trendAnalysis && trendAnalysis.hasImprovement) {
            recommendation = `تحسن ملحوظ! استمر للوصول لدرجة النجاح (${thresholds.passThreshold}/${thresholds.maxGrade}).`;
        }
        return {
            status: 'fail',
            text: 'راسب ❌' + trendIcon,
            cssClass: 'grade-fail',
            recommendation,
            trendIcon,
            trendInfo
        };
    }
}

// Display overall recommendations with comprehensive academic guidance
function displayRecommendations() {
    const recommendationsContainer = document.getElementById('recommendationsContainer');
    if (!recommendationsContainer) return;
    
    const thresholds = getThresholdsForStudent(currentStudent);
    const maxGrade = thresholds.maxGrade;
    const detailedScores = parseJSON(currentStudent.detailed_scores);
    
    // Check if there are any scores
    if (Object.keys(detailedScores).length === 0) {
        recommendationsContainer.innerHTML = '<div class="recommendations-section"><p>لا توجد درجات مسجلة بعد</p></div>';
        return;
    }
    
    // Use the comprehensive academic advisor
    const advisor = new StudentAcademicAdvisor(detailedScores, maxGrade, thresholds);
    recommendationsContainer.innerHTML = advisor.generateFullHTML();
}

// ============================================================================
// COMPREHENSIVE EDUCATIONAL RECOMMENDATIONS REPORT
// ============================================================================

class ComprehensiveEducationalReport {
    constructor(studentData, scores, attendance, classAverages, maxGrade, thresholds) {
        this.student = studentData;
        this.scores = scores;
        this.attendance = attendance;
        this.classAverages = classAverages || {};
        this.maxGrade = maxGrade;
        this.thresholds = thresholds;
        this.analysis = this.analyzeAll();
        this.educationalStage = this.detectEducationalStage();
    }
    
    detectEducationalStage() {
        const grade = this.student.grade || '';
        if (grade.includes('ابتدائي') || grade.includes('الابتدائي')) {
            if (grade.includes('الأول') || grade.includes('الثاني') || 
                grade.includes('الثالث') || grade.includes('الرابع') ||
                grade.includes('الاول') || grade.includes('ثاني') || 
                grade.includes('ثالث') || grade.includes('رابع')) {
                return 'ابتدائي-early';
            }
            return 'ابتدائي';
        }
        if (grade.includes('متوسط')) return 'متوسط';
        if (grade.includes('إعدادي') || grade.includes('اعدادي')) return 'إعدادي';
        if (grade.includes('ثانوي')) return 'ثانوي';
        return 'ابتدائي';
    }
    
    analyzeAll() {
        const subjects = {};
        let totalGrades = 0;
        let gradeCount = 0;
        let strongSubjects = [];
        let moderateSubjects = [];
        let weakSubjects = [];
        let improvingSubjects = [];
        let decliningSubjects = [];
        
        for (const subject in this.scores) {
            const subjectGrades = this.scores[subject];
            const trend = analyzeGradeTrend(subjectGrades, this.maxGrade);
            
            let subjectTotal = 0;
            let subjectCount = 0;
            
            PERIOD_ORDER.forEach(period => {
                const grade = parseInt(subjectGrades[period]) || 0;
                if (grade > 0) {
                    subjectTotal += grade;
                    subjectCount++;
                    totalGrades += grade;
                    gradeCount++;
                }
            });
            
            if (subjectCount > 0) {
                const avg = subjectTotal / subjectCount;
                const percentage = (avg / this.maxGrade) * 100;
                
                const subjectData = {
                    name: subject,
                    average: avg,
                    percentage,
                    trend,
                    gradeCount: subjectCount,
                    latestGrade: trend.latestGrade,
                    consistency: trend.consistency
                };
                
                subjects[subject] = subjectData;
                
                if (avg >= this.thresholds.safeThreshold) {
                    strongSubjects.push(subjectData);
                } else if (avg >= this.thresholds.passThreshold) {
                    moderateSubjects.push(subjectData);
                } else {
                    weakSubjects.push(subjectData);
                }
                
                if (trend.hasImprovement) improvingSubjects.push(subjectData);
                if (trend.hasDeterioration) decliningSubjects.push(subjectData);
            }
        }
        
        // Calculate attendance percentage
        let presentDays = 0;
        let totalDays = 0;
        const dailyAttendance = this.attendance || {};
        for (const date in dailyAttendance) {
            const dayData = dailyAttendance[date];
            for (const subject in dayData) {
                totalDays++;
                if (dayData[subject] === 'حاضر') presentDays++;
            }
        }
        const attendancePercent = totalDays > 0 ? (presentDays / totalDays) * 100 : 100;
        
        const overallAvg = gradeCount > 0 ? totalGrades / gradeCount : 0;
        const overallPercentage = (overallAvg / this.maxGrade) * 100;
        
        return {
            subjects,
            overallAvg,
            overallPercentage,
            attendancePercent,
            strongSubjects: strongSubjects.sort((a, b) => b.average - a.average),
            moderateSubjects: moderateSubjects.sort((a, b) => b.average - a.average),
            weakSubjects: weakSubjects.sort((a, b) => a.average - b.average),
            improvingSubjects,
            decliningSubjects,
            totalSubjects: Object.keys(subjects).length,
            hasScores: gradeCount > 0
        };
    }
    
    getPerformanceLevel() {
        const pct = this.analysis.overallPercentage;
        if (pct >= 90) return { level: 'excellent', label: 'ممتاز', icon: '🌟', cssClass: 'excellent' };
        if (pct >= 80) return { level: 'very-good', label: 'جيد جداً', icon: '⭐', cssClass: 'very-good' };
        if (pct >= 70) return { level: 'good', label: 'جيد', icon: '✅', cssClass: 'good' };
        if (pct >= 60) return { level: 'satisfactory', label: 'مقبول', icon: '🟡', cssClass: 'satisfactory' };
        if (pct >= 50) return { level: 'needs-support', label: 'يحتاج دعم', icon: '⚠️', cssClass: 'warning' };
        return { level: 'critical', label: 'حرج', icon: '🚨', cssClass: 'critical' };
    }
    
    getAttendanceLevel() {
        const pct = this.analysis.attendancePercent;
        if (pct >= 95) return { level: 'excellent', label: 'ممتاز', icon: '🌟' };
        if (pct >= 85) return { level: 'good', label: 'جيد', icon: '✅' };
        if (pct >= 75) return { level: 'moderate', label: 'متوسط', icon: '⚠️' };
        return { level: 'poor', label: 'ضعيف', icon: '🚨' };
    }
    
    compareWithClass(subjectName) {
        const subjectData = this.analysis.subjects[subjectName];
        if (!subjectData) return null;
        
        const classAvg = this.classAverages[subjectName];
        if (classAvg === undefined) return null;
        
        const studentPercent = subjectData.percentage;
        const classPercent = (classAvg / this.maxGrade) * 100;
        const diff = studentPercent - classPercent;
        
        if (diff >= 15) return { status: 'above', label: 'أعلى بكثير', icon: '📈', diff: diff.toFixed(1) };
        if (diff >= 5) return { status: 'above', label: 'أعلى', icon: '⬆️', diff: diff.toFixed(1) };
        if (diff >= -5) return { status: 'average', label: 'متوسط', icon: '➡️', diff: diff.toFixed(1) };
        if (diff >= -15) return { status: 'below', label: 'أقل', icon: '⬇️', diff: diff.toFixed(1) };
        return { status: 'below', label: 'أقل بكثير', icon: '📉', diff: diff.toFixed(1) };
    }
    
    generateFullHTML() {
        if (!this.analysis.hasScores) {
            return `<div class="report-empty">
                <i class="fas fa-info-circle"></i>
                <p>لا توجد درجات مسجلة حتى الآن. سيتم إنشاء التقرير عند توفر البيانات.</p>
            </div>`;
        }
        
        let html = '<div class="comprehensive-report">';
        
        // Section 1: General Evaluation
        html += this.generateGeneralEvaluation();
        
        // Section 2: Performance Analysis vs Class
        html += this.generateClassComparison();
        
        // Section 3: Strengths
        html += this.generateStrengthsSection();
        
        // Section 4: Areas for Improvement
        html += this.generateImprovementSection();
        
        // Section 5: Action Plan
        html += this.generateActionPlan();
        
        // Section 6: Stage-appropriate Strategies
        html += this.generateStrategiesSection();
        
        // Section 7: Guidance for Teachers & Parents
        html += this.generateGuidanceSection();
        
        // Section 8: Motivational Conclusion
        html += this.generateMotivationSection();
        
        html += '</div>';
        return html;
    }
    
    generateGeneralEvaluation() {
        const perf = this.getPerformanceLevel();
        const att = this.getAttendanceLevel();
        const a = this.analysis;
        
        let classPosition = '';
        const subjectsWithClass = Object.keys(this.classAverages).length;
        if (subjectsWithClass > 0) {
            let aboveCount = 0;
            let belowCount = 0;
            for (const subject in this.analysis.subjects) {
                const comp = this.compareWithClass(subject);
                if (comp && comp.status === 'above') aboveCount++;
                if (comp && comp.status === 'below') belowCount++;
            }
            if (aboveCount > belowCount) {
                classPosition = '<span class="position-badge above">أعلى من متوسط الفصل</span>';
            } else if (belowCount > aboveCount) {
                classPosition = '<span class="position-badge below">أقل من متوسط الفصل</span>';
            } else {
                classPosition = '<span class="position-badge average">عند متوسط الفصل</span>';
            }
        }
        
        return `
            <div class="report-section general-evaluation">
                <div class="section-header">
                    <i class="fas fa-chart-pie"></i>
                    <h3>1️⃣ التقييم العام</h3>
                </div>
                <div class="eval-cards">
                    <div class="eval-card ${perf.cssClass}">
                        <div class="eval-icon">${perf.icon}</div>
                        <div class="eval-label">المستوى العام</div>
                        <div class="eval-value">${perf.label}</div>
                    </div>
                    <div class="eval-card">
                        <div class="eval-icon">📊</div>
                        <div class="eval-label">المعدل العام</div>
                        <div class="eval-value">${a.overallAvg.toFixed(1)}/${this.maxGrade} (${a.overallPercentage.toFixed(0)}%)</div>
                    </div>
                    <div class="eval-card ${att.level === 'excellent' || att.level === 'good' ? 'good' : 'warning'}">
                        <div class="eval-icon">${att.icon}</div>
                        <div class="eval-label">نسبة الحضور</div>
                        <div class="eval-value">${att.label} (${a.attendancePercent.toFixed(0)}%)</div>
                    </div>
                </div>
                <div class="eval-impact">
                    <strong>📌 تأثير الحضور:</strong> ${a.attendancePercent >= 90 ? 'الحضور المنتظم أثر إيجابياً على مستواك الدراسي' : 'تحسين الحضور سيساهم في تحسين درجاتك' }
                </div>
                ${classPosition ? `<div class="eval-position">${classPosition}</div>` : ''}
            </div>
        `;
    }
    
    generateClassComparison() {
        const a = this.analysis;
        if (Object.keys(this.classAverages).length === 0) {
            return '';
        }
        
        let aboveSubjects = [];
        let averageSubjects = [];
        let belowSubjects = [];
        
        for (const subject in a.subjects) {
            const comp = this.compareWithClass(subject);
            if (comp) {
                if (comp.status === 'above') {
                    aboveSubjects.push({ ...a.subjects[subject], comparison: comp });
                } else if (comp.status === 'below') {
                    belowSubjects.push({ ...a.subjects[subject], comparison: comp });
                } else {
                    averageSubjects.push({ ...a.subjects[subject], comparison: comp });
                }
            }
        }
        
        let html = `
            <div class="report-section class-comparison">
                <div class="section-header">
                    <i class="fas fa-users"></i>
                    <h3>2️⃣ تحليل الأداء مقارنة بالفصل</h3>
                </div>
        `;
        
        if (aboveSubjects.length > 0) {
            html += `<div class="comparison-group success">
                <h4><i class="fas fa-arrow-up"></i> مواد تتفوق فيها على زملائك</h4>
                <div class="subject-list">
                    ${aboveSubjects.map(s => `
                        <div class="subject-item">
                            <span class="subject-name">${escapeHtml(s.name)}</span>
                            <span class="subject-diff positive">+${s.comparison.diff}%</span>
                            <span class="subject-status">${s.comparison.label}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }
        
        if (averageSubjects.length > 0) {
            html += `<div class="comparison-group warning">
                <h4><i class="fas fa-minus"></i> مواد قريبة من متوسط الفصل</h4>
                <div class="subject-list">
                    ${averageSubjects.map(s => `
                        <div class="subject-item">
                            <span class="subject-name">${escapeHtml(s.name)}</span>
                            <span class="subject-diff neutral">${s.comparison.diff}%</span>
                            <span class="subject-status">${s.comparison.label}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }
        
        if (belowSubjects.length > 0) {
            html += `<div class="comparison-group danger">
                <h4><i class="fas fa-arrow-down"></i> مواد أقل من المتوسط</h4>
                <div class="subject-list">
                    ${belowSubjects.map(s => `
                        <div class="subject-item">
                            <span class="subject-name">${escapeHtml(s.name)}</span>
                            <span class="subject-diff negative">${s.comparison.diff}%</span>
                            <span class="subject-status">${s.comparison.label}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }
        
        html += '</div>';
        return html;
    }
    
    generateStrengthsSection() {
        const a = this.analysis;
        if (a.strongSubjects.length === 0 && a.improvingSubjects.length === 0) {
            return '';
        }
        
        let html = `
            <div class="report-section strengths-section">
                <div class="section-header">
                    <i class="fas fa-star"></i>
                    <h3>3️⃣ نقاط القوة والتميز</h3>
                </div>
                <div class="strengths-list">
        `;
        
        a.strongSubjects.forEach(s => {
            const trendIcon = s.trend.trend === 'improving' ? '📈' : (s.trend.consistency === 'consistent' ? '💪' : '⭐');
            const reason = s.trend.hasImprovement ? 'لتحسنك المستمر' : 
                           (s.trend.consistency === 'consistent' ? 'لانتظام مستواك' : 'لأدائك المتميز');
            html += `
                <div class="strength-item">
                    <div class="strength-header">
                        <span class="strength-icon">${trendIcon}</span>
                        <span class="strength-name">${escapeHtml(s.name)}</span>
                        <span class="strength-score">${s.average.toFixed(1)}/${this.maxGrade}</span>
                    </div>
                    <div class="strength-reason">${reason} في هذه المادة</div>
                </div>
            `;
        });
        
        html += '</div><div class="encouragement">🎉 أستمر على هذا المستوى المتميز!</div></div>';
        return html;
    }
    
    generateImprovementSection() {
        const a = this.analysis;
        if (a.weakSubjects.length === 0 && a.moderateSubjects.length === 0) {
            return `
                <div class="report-section improvement-section">
                    <div class="section-header">
                        <i class="fas fa-check-circle"></i>
                        <h3>4️⃣ المجالات التي تحتاج تطوير</h3>
                    </div>
                    <div class="no-improvements">
                        <p>ممتاز! لا توجد مجالات تحتاج تطوير حالياً.</p>
                    </div>
                </div>
            `;
        }
        
        let html = `
            <div class="report-section improvement-section">
                <div class="section-header">
                    <i class="fas fa-arrow-trend-up"></i>
                    <h3>4️⃣ المجالات التي تحتاج تطوير</h3>
                </div>
                <div class="improvement-list">
        `;
        
        a.weakSubjects.forEach(s => {
            const trendIcon = s.trend.hasImprovement ? '📈' : (s.trend.hasDeterioration ? '📉' : '⚠️');
            let factors = [];
            if (this.analysis.attendancePercent < 90) factors.push('الحضور');
            if (s.trend.consistency === 'inconsistent') factors.push('التدريب');
            
            html += `
                <div class="improvement-item">
                    <div class="improvement-header">
                        <span class="improvement-icon">${trendIcon}</span>
                        <span class="improvement-name">${escapeHtml(s.name)}</span>
                        <span class="improvement-score">${s.average.toFixed(1)}/${this.maxGrade}</span>
                    </div>
                    ${factors.length > 0 ? `<div class="improvement-factors">عوامل مؤثرة: ${factors.join('، ')}</div>` : ''}
                </div>
            `;
        });
        
        a.moderateSubjects.forEach(s => {
            const gap = (this.thresholds.safeThreshold - s.average).toFixed(1);
            html += `
                <div class="improvement-item moderate">
                    <div class="improvement-header">
                        <span class="improvement-icon">⚡</span>
                        <span class="improvement-name">${escapeHtml(s.name)}</span>
                        <span class="improvement-score">${s.average.toFixed(1)}/${this.maxGrade}</span>
                    </div>
                    <div class="improvement-gap">الفجوة للوصول للأمان: ${gap} درجات</div>
                </div>
            `;
        });
        
        html += '</div></div>';
        return html;
    }
    
    generateActionPlan() {
        const a = this.analysis;
        const perf = this.getPerformanceLevel();
        
        if (perf.level === 'excellent' || perf.level === 'very-good') {
            return '';
        }
        
        let priorities = [];
        if (a.weakSubjects.length > 0) {
            priorities = a.weakSubjects.slice(0, 3).map(s => s.name);
        } else if (a.moderateSubjects.length > 0) {
            priorities = a.moderateSubjects.slice(0, 3).map(s => s.name);
        }
        
        let studyTime = '';
        if (this.educationalStage.includes('ابتدائي')) {
            studyTime = 'نصف ساعة إلى ساعة يومياً';
        } else if (this.educationalStage === 'متوسط') {
            studyTime = 'ساعة إلى ساعتين يومياً';
        } else if (this.educationalStage === 'إعدادي') {
            studyTime = 'ساعتين إلى ثلاث ساعات يومياً';
        } else {
            studyTime = 'ثلاث إلى أربع ساعات يومياً';
        }
        
        let goals = [];
        if (a.weakSubjects.length > 0) {
            goals.push(`تحسين درجة ${a.weakSubjects[0].name} بمقدار ${(this.thresholds.passThreshold - a.weakSubjects[0].average + 5).toFixed(0)} درجات`);
        }
        goals.push(`الحفاظ على نسبة حضور أعلى من 90%`);
        goals.push(`مراجعة دورية للمواد أسبوعياً`);
        
        return `
            <div class="report-section action-plan">
                <div class="section-header">
                    <i class="fas fa-clipboard-check"></i>
                    <h3>5️⃣ خطة عمل مخصصة</h3>
                </div>
                <div class="plan-content">
                    <div class="plan-section">
                        <h4><i class="fas fa-bullseye"></i> الأولويات</h4>
                        <ul class="plan-list">
                            ${priorities.length > 0 ? `<li>التركيز على: ${priorities.join('، ')}</li>` : '<li>الاستمرار في الأداء المتميز</li>'}
                        </ul>
                    </div>
                    <div class="plan-section">
                        <h4><i class="fas fa-clock"></i> وقت المذاكرة المناسب</h4>
                        <p class="study-time">${studyTime}</p>
                    </div>
                    <div class="plan-section">
                        <h4><i class="fas fa-tasks"></i> الأهداف قصيرة المدى</h4>
                        <ul class="goals-list">
                            ${goals.map(g => `<li>${g}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }
    
    generateStrategiesSection() {
        const stage = this.educationalStage;
        
        let strategies = [];
        let stageName = '';
        
        if (stage.includes('ابتدائي')) {
            stageName = 'المرحلة الابتدائية';
            strategies = [
                '<strong>تعلم باللعب:</strong> استخدام ألعاب تعليمية وتطبيقات تفاعلية',
                '<strong>التكرار:</strong> مراجعة الدروس بشكل متكرر وبسيط',
                '<strong>التحفيز:</strong> وضع أهداف صغيرة ومكافآت عند تحقيقها',
                '<strong>المساعدة:</strong> طلب مساعدة المعلم أو الأهل عند الحاجة'
            ];
        } else if (stage === 'متوسط') {
            stageName = 'المرحلة المتوسطة';
            strategies = [
                '<strong>تنظيم الوقت:</strong> وضع جدول مذاكرة منتظم',
                '<strong>التمارين:</strong> حل تمارين إضافية بعد كل درس',
                '<strong>المتابعة:</strong> مراجعة الدروس مع الأهل أسبوعياً',
                '<strong>الفهم:</strong> التركيز على فهم المفاهيم وليس الحفظ'
            ];
        } else if (stage === 'إعدادي') {
            stageName = 'المرحلة الإعدادية';
            strategies = [
                '<strong>الفهم التحليلي:</strong> تحليل الأسئلة وفهم المطلوب',
                '<strong>حل الأسئلة:</strong> التدرب على أسئلة السنوات السابقة',
                '<strong>تقوية الأساس:</strong> مراجعة الأساسيات قبل التقدم',
                '<strong>الملاحظات:</strong> تدوين ملاحظات واضحة للمراجعة'
            ];
        } else {
            stageName = 'المرحلة الثانوية';
            strategies = [
                '<strong>التخطيط:</strong> وضع خطة دراسية شاملة للفصل',
                '<strong>الاختبارات التجريبية:</strong> إجراء اختبارات تجريبية منتظمة',
                '<strong>إدارة الضغط:</strong> تقنيات للتنظيم وتجنب الضغط',
                '<strong>المراجعة:</strong> مراجعة شاملة قبل الاختبارات'
            ];
        }
        
        return `
            <div class="report-section strategies-section">
                <div class="section-header">
                    <i class="fas fa-chess"></i>
                    <h3>6️⃣ استراتيجيات مناسبة لـ ${stageName}</h3>
                </div>
                <div class="strategies-list">
                    ${strategies.map(s => `<div class="strategy-item"><i class="fas fa-check"></i> ${s}</div>`).join('')}
                </div>
            </div>
        `;
    }
    
    generateGuidanceSection() {
        const stage = this.educationalStage;
        
        let parentRole = '';
        
        if (stage.includes('ابتدائي')) {
            parentRole = 'مرافقة مستمرة وتهيئة بيئة هادئة للدراسة، استخدام التحفيز والمكافآت الصغيرة';
        } else if (stage === 'متوسط') {
            parentRole = 'متابعة يومية منتظمة، التحقق من الواجبات، تشجيع الاستقلالية';
        } else if (stage === 'إعدادي') {
            parentRole = 'توفير الدعم والتشجيع، مناقشة التحديات، منح الاستقلالية مع المتابعة';
        } else {
            parentRole = 'توفير بيئة مناسبة للدراسة، الدعم النفسي والتشجيع، احترام الخصوصية';
        }
        
        return `
            <div class="report-section guidance-section">
                <div class="section-header">
                    <i class="fas fa-hands-helping"></i>
                    <h3>7️⃣ توجيهات للمعلمين وأولياء الأمور</h3>
                </div>
                <div class="guidance-content">
                    <div class="guidance-card">
                        <h4><i class="fas fa-user-tie"></i> دور المعلمين</h4>
                        <ul>
                            <li>متابعة تقدم الطالب بشكل مستمر</li>
                            <li>توفير تغذية راجعة إيجابية وتشجيعية</li>
                            <li>مساعدة الطالب في تحديد نقاط القوة والضعف</li>
                            <li>توفير فرص إضافية للممارسة والتحسين</li>
                        </ul>
                    </div>
                    <div class="guidance-card">
                        <h4><i class="fas fa-user-friends"></i> دور أولياء الأمور</h4>
                        <ul>
                            <li>${parentRole}</li>
                            <li>الاهتمام بالحضور والانضباط المدرسي</li>
                            <li>توفير بيئة دراسية مناسبة في المنزل</li>
                            <li>التواصل المستمر مع المعلمين</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }
    
    generateMotivationSection() {
        const perf = this.getPerformanceLevel();
        const stage = this.educationalStage;
        
        let message = '';
        let ageGroup = '';
        
        if (stage.includes('ابتدائي')) {
            ageGroup = 'نجم المستقبل';
            if (perf.level === 'excellent') {
                message = 'أنت نجم متألق! كل خطوة تخطوها تجعلك أفضل. استمر في الاجتهاد، فالمستقبل الواعد ينتظرك!';
            } else if (perf.level === 'very-good') {
                message = 'عمل رائع! أنت على الطريق الصحيح. استمر في الاجتهاد، وستصل للقمة!';
            } else if (perf.level === 'good') {
                message = 'ممتاز! حاول زيادة جهدك قليلاً، وستصل للتفوق الذي تستحقه!';
            } else {
                message = 'لا تستسلم! كل محاولة جديدة هي خطوة نحو النجاح. أصدقاؤك والمعلمون معك!';
            }
        } else if (stage === 'متوسط') {
            ageGroup = 'بطل المرحلة';
            if (perf.level === 'excellent') {
                message = 'تستحق كل التقدير! تفوقك مبهر. استمر بنفس الهمة، فأنت تبني مستقبلك بيديك!';
            } else if (perf.level === 'very-good') {
                message = 'أداء متميز! اجتهادك ملحوظ. مع استمرارية الجهد، ستصل للقمّة!';
            } else if (perf.level === 'good') {
                message = 'أنت على الطريق الصحيح! كل يوم هو فرصة جديدة للتميز. ركّز واستمر!';
            } else {
                message = 'تستطيع تحقيق الكثير! البداية متأخرة أفضل من عدم البدء. ابدأ اليوم!';
            }
        } else if (stage === 'إعدادي') {
            ageGroup = 'طموح المستقبل';
            if (perf.level === 'excellent') {
                message = 'تفوقك استثنائي! هذا نتيجة اجتهادك. فخور بك وبإنجازاتك المميزة!';
            } else if (perf.level === 'very-good') {
                message = 'أداء رائع! أنت تبني أساساً قوياً لمستقبلك. استمر بالتقدم!';
            } else if (perf.level === 'good') {
                message = 'أنت في الطريق الصحيح! كل خطوة تقرّبك من أهدافك. ركّز واستمر!';
            } else {
                message = 'المستقبل أمامك! لا تتردد في طلب المساعدة. مع الجهد المستمر، ستنجح!';
            }
        } else {
            ageGroup = 'قائد الغد';
            if (perf.level === 'excellent') {
                message = 'مستواك مذهل! أنت على أتمّ الاستعداد للمرحلة القادمة. فخور بإنجازاتك!';
            } else if (perf.level === 'very-good') {
                message = 'عمل رائع! اجتهادك سيؤتي ثماره. استمر في التحدي والتطور!';
            } else if (perf.level === 'good') {
                message = 'أنت قادر على المزيد! استثمر وقتك وطاقتك بشكل أفضل، وستصل للتميز!';
            } else {
                message = 'لا تنيأس! كل تحدٍّ هو فرصة للنمو. ابدأ من الآن، والإصرار هو مفتاح النجاح!';
            }
        }
        
        return `
            <div class="report-section motivation-section">
                <div class="section-header">
                    <i class="fas fa-heart"></i>
                    <h3>8️⃣ خلاصة تحفيزية</h3>
                </div>
                <div class="motivation-content">
                    <div class="motivation-badge">${ageGroup}</div>
                    <div class="motivation-message">${message}</div>
                    <div class="motivation-focus">
                        <i class="fas fa-lightbulb"></i>
                        تذكّر: <strong>التطور</strong> أهم من المقارنة. أنت الأفضل عندما تكون أفضل من نفسك yesterday!
                    </div>
                </div>
            </div>
        `;
    }
}

// Load and display comprehensive report
async function loadComprehensiveReport() {
    const container = document.getElementById('comprehensiveReportContainer');
    if (!container) return;
    
    if (!currentStudent) {
        container.innerHTML = '<div class="report-error"><p>يرجى تسجيل الدخول أولاً</p></div>';
        return;
    }
    
    try {
        // Get class averages for comparison
        let classAverages = {};
        const gradeLevel = currentStudent.grade || '';
        
        try {
            const response = await fetch(`/api/school/${currentStudent.school_id}/class-averages?grade=${encodeURIComponent(gradeLevel)}`);
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    classAverages = result.averages || {};
                }
            }
        } catch (e) {
            console.log('Class averages not available');
        }
        
        const thresholds = getThresholdsForStudent(currentStudent);
        const maxGrade = thresholds.maxGrade;
        const detailedScores = parseJSON(currentStudent.detailed_scores);
        const dailyAttendance = parseJSON(currentStudent.daily_attendance);
        
        if (Object.keys(detailedScores).length === 0) {
            container.innerHTML = '<div class="report-empty"><i class="fas fa-info-circle"></i><p>لا توجد درجات مسجلة حتى الآن. سيتم إنشاء التقرير عند توفر البيانات.</p></div>';
            return;
        }
        
        const report = new ComprehensiveEducationalReport(
            currentStudent,
            detailedScores,
            dailyAttendance,
            classAverages,
            maxGrade,
            thresholds
        );
        
        container.innerHTML = report.generateFullHTML();
        
    } catch (error) {
        console.error('Error loading report:', error);
        container.innerHTML = '<div class="report-error"><p>حدث خطأ في تحميل التقرير</p></div>';
    }
}

// عرض الحضور
function displayAttendance() {
    const attendance = parseJSON(currentStudent.attendance);
    const dailyAttendance = parseJSON(currentStudent.daily_attendance);
    const tbody = document.getElementById('attendanceTableBody');
    
    if (!tbody) return;

    // Use daily_attendance if available
    if (Object.keys(dailyAttendance).length > 0) {
        const sortedDates = Object.keys(dailyAttendance).sort().reverse();
        
        const rows = sortedDates.map(date => {
            const dayData = dailyAttendance[date];
            let statusText = 'حاضر';
            let statusClass = 'status-present';
            
            // Check if any subject shows absent
            const subjects = Object.keys(dayData);
            const absentCount = subjects.filter(s => dayData[s] === 'غائب').length;
            const totalSubjects = subjects.length;
            
            if (absentCount === totalSubjects) {
                statusText = 'غائب';
                statusClass = 'status-absent';
            } else if (absentCount > 0) {
                statusText = `حضور جزئي (${totalSubjects - absentCount}/${totalSubjects})`;
                statusClass = 'status-partial';
            }
            
            return `
                <tr>
                    <td>${formatDate(date)}</td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                    <td>${subjects.length > 0 ? subjects.join(', ') : '-'}</td>
                </tr>
            `;
        }).join('');
        
        tbody.innerHTML = rows || '<tr><td colspan="3">لا يوجد سجل حضور</td></tr>';
    } else {
        // Use simple attendance
        const sortedDates = Object.keys(attendance).sort().reverse();
        
        const rows = sortedDates.map(date => `
            <tr>
                <td>${formatDate(date)}</td>
                <td><span class="status-${attendance[date] ? 'present' : 'absent'}">
                    ${attendance[date] ? 'حاضر' : 'غائب'}
                </span></td>
                <td>-</td>
            </tr>
        `).join('');

        tbody.innerHTML = rows || '<tr><td colspan="3">لا يوجد سجل حضور</td></tr>';
    }
}

// تسجيل الخروج
function logout() {
    localStorage.removeItem('student');
    window.location.reload();
}

// مساعدة في معالجة JSON
function parseJSON(str) {
    try {
        if (typeof str === 'object' && str !== null) return str;
        return JSON.parse(str || '{}');
    } catch {
        return {};
    }
}

// تنسيق التاريخ
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-SA');
}

// الحصول على التقدير (legacy support)
function getGradeText(score) {
    const thresholds = currentStudent ? getThresholdsForStudent(currentStudent) : GRADE_THRESHOLDS.scale100;
    const status = getGradeStatus(score, thresholds);
    return status.text;
}

// الحصول على فئة التقدير (legacy support)
function getGradeClass(score) {
    const thresholds = currentStudent ? getThresholdsForStudent(currentStudent) : GRADE_THRESHOLDS.scale100;
    const status = getGradeStatus(score, thresholds);
    return status.cssClass.replace('grade-', '');
}

// ============================================================================
// ACADEMIC YEAR MANAGEMENT FOR STUDENT PORTAL
// ============================================================================

// Load academic years for the student's school
// The current year is automatically determined by the server based on the present date
async function loadAcademicYears() {
    if (!currentStudent || !currentStudent.school_id) {
        console.log('No student or school_id available');
        return;
    }

    try {
        const response = await fetch(`/api/school/${currentStudent.school_id}/academic-years`);
        const result = await response.json();

        if (result.success && result.academic_years && result.academic_years.length > 0) {
            academicYears = result.academic_years;
            
            // Find current academic year (automatically determined by server based on date)
            const currentYear = academicYears.find(y => y.is_current === 1) || academicYears[0];
            
            if (currentYear) {
                currentAcademicYearId = currentYear.id;
                selectedAcademicYearId = currentYear.id;
            }

            updateAcademicYearSelector();
            
            // Show the selector if it exists
            const selectorContainer = document.getElementById('academicYearSelectorContainer');
            if (selectorContainer) {
                selectorContainer.style.display = 'flex';
            }
            
            // Load grades from student_grades table for current academic year
            // This ensures teacher-entered grades are displayed
            if (currentAcademicYearId) {
                await loadCurrentYearGrades();
            }
        }
    } catch (error) {
        console.error('Error loading academic years:', error);
    }
}

// Load grades for the current academic year from the student_grades table
async function loadCurrentYearGrades() {
    if (!currentStudent || !currentAcademicYearId) return;
    
    try {
        const response = await fetch(`/api/student/${currentStudent.id}/grades/${currentAcademicYearId}`);
        const result = await response.json();
        
        if (result.success && result.raw_grades && result.raw_grades.length > 0) {
            // Store grades for display
            currentStudent.gradesFromAPI = result.raw_grades;
        }
    } catch (error) {
        console.error('Error loading current year grades:', error);
    }
}

// Update academic year selector dropdown
// The current year is marked automatically based on the present date
function updateAcademicYearSelector() {
    const select = document.getElementById('academicYearSelect');
    if (!select) return;
    
    select.innerHTML = '';

    academicYears.forEach(year => {
        const isCurrent = year.is_current === 1;
        const option = document.createElement('option');
        option.value = year.id;
        option.textContent = isCurrent ? `${year.name} (الحالية)` : year.name;
        if (isCurrent || currentAcademicYearId === year.id) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // If we have a current year, select it
    if (currentAcademicYearId) {
        select.value = currentAcademicYearId;
        selectedAcademicYearId = currentAcademicYearId;
    }

    updateAcademicYearBadge();
}

// Update academic year badge display
function updateAcademicYearBadge() {
    const badge = document.getElementById('academicYearBadge');
    const badgeText = document.getElementById('academicYearBadgeText');
    
    if (!badge || !badgeText) return;

    if (selectedAcademicYearId === 'current' || !selectedAcademicYearId) {
        badge.style.display = 'none';
    } else {
        const selectedYear = academicYears.find(y => y.id == selectedAcademicYearId);
        if (selectedYear) {
            badgeText.textContent = selectedYear.name;
            badge.style.display = 'inline-block';
        }
    }
}

// Handle academic year change
async function onAcademicYearChange() {
    const select = document.getElementById('academicYearSelect');
    if (!select) return;
    
    selectedAcademicYearId = select.value;

    updateAcademicYearBadge();

    // If "current" is selected or we have the current year selected, load default data
    if (selectedAcademicYearId === 'current' || selectedAcademicYearId == currentAcademicYearId) {
        displayStudentData();
    } else {
        // Load data for the selected academic year
        await loadDataForAcademicYear(selectedAcademicYearId);
    }
}

// Load grades and attendance for a specific academic year
async function loadDataForAcademicYear(yearId) {
    if (!currentStudent) return;

    try {
        // Load grades for the year
        const gradesResponse = await fetch(`/api/student/${currentStudent.id}/grades/${yearId}`);
        const gradesResult = await gradesResponse.json();

        // Load attendance for the year
        const attendanceResponse = await fetch(`/api/student/${currentStudent.id}/attendance/${yearId}`);
        const attendanceResult = await attendanceResponse.json();

        // Display data - use raw_grades array for detailed display
        if (gradesResult.success && gradesResult.raw_grades && gradesResult.raw_grades.length > 0) {
            displayScoresForYear(gradesResult.raw_grades);
        } else {
            const tbody = document.getElementById('scoresTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4">لا توجد درجات مسجلة لهذه السنة الدراسية</td></tr>';
            }
        }

        if (attendanceResult.success && attendanceResult.attendance && attendanceResult.attendance.length > 0) {
            displayAttendanceForYear(attendanceResult.attendance);
        } else {
            const tbody = document.getElementById('attendanceTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="3">لا توجد سجلات حضور لهذه السنة الدراسية</td></tr>';
            }
        }

        // Update recommendations for this year's data
        if (gradesResult.success && gradesResult.raw_grades && gradesResult.raw_grades.length > 0) {
            updateRecommendationsForYear(gradesResult.raw_grades);
        }

    } catch (error) {
        console.error('Error loading data for academic year:', error);
    }
}

// Display grades for a specific academic year
function displayScoresForYear(grades) {
    const tbody = document.getElementById('scoresTableBody');
    if (!tbody) return;

    const thresholds = getThresholdsForStudent(currentStudent);
    const maxGrade = thresholds.maxGrade;

    if (grades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">لا توجد درجات مسجلة لهذه السنة</td></tr>';
        return;
    }

    const rows = grades.map(grade => {
        const scores = {
            month1: grade.month1 || 0,
            month2: grade.month2 || 0,
            midterm: grade.midterm || 0,
            month3: grade.month3 || 0,
            month4: grade.month4 || 0,
            final: grade.final || 0
        };

        // Calculate average
        let total = 0;
        let count = 0;
        for (const period in scores) {
            if (scores[period] > 0) {
                total += scores[period];
                count++;
            }
        }
        const avg = count > 0 ? total / count : 0;
        const status = getGradeStatus(avg, thresholds);

        return `
            <tr>
                <td>${escapeHtml(grade.subject_name)}</td>
                <td>${avg.toFixed(1)}/${maxGrade}</td>
                <td><span class="${status.cssClass}">${status.text}</span></td>
                <td>${escapeHtml(status.recommendation)}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rows;
}

// Display attendance for a specific academic year
function displayAttendanceForYear(attendanceRecords) {
    const tbody = document.getElementById('attendanceTableBody');
    if (!tbody) return;

    if (attendanceRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">لا توجد سجلات حضور لهذه السنة</td></tr>';
        return;
    }

    // Sort by date descending
    attendanceRecords.sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date));

    const rows = attendanceRecords.map(record => {
        let statusText = 'حاضر';
        let statusClass = 'status-present';

        if (record.status === 'absent') {
            statusText = 'غائب';
            statusClass = 'status-absent';
        } else if (record.status === 'late') {
            statusText = 'متأخر';
            statusClass = 'status-late';
        } else if (record.status === 'excused') {
            statusText = 'معذور';
            statusClass = 'status-excused';
        }

        return `
            <tr>
                <td>${formatDate(record.attendance_date)}</td>
                <td><span class="${statusClass}">${statusText}</span></td>
                <td>${record.notes || '-'}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rows;
}

// Update recommendations for a specific academic year
function updateRecommendationsForYear(grades) {
    // Convert grades array to detailed_scores format
    const detailedScores = {};
    grades.forEach(grade => {
        detailedScores[grade.subject_name] = {
            month1: grade.month1 || 0,
            month2: grade.month2 || 0,
            midterm: grade.midterm || 0,
            month3: grade.month3 || 0,
            month4: grade.month4 || 0,
            final: grade.final || 0
        };
    });

    const recommendationsContainer = document.getElementById('recommendationsContainer');
    if (!recommendationsContainer) return;

    if (Object.keys(detailedScores).length === 0) {
        recommendationsContainer.innerHTML = '<div class="recommendations-section"><p>لا توجد درجات مسجلة لهذه السنة</p></div>';
        return;
    }

    const thresholds = getThresholdsForStudent(currentStudent);
    const maxGrade = thresholds.maxGrade;

    const advisor = new StudentAcademicAdvisor(detailedScores, maxGrade, thresholds);
    recommendationsContainer.innerHTML = advisor.generateFullHTML();
}