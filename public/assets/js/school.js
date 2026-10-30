// assets/js/school.js
let currentSchool = null;
let students = [];
let subjects = [];
let teachers = []; // Store teachers list
let gradeTeachers = {}; // Store teachers by grade level
let gradeSubjects = {}; // Store subjects by grade level
let currentStudentId = null;
let selectedGradeLevel = null;

// Academic Year Management
let academicYears = [];
let currentAcademicYear = null;
let selectedAcademicYearId = null;

// Helper function to get auth headers
function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

// Grade trend analysis constants
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
    
    // Get grades in chronological order
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
    
    // No grades recorded
    if (firstNonZeroIndex === -1) {
        return {
            trend: 'none',
            hasImprovement: false,
            hasDeterioration: false,
            recommendations: [],
            significantChanges: [],
            latestGrade: 0,
            firstGrade: 0,
            consistency: 'unknown'
        };
    }
    
    // Get non-zero grades for analysis
    const nonZeroGrades = gradeSequence.filter(g => g.grade > 0);
    const firstGrade = nonZeroGrades[0];
    const latestGrade = nonZeroGrades[nonZeroGrades.length - 1];
    
    // Calculate grade changes
    let significantChanges = [];
    let hasSignificantImprovement = false;
    let hasSignificantDeterioration = false;
    let hadZeroBeforeGoodGrade = false;
    
    // Check for zeros before good grades (improvement from 0)
    for (let i = 0; i < gradeSequence.length; i++) {
        const current = gradeSequence[i];
        
        // Check if there's a zero before a later non-zero grade
        if (current.grade === 0 && i < lastNonZeroIndex) {
            // Find the next non-zero grade
            for (let j = i + 1; j < gradeSequence.length; j++) {
                if (gradeSequence[j].grade > 0) {
                    const nextGrade = gradeSequence[j];
                    if (nextGrade.grade >= thresholds.safeThreshold) {
                        hadZeroBeforeGoodGrade = true;
                        significantChanges.push({
                            type: 'improvement-from-zero',
                            from: { period: current.period, grade: 0 },
                            to: { period: nextGrade.period, grade: nextGrade.grade },
                            message: `تحسن ملحوظ: من 0 في ${PERIOD_NAMES[current.period]} إلى ${nextGrade.grade}/${maxGrade} في ${PERIOD_NAMES[nextGrade.period]}`
                        });
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
        const change = curr.grade - prev.grade;
        const changePercent = (change / maxGrade) * 100;
        
        // Significant improvement (30% or more increase)
        if (changePercent >= 30) {
            hasSignificantImprovement = true;
            significantChanges.push({
                type: 'improvement',
                from: { period: prev.period, grade: prev.grade },
                to: { period: curr.period, grade: curr.grade },
                change: change,
                message: `تحسن كبير: من ${prev.grade}/${maxGrade} في ${PERIOD_NAMES[prev.period]} إلى ${curr.grade}/${maxGrade} في ${PERIOD_NAMES[curr.period]}`
            });
        }
        
        // Significant deterioration (30% or more decrease)
        if (changePercent <= -30) {
            hasSignificantDeterioration = true;
            significantChanges.push({
                type: 'deterioration',
                from: { period: prev.period, grade: prev.grade },
                to: { period: curr.period, grade: curr.grade },
                change: change,
                message: `تراجع ملحوظ: من ${prev.grade}/${maxGrade} في ${PERIOD_NAMES[prev.period]} إلى ${curr.grade}/${maxGrade} في ${PERIOD_NAMES[curr.period]}`
            });
        }
    }
    
    // Calculate overall trend
    let trend = 'stable';
    const overallChange = latestGrade.grade - firstGrade.grade;
    const overallChangePercent = (overallChange / maxGrade) * 100;
    
    if (overallChangePercent >= 20) trend = 'improving';
    else if (overallChangePercent <= -20) trend = 'declining';
    
    // Check consistency (standard deviation of grades)
    const avgGrade = nonZeroGrades.reduce((sum, g) => sum + g.grade, 0) / nonZeroGrades.length;
    const variance = nonZeroGrades.reduce((sum, g) => sum + Math.pow(g.grade - avgGrade, 2), 0) / nonZeroGrades.length;
    const stdDev = Math.sqrt(variance);
    const consistencyRatio = stdDev / maxGrade;
    
    let consistency = 'consistent';
    if (consistencyRatio > 0.25) consistency = 'inconsistent';
    else if (consistencyRatio > 0.15) consistency = 'variable';
    
    // Generate trend-based recommendations
    let recommendations = [];
    
    // Check for zero grades followed by high grades
    if (hadZeroBeforeGoodGrade) {
        recommendations.push('📈 تحسن ممتاز! استمر في هذا المسار الإيجابي مع الحفاظ على الاستمرارية في جميع الفترات.');
        if (consistency === 'inconsistent') {
            recommendations.push('⚠️ لاحظنا وجود درجة صفر في فترة سابقة - يجب التأكد من عدم تكرار ذلك للحفاظ على المستوى.');
        }
    }
    
    if (hasSignificantImprovement && !hadZeroBeforeGoodGrade) {
        recommendations.push('📈 تحسن ملحوظ في الأداء! استمر على هذا النهج الإيجابي.');
    }
    
    if (hasSignificantDeterioration) {
        recommendations.push('📉 تراجع ملحوظ في الأداء - يحتاج متابعة ودعم إضافي.');
    }
    
    if (consistency === 'inconsistent') {
        recommendations.push('⚡ الأداء غير مستقر - يُنصح بوضع خطة دراسية منتظمة للحفاظ على مستوى ثابت.');
    }
    
    if (trend === 'improving' && latestGrade.grade >= thresholds.safeThreshold) {
        recommendations.push('✅ المسار التصاعدي ممتاز! الطالب الآن في المنطقة الآمنة - استمر في الحفاظ على هذا المستوى.');
    }
    
    if (trend === 'declining' && latestGrade.grade < thresholds.safeThreshold) {
        recommendations.push('🚨 انتباه: مسار الدرجات تنازلي - يحتاج تدخل عاجل قبل تفاقم المشكلة.');
    }
    
    // Check for missed periods (zeros in between grades)
    const missedPeriods = [];
    for (let i = firstNonZeroIndex; i <= lastNonZeroIndex; i++) {
        if (gradeSequence[i].grade === 0) {
            missedPeriods.push(PERIOD_NAMES[gradeSequence[i].period]);
        }
    }
    
    if (missedPeriods.length > 0) {
        recommendations.push(`📋 فترات مفقودة: ${missedPeriods.join('، ')} - يجب معالجة هذه الفجوات.`);
    }
    
    return {
        trend,
        hasImprovement: hasSignificantImprovement || hadZeroBeforeGoodGrade,
        hasDeterioration: hasSignificantDeterioration,
        hadZeroBeforeGoodGrade,
        recommendations,
        significantChanges,
        latestGrade: latestGrade.grade,
        latestPeriod: latestGrade.period,
        firstGrade: firstGrade.grade,
        firstPeriod: firstGrade.period,
        avgGrade,
        consistency,
        missedPeriods,
        nonZeroCount: nonZeroGrades.length,
        totalPeriods: PERIOD_ORDER.length
    };
}

// ============================================================================
// PROFESSIONAL ACADEMIC RECOMMENDATION SYSTEM - ENHANCED
// ============================================================================

/**
 * Generate professional, concise academic recommendations
 * Clean, organized structure for quick scanning
 * Maximum 1-2 focused recommendations per section
 */
class AcademicRecommendationEngine {
    constructor(student, gradesData, maxGrade, thresholds) {
        this.student = student;
        this.grades = gradesData;
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

        for (const subject in this.grades) {
            const subjectGrades = this.grades[subject];
            const trend = analyzeGradeTrend(subjectGrades, this.maxGrade);
            
            let subjectTotal = 0;
            let subjectCount = 0;
            let periodGrades = [];

            PERIOD_ORDER.forEach(period => {
                const grade = parseInt(subjectGrades[period]) || 0;
                periodGrades.push({ period, grade });
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
                    periodGrades,
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
            totalSubjects: Object.keys(subjects).length,
            assessedPeriods: gradeCount
        };
    }

    getPerformanceLevel() {
        const pct = this.analysis.overallPercentage;
        if (pct >= 90) return { level: 'excellent', label: 'متميز', icon: 'fa-star', color: '#10b981', bgColor: '#d1fae5' };
        if (pct >= 80) return { level: 'very-good', label: 'جيد جداً', icon: 'fa-star-half-alt', color: '#3b82f6', bgColor: '#dbeafe' };
        if (pct >= 70) return { level: 'good', label: 'جيد', icon: 'fa-check-circle', color: '#22c55e', bgColor: '#dcfce7' };
        if (pct >= 60) return { level: 'satisfactory', label: 'مقبول', icon: 'fa-exclamation-circle', color: '#f59e0b', bgColor: '#fef3c7' };
        if (pct >= 50) return { level: 'at-risk', label: 'يحتاج متابعة', icon: 'fa-exclamation-triangle', color: '#f97316', bgColor: '#ffedd5' };
        return { level: 'critical', label: 'تدخل عاجل', icon: 'fa-times-circle', color: '#ef4444', bgColor: '#fee2e2' };
    }

    /**
     * Generate structured recommendations object
     * Maximum 1-2 items per section for conciseness
     */
    generateStructuredRecommendations() {
        const a = this.analysis;
        const perf = this.getPerformanceLevel();
        
        // Strengths - Max 2 items
        const strengths = [];
        if (a.strongSubjects.length > 0) {
            const top = a.strongSubjects[0];
            strengths.push({
                subject: top.name,
                detail: `${top.average.toFixed(1)}/${this.maxGrade}`,
                trend: top.trend.trend === 'improving' ? '📈' : ''
            });
            if (a.strongSubjects.length > 1) {
                const second = a.strongSubjects[1];
                strengths.push({
                    subject: second.name,
                    detail: `${second.average.toFixed(1)}/${this.maxGrade}`,
                    trend: second.trend.trend === 'improving' ? '📈' : ''
                });
            }
        } else if (a.improvingSubjects.length > 0) {
            const imp = a.improvingSubjects[0];
            strengths.push({
                subject: imp.name,
                detail: `تحسن (${imp.trend.firstGrade} → ${imp.trend.latestGrade})`,
                trend: '📈'
            });
        }
        if (strengths.length === 0) {
            strengths.push({ subject: 'جاري التقييم', detail: '', trend: '' });
        }

        // Areas for Improvement - Max 2 items
        const improvements = [];
        if (a.weakSubjects.length > 0) {
            const weak = a.weakSubjects[0];
            improvements.push({
                subject: weak.name,
                detail: `${weak.average.toFixed(1)}/${this.maxGrade}`,
                priority: 'عاجل'
            });
            if (a.weakSubjects.length > 1) {
                const weak2 = a.weakSubjects[1];
                improvements.push({
                    subject: weak2.name,
                    detail: `${weak2.average.toFixed(1)}/${this.maxGrade}`,
                    priority: 'عاجل'
                });
            }
        } else if (a.moderateSubjects.length > 0) {
            const mod = a.moderateSubjects[0];
            const gap = (this.thresholds.safeThreshold - mod.average).toFixed(1);
            improvements.push({
                subject: mod.name,
                detail: `يحتاج +${gap} نقطة`,
                priority: 'متوسط'
            });
        } else if (a.decliningSubjects.length > 0) {
            const dec = a.decliningSubjects[0];
            improvements.push({
                subject: dec.name,
                detail: `تراجع (${dec.trend.firstGrade} → ${dec.trend.latestGrade})`,
                priority: 'متوسط'
            });
        }
        if (improvements.length === 0) {
            improvements.push({ subject: 'لا توجد', detail: 'أداء جيد', priority: '' });
        }

        // Action Plan - Max 2 items
        const actions = [];
        if (perf.level === 'critical' || perf.level === 'at-risk') {
            actions.push('جدول دراسي يومي مكثف');
            actions.push('حضور دروس التقوية');
        } else if (perf.level === 'satisfactory') {
            actions.push('زيادة وقت المراجعة');
            actions.push('التركيز على المفاهيم الأساسية');
        } else if (perf.level === 'good' || perf.level === 'very-good') {
            actions.push('المحافظة على المستوى الحالي');
            actions.push('توسيع المعرفة');
        } else {
            actions.push('الاستمرار في التفوق');
            actions.push('المشاركة في الأنشطة الإثرائية');
        }

        // Priority subjects
        if (a.weakSubjects.length > 0) {
            const prioritySubjects = a.weakSubjects.slice(0, 2).map(s => s.name).join('، ');
            // Replace second action with priority subjects
            actions[1] = `التركيز على: ${prioritySubjects}`;
        }

        return {
            performance: {
                level: perf.level,
                label: perf.label,
                icon: perf.icon,
                color: perf.color,
                bgColor: perf.bgColor,
                average: `${a.overallAvg.toFixed(1)}/${this.maxGrade}`,
                percentage: `${a.overallPercentage.toFixed(0)}%`
            },
            strengths: strengths,
            improvements: improvements,
            actions: actions
        };
    }

    /**
     * Generate clean HTML for recommendations
     * Professional card-based layout
     */
    generateHTML() {
        const rec = this.generateStructuredRecommendations();
        const p = rec.performance;
        
        return `
            <div class="academic-guidance">
                <!-- Performance Summary Card -->
                <div class="guidance-card performance-card" style="background: ${p.bgColor}; border-right: 4px solid ${p.color};">
                    <div class="card-header">
                        <i class="fas ${p.icon}" style="color: ${p.color};"></i>
                        <span class="performance-label" style="color: ${p.color};">${p.label}</span>
                    </div>
                    <div class="card-content">
                        <span class="performance-value">${p.average}</span>
                        <span class="performance-percentage">(${p.percentage})</span>
                    </div>
                </div>

                <div class="guidance-grid">
                    <!-- Strengths Card -->
                    <div class="guidance-card strengths-card">
                        <div class="card-title">
                            <i class="fas fa-thumbs-up"></i>
                            نقاط القوة
                        </div>
                        <ul class="guidance-list">
                            ${rec.strengths.map(s => `
                                <li>
                                    <span class="subject-name">${escapeHtml(s.subject)}</span>
                                    <span class="subject-detail">${escapeHtml(s.detail)} ${s.trend}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <!-- Improvements Card -->
                    <div class="guidance-card improvements-card">
                        <div class="card-title">
                            <i class="fas fa-bullseye"></i>
                            مجالات التطوير
                        </div>
                        <ul class="guidance-list">
                            ${rec.improvements.map(i => `
                                <li>
                                    <span class="subject-name">${escapeHtml(i.subject)}</span>
                                    ${i.priority ? `<span class="priority-badge">${i.priority}</span>` : ''}
                                    <span class="subject-detail">${escapeHtml(i.detail)}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <!-- Action Plan Card -->
                    <div class="guidance-card actions-card">
                        <div class="card-title">
                            <i class="fas fa-tasks"></i>
                            خطة العمل
                        </div>
                        <ul class="guidance-list action-list">
                            ${rec.actions.map(a => `
                                <li>
                                    <i class="fas fa-chevron-left"></i>
                                    ${a}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    generateFullReport() {
        // Return structured HTML for display
        return this.generateHTML();
    }
}

function generateProfessionalRecommendations(student, grades, maxGrade, thresholds) {
    const engine = new AcademicRecommendationEngine(student, grades, maxGrade, thresholds);
    return engine.generateFullReport();
}

// AI Performance Prediction Model
class PerformanceModel {
    predictPerformance(student) {
        if (!student || !student.grades) return { 
            level: 'average', 
            score: 0, 
            recommendations: ['لا توجد بيانات كافية'],
            riskLevel: 'unknown',
            subjectTrends: {},
            passFailPrediction: { status: 'غير محدد', confidence: 0, message: 'لا توجد بيانات كافية', icon: '❓' },
            subjectPredictions: {}
        };
        
        let totalGrades = 0;
        let gradeCount = 0;
        let maxGrade = getMaxGradeForStudent(student);
        let poorSubjects = [];
        let atRiskSubjects = [];
        let safeSubjects = [];
        let subjectTrends = {};
        let improvingSubjects = [];
        let decliningSubjects = [];
        let inconsistentSubjects = [];
        let subjectPredictions = {};
        
        // Get thresholds for this student's grade level
        const thresholds = getGradeThresholds(student);
        
        for (const subject in student.grades) {
            const subjectGrades = student.grades[subject];
            let subjectTotal = 0;
            let subjectGradeCount = 0;
            let latestGrade = 0;
            
            // Analyze trend for this subject
            const trendAnalysis = analyzeGradeTrend(subjectGrades, maxGrade);
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
                    latestGrade = grade;
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
                
                // Classify subjects based on thresholds
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

        // Calculate average as percentage of max grade
        const avg = gradeCount > 0 ? (totalGrades / (gradeCount * maxGrade)) * 100 : 0;
        const rawAvg = gradeCount > 0 ? totalGrades / gradeCount : 0;
        
        let level = 'average';
        let riskLevel = 'safe';

        // Determine performance level based on grade scale
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

        // Generate professional comprehensive recommendations
        const recommendations = generateProfessionalRecommendations(student, student.grades, maxGrade, thresholds);

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

    // Predict future grades for a subject based on trend analysis
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
        
        // Get existing grades
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

        // If all periods have grades, no prediction needed
        if (missingPeriods.length === 0) {
            return {
                currentAverage: trendAnalysis.avgGrade || 0,
                predictedAverage: trendAnalysis.avgGrade || 0,
                missingPeriods: [],
                forecast: {}
            };
        }

        // Calculate prediction based on trend
        let predictedGrade = trendAnalysis.latestGrade || trendAnalysis.avgGrade || (maxGrade * 0.6);
        
        // Adjust based on trend direction
        if (trendAnalysis.trend === 'improving') {
            predictedGrade = Math.min(maxGrade, predictedGrade * 1.05); // 5% improvement
        } else if (trendAnalysis.trend === 'declining') {
            predictedGrade = Math.max(0, predictedGrade * 0.95); // 5% decline
        }

        // Generate forecast for missing periods
        const forecast = {};
        missingPeriods.forEach(period => {
            // Add some variation to make predictions more realistic
            const variation = (Math.random() - 0.5) * (maxGrade * 0.1); // ±5% variation
            let periodPrediction = Math.round(Math.max(0, Math.min(maxGrade, predictedGrade + variation)));
            
            // Ensure passing grade if student is improving
            if (trendAnalysis.trend === 'improving' && periodPrediction < maxGrade * 0.5) {
                periodPrediction = Math.round(maxGrade * 0.55);
            }
            
            forecast[period] = {
                grade: periodPrediction,
                periodName: periodNames[period]
            };
        });

        // Calculate predicted final average
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

    // Calculate pass/fail prediction based on current performance and trends
    calculatePassFailPrediction(rawAvg, thresholds, subjectPredictions, poorCount, atRiskCount, safeCount) {
        const totalSubjects = poorCount + atRiskCount + safeCount;
        if (totalSubjects === 0) return { status: 'غير محدد', confidence: 0, message: 'لا توجد بيانات كافية', icon: '❓' };

        // Calculate weighted prediction based on subject categories
        const poorWeight = poorCount * 0;
        const atRiskWeight = atRiskCount * 0.5;
        const safeWeight = safeCount * 1;
        const passProbability = (poorWeight + atRiskWeight + safeWeight) / totalSubjects;

        // Analyze predicted averages
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

        // Determine final prediction
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
            // Below passing threshold
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

    predictStudentOutcomes(students) {
        const results = students.map(s => ({
            student: s,
            prediction: this.predictPerformance(s)
        }));

        const topPerformers = results.filter(r => r.prediction.level === 'excellent' || r.prediction.level === 'good')
            .sort((a, b) => b.prediction.score - a.prediction.score);
        
        const atRiskStudents = results.filter(r => r.prediction.riskLevel === 'at-risk')
            .sort((a, b) => a.prediction.score - b.prediction.score);
        
        const strugglingStudents = results.filter(r => r.prediction.level === 'needs-improvement')
            .sort((a, b) => a.prediction.score - b.prediction.score);

        return { topPerformers, atRiskStudents, strugglingStudents };
    }
}

function generateRecommendations(avgPerformance, avgGrade, attendanceRate) {
    const recommendations = [];
    const grade = parseFloat(avgGrade) || 0;
    const attendance = parseFloat(attendanceRate) || 0;
    
    if (grade < 60) recommendations.push('ضرورة تفعيل دروس التقوية في المواد الأساسية');
    if (attendance < 85) recommendations.push('التواصل مع أولياء أمور الطلاب المتغيبين لتحسين نسبة الحضور');
    if (avgPerformance > 80) recommendations.push('إقامة حفل تكريم للطلاب المتفوقين لتحفيز البقية');
    
    if (recommendations.length === 0) {
        recommendations.push('الاستمرار في متابعة الخطط الدراسية الحالية');
        recommendations.push('تشجيع الطلاب على المشاركة في الأنشطة الصفية');
    }
    
    return recommendations;
}

let aiModel = new PerformanceModel();

// Display performance insights in the grades modal
function displayPerformanceInsights(student) {
    const model = new PerformanceModel();
    const prediction = model.predictPerformance(student);
    
    // Update main insight cards
    const avgGradeEl = document.getElementById('studentAvgGrade');
    const performanceEl = document.getElementById('studentPerformancePrediction');
    const passFailEl = document.getElementById('passFailPrediction');
    const recommendationsEl = document.getElementById('studentRecommendations');
    
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
        performanceEl.className = `insight-value ${prediction.riskLevel}`;
    }
    
    if (passFailEl) {
        passFailEl.textContent = `${prediction.passFailPrediction.icon} ${prediction.passFailPrediction.status}`;
        passFailEl.className = `insight-value ${prediction.passFailPrediction.status.includes('ناجح') ? 'safe' : 'fail'}`;
    }
    
    if (recommendationsEl) {
        recommendationsEl.innerHTML = prediction.recommendations;
    }
    
    // Show prediction details
    const predictionDetailsBox = document.getElementById('predictionDetailsBox');
    const predictionMessage = document.getElementById('predictionMessage');
    const predictionConfidence = document.getElementById('predictionConfidence');
    
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
    const forecastSection = document.getElementById('forecastSection');
    const forecastContainer = document.getElementById('forecastContainer');
    
    if (forecastSection && forecastContainer) {
        // Check if there are any forecasts to show
        let hasForecasts = false;
        let forecastHTML = '';
        
        for (const subject in prediction.subjectPredictions) {
            const pred = prediction.subjectPredictions[subject];
            if (pred.missingPeriods.length > 0) {
                hasForecasts = true;
                forecastHTML += `
                    <div class="forecast-subject" style="background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <h4 style="margin: 0 0 0.5rem 0; color: var(--brand-primary-700);">${subject}</h4>
                        <div style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
                            المتوسط الحالي: ${pred.currentAverage.toFixed(1)}/${prediction.maxGrade}
                        </div>
                        <div style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">
                            المتوسط المتوقع: ${pred.predictedAverage}/${prediction.maxGrade}
                        </div>
                        <div class="forecast-periods" style="margin-top: 0.5rem;">
                `;
                
                for (const period in pred.forecast) {
                    const forecast = pred.forecast[period];
                    forecastHTML += `
                        <div class="forecast-item" style="display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid #eee;">
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

// Chart instances
let gradesChart = null;
let attendanceChart = null;

// Grade levels mapping based on educational stage
// This will be populated dynamically from the database
let gradeLevels = [];

// Default grade levels for fallback (used when no custom grade levels are defined)
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

// Fix educational levels mapping to match HTML form options
let educationalLevels = {
    "ابتدائي": "ابتدائي",
    "متوسط": "متوسط",
    "ثانوي": "ثانوي",
    "إعدادي": "إعدادي"
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndLoadSchool();
    setupEventListeners();
    setupBulkRegistration();
    setupKeyboardShortcuts();
    loadData();
    
    // Add responsive behavior
    addResponsiveBehavior();
    
    // Setup academic year input auto-fill
    setupAcademicYearForm();
});

// Function to add responsive behavior to dynamically loaded content
function addResponsiveBehavior() {
    // Add resize listener for responsive charts
    window.addEventListener('resize', function() {
        if (gradesChart) {
            gradesChart.resize();
        }
        if (attendanceChart) {
            attendanceChart.resize();
        }
    });
    
    // Add touch support for mobile devices
    document.addEventListener('touchstart', function() {
        document.body.classList.add('touch-device');
    }, { once: true });
}

// Check authentication and load school data
function checkAuthAndLoadSchool() {
    const token = localStorage.getItem('token');
    const school = localStorage.getItem('school');
    
    if (!token || !school) {
        // Authentication required - redirect to login
        window.location.href = '/index.html';
        return;
    }
    
    try {
        currentSchool = JSON.parse(school);
        showDashboard();
        loadData(); // Make sure to load data after setting up the school
    } catch (error) {
        console.error('Error parsing school data:', error);
        // Try to fetch schools from API as fallback
        fetch('/api/schools', { headers: getAuthHeaders() })
            .then(response => response.json())
            .then(data => {
                if (data.success && data.schools && data.schools.length > 0) {
                    currentSchool = data.schools[0];
                    localStorage.setItem('school', JSON.stringify(currentSchool));
                } else {
                    // Last resort fallback
                    currentSchool = { id: 1, name: 'مدرسة تجريبية', code: 'SCH-573214-GSW' };
                }
                showDashboard();
                loadData(); // Make sure to load data after setting up the school
            })
            .catch(fetchError => {
                console.error('Error fetching schools as fallback:', fetchError);
                // Final fallback for testing
                currentSchool = { id: 1, name: 'مدرسة تجريبية', code: 'SCH-573214-GSW' };
                showDashboard();
                loadData(); // Make sure to load data after setting up the school
            });
    }
}

function setupEventListeners() {
    // Use event delegation for dynamically created forms
    document.getElementById('gradeLevelContent')?.addEventListener('submit', function(e) {
        // Handle student form submissions
        if (e.target.id && e.target.id.startsWith('addStudentForm-')) {
            addStudent(e);
        }
        // Handle bulk student form submissions
        else if (e.target.id && e.target.id.startsWith('bulkAddStudentForm-')) {
            // Extract grade level from form ID
            const gradeLevelId = e.target.id.replace('bulkAddStudentForm-', '');
            // Convert grade level ID back to original grade level
            const originalGradeLevel = gradeLevelId.replace(/-/g, ' ');
            addBulkStudents(e, originalGradeLevel);
        }
    });
    
    // Use event delegation for dynamically created subject forms
    // We're now using button clicks instead of form submission
    document.getElementById('gradeLevelContent')?.addEventListener('click', function(e) {
        // Handle button clicks for subject management
        if (e.target.closest('.subject-form-actions button')) {
            // Button is handled by onclick attributes
            return;
        }
    });
    
    // Add event listener for performance analytics button
    // No additional button event listeners needed as the buttons are now inline
}

function showDashboard() {
    const schoolNameElement = document.getElementById('schoolName');
    console.log('showDashboard called');
    console.log('schoolName element:', schoolNameElement);
    console.log('currentSchool:', currentSchool);
    
    if (schoolNameElement && currentSchool) {
        schoolNameElement.textContent = currentSchool.name;
        
        // عرض رمز المدرسة
        const schoolCodeElement = document.getElementById('schoolCodeDisplay');
        if (schoolCodeElement && currentSchool.code) {
            schoolCodeElement.textContent = currentSchool.code;
            schoolCodeElement.style.display = 'inline-block';
            schoolCodeElement.onclick = () => copyToClipboard(currentSchool.code);
        }
    }
    
    // Display current academic year
    updateCurrentYearDisplay();
    
    // Automatically load grade levels after authentication
    if (currentSchool && currentSchool.id) {
        loadGradeLevels();
    }
}

// Load grade levels immediately after authentication
async function loadGradeLevels() {
    if (!currentSchool || !currentSchool.id) return;
    
    try {
        // Fetch custom grade levels from the API
        const response = await fetch(`/api/school/${currentSchool.id}/grade-levels`, { headers: getAuthHeaders() });
        const result = await response.json();
        
        if (result.success && result.grade_levels && result.grade_levels.length > 0) {
            // Use custom grade levels from database
            gradeLevels = result.grade_levels.map(gl => gl.name);
        } else {
            // Fall back to default grade levels based on school level
            gradeLevels = defaultGradeLevels[currentSchool.level] || [];
        }
    } catch (error) {
        console.error('Error fetching grade levels:', error);
        // Fall back to default grade levels
        gradeLevels = defaultGradeLevels[currentSchool.level] || [];
    }
    
    // Generate HTML for grade levels
    renderGradeLevelsUI();
}

// Render grade levels UI
function renderGradeLevelsUI() {
    const schoolGradeLevels = gradeLevels;
    
    // Generate HTML for grade levels
    let html = `
        <div class="grade-levels-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;"><i class="fas fa-layer-group"></i> المستويات الدراسية</h3>
        </div>
        <div class="grades-grid">
    `;
    
    if (schoolGradeLevels.length === 0) {
        html += `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 2rem;">
                <i class="fas fa-graduation-cap" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                <p>لا توجد مستويات دراسية. انقر على "إضافة مستوى" للبدء.</p>
            </div>
        `;
    } else {
        // Add grade level cards
        schoolGradeLevels.forEach((grade, index) => {
            const combinedGradeLevel = `${currentSchool.level} - ${grade}`;
            html += `
                <div class="grade-card" onclick="selectGradeLevel('${grade}')">
                    <div class="grade-header">
                        <h4>${combinedGradeLevel}</h4>
                    </div>
                    <div class="grade-actions" style="display: flex; gap: 0.5rem;">
                        <button class="btn-small btn-primary" onclick="selectGradeLevel('${grade}'); event.stopPropagation();">
                            <i class="fas fa-arrow-circle-left"></i> اختيار
                        </button>
                        <button class="btn-small btn-danger" onclick="deleteGradeLevel('${grade}'); event.stopPropagation();" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    }
    
    html += `
        </div>
    `;
    
    document.getElementById('gradeLevelsContainer').innerHTML = html;
}

// Show modal to add a new grade level
function showAddGradeLevelModal() {
    const modalHtml = `
        <div id="addGradeLevelModal" class="modal" style="display: flex;">
            <div class="modal-content" style="max-width: 500px;">
                <span class="close-modal" onclick="closeAddGradeLevelModal()">&times;</span>
                <h3 class="modal-title"><i class="fas fa-plus"></i> إضافة مستوى دراسي جديد</h3>
                <form id="addGradeLevelForm" onsubmit="handleAddGradeLevel(event)">
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label>اسم المستوى الدراسي</label>
                        <input type="text" id="newGradeLevelName" class="form-control" required placeholder="مثال: الأول الابتدائي">
                    </div>
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label>ترتيب العرض (اختياري)</label>
                        <input type="number" id="newGradeLevelOrder" class="form-control" value="0" min="0">
                    </div>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">إضافة</button>
                </form>
                
                <hr style="margin: 1.5rem 0;">
                
                <h4>إضافة سريعة من القوالب الافتراضية</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                    <button type="button" class="btn-small btn-secondary" onclick="addDefaultGradeLevels('ابتدائي')">ابتدائي</button>
                    <button type="button" class="btn-small btn-secondary" onclick="addDefaultGradeLevels('متوسط')">متوسط</button>
                    <button type="button" class="btn-small btn-secondary" onclick="addDefaultGradeLevels('إعدادي')">إعدادي</button>
                    <button type="button" class="btn-small btn-secondary" onclick="addDefaultGradeLevels('ثانوي')">ثانوي</button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('addGradeLevelModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeAddGradeLevelModal() {
    const modal = document.getElementById('addGradeLevelModal');
    if (modal) modal.remove();
}

// Handle adding a new grade level
async function handleAddGradeLevel(event) {
    event.preventDefault();
    
    const name = document.getElementById('newGradeLevelName').value.trim();
    const displayOrder = parseInt(document.getElementById('newGradeLevelOrder').value) || 0;
    
    if (!name) {
        showNotification('يرجى إدخال اسم المستوى الدراسي', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/school/${currentSchool.id}/grade-level`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ name, display_order: displayOrder })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('تم إضافة المستوى الدراسي بنجاح', 'success');
            closeAddGradeLevelModal();
            loadGradeLevels(); // Refresh the list
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ', 'error');
        }
    } catch (error) {
        console.error('Error adding grade level:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Add default grade levels from a template
async function addDefaultGradeLevels(levelType) {
    const defaults = defaultGradeLevels[levelType];
    if (!defaults || defaults.length === 0) {
        showNotification('لا توجد قوالب لهذا النوع', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/school/${currentSchool.id}/grade-levels/bulk`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ grade_levels: defaults })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(result.message || 'تم إضافة المستويات الدراسية بنجاح', 'success');
            closeAddGradeLevelModal();
            loadGradeLevels(); // Refresh the list
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ', 'error');
        }
    } catch (error) {
        console.error('Error adding default grade levels:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Delete a grade level
async function deleteGradeLevel(gradeName) {
    if (!confirm(`هل أنت متأكد من حذف المستوى الدراسي "${gradeName}"?، سيؤثر هذا على الطلاب المسجلين في هذا المستوى.`)) {
        return;
    }
    
    try {
        // First, find the grade level ID
        const response = await fetch(`/api/school/${currentSchool.id}/grade-levels`, { headers: getAuthHeaders() });
        const result = await response.json();
        
        if (!result.success) {
            showNotification('حدث خطأ في البحث عن المستوى', 'error');
            return;
        }
        
        const gradeLevel = result.grade_levels.find(gl => gl.name === gradeName);
        if (!gradeLevel) {
            showNotification('لم يتم العثور على المستوى الدراسي', 'error');
            return;
        }
        
        const deleteResponse = await fetch(`/api/grade-level/${gradeLevel.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        const deleteResult = await deleteResponse.json();
        
        if (deleteResponse.ok) {
            showNotification('تم حذف المستوى الدراسي بنجاح', 'success');
            loadGradeLevels(); // Refresh the list
        } else {
            showNotification(deleteResult.error_ar || deleteResult.error || 'حدث خطأ', 'error');
        }
    } catch (error) {
        console.error('Error deleting grade level:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Select a grade level and load its content
function selectGradeLevel(gradeLevel) {
    // Create a combined grade level string that includes both the educational stage and the specific grade
    const combinedGradeLevel = `${currentSchool.level} - ${gradeLevel}`;
    selectedGradeLevel = combinedGradeLevel;
    loadGradeSubjectsForLevel(combinedGradeLevel, gradeLevel);
}

// Load subjects and students for a specific grade level
function loadGradeSubjectsForLevel(combinedGradeLevel, originalGradeLevel) {
    // Use the original grade level for data operations
    const gradeLevel = originalGradeLevel || combinedGradeLevel;
    
    if (!gradeLevel) {
        document.getElementById('gradeLevelContent').innerHTML = `
            <div class="placeholder-message">
                <p>يرجى اختيار صف لعرض الطلاب</p>
            </div>
        `;
        return;
    }
    
    // Filter students for the selected grade level and sort alphabetically
    const gradeLevelStudents = students
        .filter(student => {
            if (student.grade) {
                return student.grade === combinedGradeLevel;
            }
            return false;
        })
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    
    // Remove duplicates by creating a map with full_name as key
    const uniqueStudents = [];
    const seenNames = new Set();
    
    gradeLevelStudents.forEach(student => {
        if (!seenNames.has(student.full_name)) {
            seenNames.add(student.full_name);
            uniqueStudents.push(student);
        }
    });
    
    // Generate HTML for the grade level content - only students, no teacher/subject management
    let html = `
        <section class="section-card">
            <h2 class="h2-school section-title">
                <i class="fas fa-users"></i> الطلاب - ${combinedGradeLevel || gradeLevel}
                <span style="font-size: 0.9rem; color: var(--text-secondary);">(${uniqueStudents.length} طالب)</span>
            </h2>
            
            <div class="students-header" style="margin-bottom: 1rem;">
                <button type="button" class="btn-primary-school btn-small" onclick="showAddStudentForm('${gradeLevel}')">
                    <i class="fas fa-plus"></i> إضافة طالب
                </button>
                <button type="button" class="btn-primary-school btn-small" onclick="showBulkAddStudentForm('${gradeLevel}')">
                    <i class="fas fa-users"></i> إضافة جماعي
                </button>
                <button type="button" class="btn-primary-school btn-small" onclick="openMassPromotionModal()">
                    <i class="fas fa-users-cog"></i> ترقية جماعية
                </button>
            </div>
    `;
    
    if (uniqueStudents.length > 0) {
        html += `
            <div class="table-responsive">
                <table class="table-school table-enhanced">
                    <thead>
                        <tr>
                            <th class="th-school">#</th>
                            <th class="th-school">اسم الطالب</th>
                            <th class="th-school">القاعة</th>
                            <th class="th-school">رمز الطالب</th>
                            <th class="th-school">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        uniqueStudents.forEach((student, index) => {
            html += `
                <tr data-id="${student.id}">
                    <td>${index + 1}</td>
                    <td><strong>${escapeHtml(student.full_name)}</strong></td>
                    <td>${escapeHtml(student.room)}</td>
                    <td><code class="code-btn" onclick="copyToClipboard('${escapeHtml(student.student_code)}')">${student.student_code || '-'}</code></td>
                    <td>
                        <button class="btn-small btn-info" onclick="viewStudentInfo(${student.id})" title="معلومات الطالب">
                            <i class="fas fa-info-circle"></i>
                        </button>
                        <button class="btn-small btn-primary" onclick="openGradesModal(${student.id})" title="إضافة درجات">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn-small btn-success" onclick="viewStudentAttendance(${student.id})" title="الحضور">
                            <i class="fas fa-calendar-check"></i>
                        </button>
                        <button class="btn-small btn-warning" onclick="openPromotionModal(${student.id})" title="ترقية الطالب">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button class="btn-small btn-secondary" onclick="editStudent(${student.id})" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-small btn-danger" onclick="deleteStudent(${student.id})" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    } else {
        html += `
            <div class="empty-state" style="text-align: center; padding: 3rem; color: var(--gray-500);">
                <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <p>لا يوجد طلاب مسجلين في هذا الصف</p>
                <small>اضغط على "إضافة طالب" لإضافة طلاب جدد</small>
            </div>
        `;
    }
    
    html += `
        </section>
    `;
    
    document.getElementById('gradeLevelContent').innerHTML = html;
    
    // Make functions available globally
    window.showAddStudentForm = showAddStudentForm;
    window.showBulkAddStudentForm = showBulkAddStudentForm;
    window.viewStudentInfo = viewStudentInfo;
    window.viewStudentGrades = viewStudentGrades;
    window.viewStudentAttendance = viewStudentAttendance;
    window.editStudent = editStudent;
    window.deleteStudent = deleteStudent;
}

// Make sure the function is available globally
window.selectGradeLevel = selectGradeLevel;
window.editSubject = editSubject;
window.deleteSubject = deleteSubject;
window.openSubjectsModal = openSubjectsModal;

// Add this to window for debugging
window.debugInfo = function() {
    console.log('Current school:', currentSchool);
    console.log('Students array:', students);
    console.log('Subjects array:', subjects);
    console.log('Table body element:', document.getElementById('studentsTableBody'));
};

function loadData() {
    // Load academic years first
    loadAcademicYears();
    
    // Load subjects from server instead of localStorage
    fetchSubjects();
    
    // Load students from server
    fetchStudents();
    
    // Load teachers from server
    fetchTeachers();
    
    // Load sections (simulated for now)
    loadSections();
}

// Load sections for each grade level
function loadSections() {
    // In a real implementation, this would fetch sections from the server
    // For now, we'll simulate sections based on existing students
    sections = {};
    
    // Group students by grade level and extract unique rooms as sections
    students.forEach(student => {
        if (student.grade && student.room) {
            if (!sections[student.grade]) {
                sections[student.grade] = [];
            }
            
            // Add room as section if not already added
            if (!sections[student.grade].some(sec => sec.name === student.room)) {
                sections[student.grade].push({ name: student.room });
            }
        }
    });
}

// Fetch subjects from server
async function fetchSubjects() {
    if (!currentSchool || !currentSchool.id) return;
    
    try {
        const response = await fetch(`/api/school/${currentSchool.id}/subjects`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const result = await response.json();
            if (result && result.subjects && Array.isArray(result.subjects)) {
                subjects = result.subjects;
                // Group subjects by grade level and sort alphabetically
                gradeSubjects = {};
                subjects.forEach(subject => {
                    const gl = subject.grade_level || 'عامة';
                    if (!gradeSubjects[gl]) {
                        gradeSubjects[gl] = [];
                    }
                    gradeSubjects[gl].push(subject);
                });
                
                // Sort subjects alphabetically within each grade level (like teachers)
                for (const gradeLevel in gradeSubjects) {
                    gradeSubjects[gradeLevel].sort((a, b) => 
                        a.name.localeCompare(b.name, 'ar')
                    );
                }
                
                // Refresh subject management table if modal is open
                if (typeof refreshSubjectsTable === 'function') refreshSubjectsTable();
                
                // If a grade level is already selected, refresh its content
                if (selectedGradeLevel) {
                    // Extract the original grade level from the combined grade level
                    const parts = selectedGradeLevel.split(' - ');
                    const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
                    loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
                }
            }
        }
    } catch (error) {
        console.error('Error fetching subjects:', error);
    }
}

// Fetch students from server
async function fetchStudents() {
    console.log('fetchStudents called, currentSchool:', currentSchool);
    
    if (!currentSchool || !currentSchool.id) {
        console.log('No school or school ID:', currentSchool);
        // Try to get school ID from localStorage as fallback
        const school = localStorage.getItem('school');
        if (school) {
            try {
                const parsedSchool = JSON.parse(school);
                if (parsedSchool.id) {
                    currentSchool = parsedSchool;
                    console.log('Using school from localStorage:', currentSchool);
                }
            } catch (e) {
                console.error('Error parsing school from localStorage:', e);
            }
        }
        
        if (!currentSchool || !currentSchool.id) {
            console.error('Cannot fetch students: No valid school ID');
            students = [];
            renderStudentsTable();
            return;
        }
    }
    
    console.log('Fetching students for school ID:', currentSchool.id);
    
    try {
        // First, get the current academic year to ensure we have it
        if (!currentAcademicYear) {
            await loadAcademicYears();
        }
        
        const response = await fetch(`/api/school/${currentSchool.id}/students`, {
            headers: getAuthHeaders()
        });
        console.log('API Response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Raw API response:', result);
            
            // Check if result has students array
            if (result && result.students && Array.isArray(result.students)) {
                students = result.students;
                console.log('Students fetched successfully, students array length:', students.length);
                console.log('Students array:', students);
            } else {
                console.warn('Invalid response format, using empty array');
                students = [];
            }
            
            // Parse detailed_scores and daily_attendance JSON strings
            students.forEach(student => {
                if (typeof student.detailed_scores === 'string') {
                    try {
                        student.grades = JSON.parse(student.detailed_scores);
                        // Fix any corrupted data where "[object Object]" is used as a key
                        const fixedGrades = {};
                        for (const key in student.grades) {
                            if (key === '[object Object]') {
                                console.warn('Found corrupted grade data with "[object Object]" key for student:', student.id);
                                // Skip this corrupted entry
                                continue;
                            }
                            fixedGrades[key] = student.grades[key];
                        }
                        student.grades = fixedGrades;
                    } catch {
                        student.grades = {};
                    }
                }
                if (typeof student.daily_attendance === 'string') {
                    try {
                        student.attendance = JSON.parse(student.daily_attendance);
                    } catch {
                        student.attendance = {};
                    }
                }
                
                // If we have a current academic year, try to load grades and attendance for that year
                if (currentAcademicYear && selectedAcademicYearId) {
                    // Grades and attendance for the current academic year will be loaded separately
                    // when opening student modals or when specifically requested
                }
            });
            
            console.log('Processed students:', students);
        } else {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            students = [];
        }
    } catch (error) {
        console.error('Error fetching students:', error);
        students = [];
    }
    
    console.log('About to render students table, students array length:', students.length);
    renderStudentsTable();
    
    // If a grade level is already selected, refresh its content
    // But only call loadGradeSubjectsForLevel once to avoid duplication
    // We'll call it from fetchSubjects instead
}

// Fetch teachers from server
async function fetchTeachers() {
    if (!currentSchool || !currentSchool.id) return;
    
    try {
        const response = await fetch(`/api/school/${currentSchool.id}/teachers`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const result = await response.json();
            if (result && result.teachers && Array.isArray(result.teachers)) {
                teachers = result.teachers;
                console.log('Loaded teachers data:', teachers); // Debug log
                
                // Add additional debugging for subject data
                teachers.forEach((teacher, index) => {
                    console.log(`Teacher ${index + 1}: ${teacher.full_name}`, {
                        subjects: teacher.subjects,
                        subject_names: teacher.subject_names,
                        subjects_type: Array.isArray(teacher.subjects) ? 'array' : typeof teacher.subjects,
                        subjects_length: Array.isArray(teacher.subjects) ? teacher.subjects.length : 'N/A'
                    });
                });
                
                // Group teachers by grade level
                gradeTeachers = {};
                teachers.forEach(teacher => {
                    if (!gradeTeachers[teacher.grade_level]) {
                        gradeTeachers[teacher.grade_level] = [];
                    }
                    gradeTeachers[teacher.grade_level].push(teacher);
                });
                
                // If a grade level is already selected, refresh its content
                if (selectedGradeLevel) {
                    const parts = selectedGradeLevel.split(' - ');
                    const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
                    loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
                }
            }
        }
    } catch (error) {
        console.error('Error fetching teachers:', error);
        teachers = [];
    }
}

// Teacher management is now centralized at school level - see openTeacherAssignmentModal()
// Grade-level specific addTeacher function is deprecated
function addTeacher(gradeLevel) {
    showNotification('يرجى إدارة المعلمين من لوحة تحكم المدرسة', 'info');
}

// Edit a teacher (opens centralized modal)
async function editTeacher(teacherId) {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;
    
    const newName = prompt('أدخل اسم المعلم الجديد:', teacher.full_name);
    if (!newName || newName.trim() === '') return;
    
    const newPhone = prompt('أدخل رقم الهاتف:', teacher.phone || '');
    const newSpecialization = prompt('أدخل التخصص:', teacher.specialization || '');
    
    try {
        const response = await fetch(`/api/teacher/${teacherId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                full_name: newName.trim(),
                phone: newPhone,
                subject_id: teacher.subject_id,
                grade_level: teacher.grade_level,
                specialization: newSpecialization
            })
        });
        
        if (response.ok) {
            showNotification('تم تحديث بيانات المعلم بنجاح', 'success');
            await fetchTeachers();
        } else {
            const error = await response.json();
            showNotification(error.error_ar || error.error || 'حدث خطأ في تحديث المعلم', 'error');
        }
    } catch (error) {
        console.error('Error updating teacher:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Delete a teacher
async function deleteTeacher(teacherId) {
    if (!confirm('هل أنت متأكد من حذف هذا المعلم؟')) return;
    
    try {
        const response = await fetch(`/api/teacher/${teacherId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showNotification('تم حذف المعلم بنجاح', 'success');
            await fetchTeachers();
        } else {
            const error = await response.json();
            showNotification(error.error_ar || error.error || 'حدث خطأ في حذف المعلم', 'error');
        }
    } catch (error) {
        console.error('Error deleting teacher:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Show add teacher form - now shows info notification
function showAddTeacherForm(gradeLevel) {
    showNotification('يرجى إدارة المعلمين من لوحة تحكم المدرسة - تبويب إدارة التوزيعات', 'info');
}

// Hide add teacher form - no longer needed
function hideAddTeacherForm(gradeLevel) {
    // Form is no longer shown at grade level
}

// Make teacher functions available globally
window.addTeacher = addTeacher;
window.editTeacher = editTeacher;
window.deleteTeacher = deleteTeacher;
window.showAddTeacherForm = showAddTeacherForm;
window.hideAddTeacherForm = hideAddTeacherForm;

// ============================================================================
// NEW TEACHER MANAGEMENT FUNCTIONS
// ============================================================================

// Generate new teacher code by calling the backend regeneration endpoint
async function generateNewTeacherCode() {
    // Get the current teacher ID from the form context
    // This function is called from the add teacher modal where we're creating a new teacher
    // For new teachers, we'll generate a preview code, for existing teachers, we'll regenerate
    
    const teacherNameInput = document.getElementById('teacherName');
    const teacherName = teacherNameInput?.value.trim();
    
    if (!teacherName) {
        showNotification('يرجى إدخال اسم المعلم أولاً', 'error');
        teacherNameInput?.focus();
        return;
    }
    
    try {
        // For the add teacher form, we'll generate a preview code locally
        // In a real implementation, this would call the backend to reserve the code
        const previewCode = generatePreviewTeacherCode();
        
        // Update the code preview display
        const codePreview = document.getElementById('teacherCodePreview');
        if (codePreview) {
            codePreview.textContent = previewCode;
            codePreview.title = 'هذا الرمز سيتم تأكيده عند الحفظ';
            
            // Add visual feedback
            codePreview.style.backgroundColor = '#e3f2fd';
            codePreview.style.borderColor = '#2196f3';
            setTimeout(() => {
                codePreview.style.backgroundColor = 'white';
                codePreview.style.borderColor = '';
            }, 1000);
        }
        
        showNotification('تم إنشاء رمز معاينة جديد! سيتم تأكيده عند حفظ المعلم', 'success');
        
    } catch (error) {
        console.error('Error generating preview code:', error);
        showNotification('حدث خطأ في إنشاء الرمز المعاينة', 'error');
    }
}

// Generate a preview code for the add teacher form (simulated)
function generatePreviewTeacherCode() {
    // This simulates what the backend would generate
    // In a production system, this would call: fetch('/api/teacher/generate-preview-code')
    const timestamp = String(Date.now()).slice(-5);
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TCHR-${timestamp}-${randomStr}`;
}

// Make the function available globally
window.generateNewTeacherCode = generateNewTeacherCode;

// Show Add Teacher Modal with enhanced features
function showAddTeacherModal() {
    // Reset form
    document.getElementById('addTeacherForm').reset();
    document.getElementById('teacherName').focus();
    
    // Show default code preview
    const codePreview = document.getElementById('teacherCodePreview');
    if (codePreview) {
        codePreview.textContent = 'TCHR-XXXXX-XXXX';
        codePreview.title = 'سيتم إنشاء الرمز تلقائياً عند الحفظ';
    }
    
    // Populate grade level options
    populateTeacherGradeLevelOptions();
    
    // Load all subjects for school instead of just grade-specific
    loadSubjectCheckboxes();
    
    // Open modal
    document.getElementById('addTeacherModal').style.display = 'flex';
}

function populateTeacherGradeLevelOptions() {
    const teacherGradeLevelSelect = document.getElementById('teacherGradeLevel');
    if (!teacherGradeLevelSelect) return;
    
    teacherGradeLevelSelect.innerHTML = '<option value="">غير محدد</option>';
    
    gradeLevels.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade;
        option.textContent = grade;
        if (selectedGradeLevel) {
            const parts = selectedGradeLevel.split(' - ');
            const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
            if (grade === originalGradeLevel) {
                option.selected = true;
            }
        }
        teacherGradeLevelSelect.appendChild(option);
    });
}

async function loadSubjectCheckboxes(gradeFilter = null) {
    const container = document.getElementById('subjectCheckboxes');
    if (!container) return;
    
    container.innerHTML = '<p>جارٍ تحميل المواد...</p>';
    
    try {
        if (subjects.length === 0) {
            await fetchSubjects();
        }
        
        let filteredSubjects = subjects;
        if (gradeFilter) {
            filteredSubjects = subjects.filter(s => s.grade_level === gradeFilter);
        }
        
        if (filteredSubjects.length === 0) {
            container.innerHTML = '<p>لا توجد مواد مضافة حالياً.</p>';
            return;
        }
        
        // Group subjects by grade level
        const grouped = {};
        filteredSubjects.forEach(s => {
            const grade = s.grade_level || 'مواد عامة';
            if (!grouped[grade]) grouped[grade] = [];
            grouped[grade].push(s);
        });
        
        let html = '';
        for (const grade in grouped) {
            html += `<div class="subject-group" style="margin-bottom: 0.5rem;">
                <h5 style="margin: 0.5rem 0; border-bottom: 1px solid #eee;">${grade}</h5>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.5rem;">
            `;
            grouped[grade].forEach(s => {
                html += `
                    <label class="checkbox-item" style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
                        <input type="checkbox" name="subject_ids" value="${s.id}">
                        ${escapeHtml(s.name)}
                    </label>
                `;
            });
            html += `</div></div>`;
        }
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading subject checkboxes:', error);
        container.innerHTML = '<p>حدث خطأ في تحميل المواد.</p>';
    }
}

// Load subject checkboxes for teacher form
async function loadSubjectCheckboxes(gradeLevel) {
    const container = document.getElementById('subjectCheckboxes');
    
    try {
        // Get subjects for this grade level
        const gradeLevelSubjects = (gradeSubjects[gradeLevel] || []).slice().sort((a, b) => 
            a.name.localeCompare(b.name, 'ar')
        );
        
        if (gradeLevelSubjects.length === 0) {
            container.innerHTML = '<p>لا توجد مواد متوفرة لهذا الصف. يرجى إضافة مواد أولاً.</p>';
            return;
        }
        
        // Generate checkboxes
        let html = '';
        gradeLevelSubjects.forEach(subject => {
            html += `
                <div style="margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" name="subject_ids" value="${subject.id}" style="margin-right: 0.5rem;">
                        ${escapeHtml(subject.name)}
                    </label>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading subject checkboxes:', error);
        container.innerHTML = '<p>حدث خطأ في تحميل المواد</p>';
    }
}

// Handle Add Teacher Form Submission with enhanced error handling
document.getElementById('addTeacherForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    console.log('Add teacher form submitted');
    
    if (!currentSchool || !currentSchool.id) {
        console.error('Current school not available:', currentSchool);
        showNotification('خطأ في تحميل معلومات المدرسة', 'error');
        return;
    }
    
    // Get grade level from dropdown or selected grade
    let teacherGradeLevel = '';
    const gradeLevelSelect = document.getElementById('teacherGradeLevel');
    if (gradeLevelSelect && gradeLevelSelect.value) {
        teacherGradeLevel = gradeLevelSelect.value;
    } else if (selectedGradeLevel) {
        const parts = selectedGradeLevel.split(' - ');
        teacherGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
    }
    
    // Get form data
    const fullName = document.getElementById('teacherName').value.trim();
    const phone = document.getElementById('teacherPhone').value.trim();
    const email = document.getElementById('teacherEmail').value.trim();
    const specialization = document.getElementById('teacherSpecialization').value.trim();
    
    // Get selected subjects
    const selectedSubjectCheckboxes = document.querySelectorAll('input[name="subject_ids"]:checked');
    const subjectIds = Array.from(selectedSubjectCheckboxes).map(cb => parseInt(cb.value));
    
    console.log('Form data:', { fullName, phone, email, specialization, subjectIds, gradeLevel: teacherGradeLevel });
    
    // Validation
    if (!fullName) {
        showNotification('يرجى إدخال اسم المعلم', 'error');
        document.getElementById('teacherName').focus();
        return;
    }
    
    // Add loading state to submit button
    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
    submitButton.disabled = true;
    
    try {
        const response = await fetch(`/api/school/${currentSchool.id}/teacher`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                full_name: fullName,
                phone: phone,
                email: email,
                subject_ids: subjectIds,
                grade_level: teacherGradeLevel,
                specialization: specialization
            })
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', [...response.headers.entries()]);
        
        const result = await response.json();
        console.log('Response data:', result);
        
        if (response.ok && result.success) {
            // Handle both possible response structures
            const teacherCode = result.teacher_code || (result.teacher && result.teacher.teacher_code) || 'رمز غير متوفر';
            showNotification(`تم إضافة المعلم بنجاح! الرمز: ${teacherCode}`, 'success');
            closeModal('addTeacherModal');
            document.getElementById('addTeacherForm').reset();
            await fetchTeachers();
            
            // Reload grade content to show updated teacher list
            loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
        } else {
            const errorMessage = result.error_ar || result.error || 'حدث خطأ في إضافة المعلم';
            showNotification(errorMessage, 'error');
            console.error('Server error:', result);
        }
    } catch (error) {
        console.error('Error adding teacher:', error);
        console.error('Error stack:', error.stack);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        
        // More detailed error message
        let errorMessage = 'حدث خطأ غير متوقع';
        if (error.message) {
            errorMessage += `: ${escapeHtml(error.message)}`;
        }
        
        showNotification(errorMessage, 'error');
        
        // Log to a visible debug area if it exists
        const debugArea = document.getElementById('debugErrorLog');
        if (debugArea) {
            debugArea.innerHTML += `<div style="color: red; margin: 5px 0;">[${new Date().toLocaleTimeString()}] ${error.message || error}</div>`;
            debugArea.scrollTop = debugArea.scrollHeight;
        }
    } finally {
        // Restore button state
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
    }
});

// Show Teachers List Modal with enhanced features
function showTeachersList() {
    if (!selectedGradeLevel) {
        showNotification('يرجى اختيار صف أولاً', 'error');
        return;
    }
    
    const parts = selectedGradeLevel.split(' - ');
    const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
    
    // Set grade level title
    document.getElementById('teachersGradeLevel').textContent = selectedGradeLevel;
    
    // Load teachers for this grade level
    loadTeachersTable(originalGradeLevel);
    
    // Set up search and filter event listeners
    setupTeacherSearchAndFilter(originalGradeLevel);
    
    // Load subject filter options
    loadSubjectFilterOptions();
    
    // Open modal
    document.getElementById('teachersListModal').style.display = 'flex';
}

// Set up search and filter functionality
function setupTeacherSearchAndFilter(gradeLevel) {
    const searchInput = document.getElementById('teacherSearch');
    const subjectFilter = document.getElementById('teacherFilterSubject');
    
    // Clear previous event listeners by cloning elements
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        newSearchInput.addEventListener('input', debounce(() => {
            filterTeachers(gradeLevel);
        }, 300));
    }
    
    if (subjectFilter) {
        const newSubjectFilter = subjectFilter.cloneNode(true);
        subjectFilter.parentNode.replaceChild(newSubjectFilter, subjectFilter);
        newSubjectFilter.addEventListener('change', () => {
            filterTeachers(gradeLevel);
        });
    }
}

// Load subject filter options
function loadSubjectFilterOptions() {
    const subjectFilter = document.getElementById('teacherFilterSubject');
    if (!subjectFilter) return;
    
    // Get all unique subjects from current teachers
    // Handle teachers with and without subjects (subjects are now optional)
    const allSubjects = new Set();
    teachers.forEach(teacher => {
        // Check multiple subject data formats
        if (teacher.subjects && Array.isArray(teacher.subjects) && teacher.subjects.length > 0) {
            // Handle array of subject objects
            teacher.subjects.forEach(subject => {
                if (subject && subject.name) {
                    allSubjects.add(subject.name);
                }
            });
        } else if (teacher.subject_names && typeof teacher.subject_names === 'string') {
            // Handle comma-separated string
            teacher.subject_names.split(',').forEach(subject => {
                const subjectName = subject.trim();
                if (subjectName) {
                    allSubjects.add(subjectName);
                }
            });
        } else if (teacher.subject_ids && Array.isArray(teacher.subject_ids)) {
            // Handle subject IDs - this would require looking up subject names elsewhere
            // For now, we'll skip this case as we don't have the subject lookup mechanism here
        }
    });
    
    // Clear and populate options
    subjectFilter.innerHTML = '<option value="">جميع المواد</option>';
    Array.from(allSubjects).sort().forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        subjectFilter.appendChild(option);
    });
}

// Filter teachers based on search and subject filter
function filterTeachers(gradeLevel) {
    const searchInput = document.getElementById('teacherSearch');
    const subjectFilter = document.getElementById('teacherFilterSubject');
    const tbody = document.getElementById('teachersTableBody');
    const summary = document.getElementById('teachersSummary');
    
    if (!searchInput || !subjectFilter || !tbody) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedSubject = subjectFilter.value;
    
    // Filter teachers
    let filteredTeachers = teachers.filter(teacher => teacher.grade_level === gradeLevel);
    
    // Apply search filter
    if (searchTerm) {
        filteredTeachers = filteredTeachers.filter(teacher => 
            teacher.full_name.toLowerCase().includes(searchTerm) ||
            teacher.teacher_code.toLowerCase().includes(searchTerm) ||
            (teacher.email && teacher.email.toLowerCase().includes(searchTerm))
        );
    }
    
    // Apply subject filter
    if (selectedSubject) {
        filteredTeachers = filteredTeachers.filter(teacher => 
            teacher.subjects && teacher.subjects.some(subject => subject.name === selectedSubject)
        );
    }
    
    // Update summary
    if (summary) {
        const total = teachers.filter(t => t.grade_level === gradeLevel).length;
        summary.textContent = `المعروض: ${filteredTeachers.length} من ${total} معلم`;
    }
    
    // Generate table rows
    if (filteredTeachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">لا توجد نتائج مطابقة</td></tr>`;
        return;
    }
    
    let html = '';
    filteredTeachers.forEach(teacher => {
        const subjectNames = teacher.subjects && teacher.subjects.length > 0 
            ? teacher.subjects.map(s => s.name).join(', ')
            : 'لم تحدد مواد';
        
        html += `
            <tr>
                <td class="td-school">${escapeHtml(teacher.full_name)}</td>
                <td class="td-school">${subjectNames}</td>
                <td class="td-school">${escapeHtml(teacher.grade_level)}</td>
                <td class="td-school">${teacher.email || '-'}</td>
                <td class="td-school">${teacher.phone || '-'}</td>
                <td class="td-school">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <code class="code-btn" style="cursor: pointer; font-size: 0.9rem; padding: 0.2rem 0.5rem;" 
                              onclick="copyTeacherCode('${escapeHtml(teacher.teacher_code)}', this)"
                              data-teacher-id="${teacher.id}">
                            ${escapeHtml(teacher.teacher_code)}
                        </code>
                        <button class="btn-small btn-info" onclick="copyTeacherCode('${escapeHtml(teacher.teacher_code)}')" 
                                title="نسخ الرمز" style="padding: 0.2rem 0.4rem;">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </td>
                <td class="td-school">
                    <button class="btn-small btn-info" onclick="editTeacherModal(${teacher.id})" style="margin: 0.1rem; display: flex; align-items: center; gap: 0.3rem;" title="🔵 تعديل - لتحرير بيانات المعلم">
                        <span style="color: #007bff; font-size: 1.2rem;">🔵</span>
                        <i class="fas fa-edit"></i> تعديل
                    </button>
                    <button class="btn-small btn-warning" onclick="regenerateTeacherCode(${teacher.id})" style="margin: 0.1rem; display: flex; align-items: center; gap: 0.3rem;" title="🟡 تجديد - لإعادة توليد رمز المعلم">
                        <span style="color: #ffc107; font-size: 1.2rem;">🟡</span>
                        <i class="fas fa-sync"></i> تجديد الرمز
                    </button>
                    <button class="btn-small btn-danger" onclick="deleteTeacher(${teacher.id})" style="margin: 0.1rem; display: flex; align-items: center; gap: 0.3rem;" title="🔴 حذف - لحذف المعلم من النظام">
                        <span style="color: #dc3545; font-size: 1.2rem;">🔴</span>
                        <i class="fas fa-trash"></i> حذف
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// Debounce function for search input
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Load teachers table with enhanced features
function loadTeachersTable(gradeLevel) {
    const tbody = document.getElementById('teachersTableBody');
    const summary = document.getElementById('teachersSummary');
    
    // Filter teachers for this grade level
    const gradeLevelTeachers = teachers.filter(teacher => teacher.grade_level === gradeLevel);
    
    // Update summary
    if (summary) {
        summary.textContent = `إجمالي المعلمين: ${gradeLevelTeachers.length}`;
    }
    
    if (gradeLevelTeachers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">لا يوجد معلمون مسجلون في هذا الصف</td></tr>`;
        return;
    }
    
    // Generate table rows
    let html = '';
    gradeLevelTeachers.forEach(teacher => {
        // Get subject names - improved logic to handle different data structures
        let subjectNames = 'لم تحدد مواد';
        if (teacher.subjects && Array.isArray(teacher.subjects) && teacher.subjects.length > 0) {
            // Handle case where subjects is an array of objects with name property
            try {
                subjectNames = teacher.subjects
                    .filter(s => s && s.name) // Filter out invalid subjects
                    .map(s => s.name)
                    .join(', ');
                if (!subjectNames) {
                    subjectNames = 'لم تحدد مواد';
                }
            } catch (e) {
                console.error('Error processing teacher subjects:', e);
                subjectNames = 'خطأ في تحميل المواد';
            }
        } else if (teacher.subject_names && typeof teacher.subject_names === 'string' && teacher.subject_names.trim()) {
            // Fallback to subject_names string if available
            subjectNames = teacher.subject_names;
        }
        
        html += `
            <tr>
                <td class="td-school">${escapeHtml(teacher.full_name)}</td>
                <td class="td-school">${subjectNames}</td>
                <td class="td-school">${escapeHtml(teacher.grade_level)}</td>
                <td class="td-school">${teacher.email || '-'}</td>
                <td class="td-school">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <code class="code-btn" style="cursor: pointer; font-size: 0.9rem; padding: 0.2rem 0.5rem;" 
                              onclick="copyTeacherCode('${escapeHtml(teacher.teacher_code)}', this)"
                              data-teacher-id="${teacher.id}">
                            ${escapeHtml(teacher.teacher_code)}
                        </code>
                        <button class="btn-small btn-info" onclick="copyTeacherCode('${escapeHtml(teacher.teacher_code)}')" 
                                title="نسخ الرمز" style="padding: 0.2rem 0.4rem;">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </td>
                <td class="td-school">${teacher.phone || '-'}</td>
                <td class="td-school">
                    <div style="display: flex; gap: 0.3rem; flex-wrap: wrap;">
                        <button class="btn-small btn-info" onclick="editTeacherModal(${teacher.id})" style="margin: 0.1rem; display: flex; align-items: center; gap: 0.3rem;" title="🔵 تعديل - لتحرير بيانات المعلم">
                            <span style="color: #007bff; font-size: 1.2rem;">🔵</span>
                            <i class="fas fa-edit"></i> تعديل
                        </button>
                        <button class="btn-small btn-warning" onclick="regenerateTeacherCode(${teacher.id})" style="margin: 0.1rem; display: flex; align-items: center; gap: 0.3rem;" title="🟡 تجديد - لإعادة توليد رمز المعلم">
                            <span style="color: #ffc107; font-size: 1.2rem;">🟡</span>
                            <i class="fas fa-sync"></i> تجديد
                        </button>
                        <button class="btn-small btn-danger" onclick="deleteTeacher(${teacher.id})" style="margin: 0.1rem; display: flex; align-items: center; gap: 0.3rem;" title="🔴 حذف - لحذف المعلم من النظام">
                            <span style="color: #dc3545; font-size: 1.2rem;">🔴</span>
                            <i class="fas fa-trash"></i> حذف
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// Copy teacher code with visual feedback
function copyTeacherCode(code, element = null) {
    navigator.clipboard.writeText(code).then(() => {
        showNotification('تم نسخ رمز المعلم إلى الحافظة', 'success');
        
        // Visual feedback on the code element
        if (element) {
            const originalBg = element.style.backgroundColor;
            element.style.backgroundColor = '#4CAF50';
            element.style.color = 'white';
            setTimeout(() => {
                element.style.backgroundColor = originalBg;
                element.style.color = '';
            }, 1000);
        }
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showNotification('فشل في النسخ، يرجى المحاولة مرة أخرى', 'error');
    });
}

// Regenerate teacher code
async function regenerateTeacherCode(teacherId) {
    if (!confirm('هل أنت متأكد من تجديد رمز المعلم؟ سيتم إنشاء رمز جديد واستبدال الرمز الحالي.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/teacher/${teacherId}/regenerate-code`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showNotification(`تم تجديد رمز المعلم بنجاح! الرمز الجديد: ${escapeHtml(result.new_code)}`, 'success');
            
            // Update the teacher in local array
            const teacherIndex = teachers.findIndex(t => t.id === teacherId);
            if (teacherIndex !== -1) {
                teachers[teacherIndex] = result.teacher;
            }
            
            // Reload the table to show updated code
            const parts = selectedGradeLevel.split(' - ');
            const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
            loadTeachersTable(originalGradeLevel);
            
            // Also update any displayed code elements
            updateDisplayedTeacherCodes(teacherId, result.new_code);
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ في تجديد الرمز', 'error');
        }
    } catch (error) {
        console.error('Error regenerating teacher code:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// Update displayed teacher codes in the UI
function updateDisplayedTeacherCodes(teacherId, newCode) {
    // Update code in teacher list table
    const codeElements = document.querySelectorAll(`code[data-teacher-id="${teacherId}"]`);
    codeElements.forEach(element => {
        element.textContent = newCode;
    });
    
    // Update any other code displays
    const teacherCodeDisplays = document.querySelectorAll('.teacher-code-display');
    teacherCodeDisplays.forEach(element => {
        if (element.dataset.teacherId == teacherId) {
            element.textContent = newCode;
        }
    });
}

// Make functions available globally
window.regenerateTeacherCode = regenerateTeacherCode;

// Edit Teacher Modal
async function editTeacherModal(teacherId) {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;
    
    // Show add teacher modal in edit mode
    showAddTeacherModal();
    
    // Fill form with existing data
    document.getElementById('teacherName').value = teacher.full_name;
    document.getElementById('teacherPhone').value = teacher.phone || '';
    document.getElementById('teacherEmail').value = teacher.email || '';
    document.getElementById('teacherSpecialization').value = teacher.specialization || '';
    
    // Check the teacher's subjects
    setTimeout(() => {
        const subjectCheckboxes = document.querySelectorAll('input[name="subject_ids"]');
        subjectCheckboxes.forEach(checkbox => {
            if (teacher.subject_ids && teacher.subject_ids.includes(checkbox.value)) {
                checkbox.checked = true;
            }
        });
    }, 100);
    
    // Change form submit handler for editing
    const form = document.getElementById('addTeacherForm');
    const originalSubmitHandler = form.onsubmit;
    
    form.onsubmit = async function(e) {
        e.preventDefault();
        
        // Get form data
        const fullName = document.getElementById('teacherName').value.trim();
        const phone = document.getElementById('teacherPhone').value.trim();
        const email = document.getElementById('teacherEmail').value.trim();
        const specialization = document.getElementById('teacherSpecialization').value.trim();
        
        // Get selected subjects
        const selectedSubjectCheckboxes = document.querySelectorAll('input[name="subject_ids"]:checked');
        const subjectIds = Array.from(selectedSubjectCheckboxes).map(cb => parseInt(cb.value));
        
        // Validation
        if (!fullName) {
            showNotification('يرجى إدخال اسم المعلم', 'error');
            return;
        }
        
        if (subjectIds.length === 0) {
            showNotification('يرجى اختيار مادة واحدة على الأقل', 'error');
            return;
        }
        
        try {
            const response = await fetch(`/api/teacher/${teacherId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    full_name: fullName,
                    phone: phone,
                    email: email,
                    subject_ids: subjectIds,
                    grade_level: teacher.grade_level,
                    specialization: specialization
                })
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                showNotification('تم تحديث بيانات المعلم بنجاح', 'success');
                closeModal('addTeacherModal');
                document.getElementById('addTeacherForm').reset();
                await fetchTeachers();
                
                // Reload grade content
                const parts = selectedGradeLevel.split(' - ');
                const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
                loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
                
                // Restore original submit handler
                form.onsubmit = originalSubmitHandler;
            } else {
                showNotification(result.error_ar || result.error || 'حدث خطأ في تحديث المعلم', 'error');
            }
        } catch (error) {
            console.error('Error updating teacher:', error);
            showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        }
    };
}

// Add teacher management functions to window object
window.showAddTeacherModal = showAddTeacherModal;
window.showTeachersList = showTeachersList;
window.editTeacherModal = editTeacherModal;

// إدارة المستويات الدراسية

// دوال مساعدة للإحصائيات
function getStudentsInGrade(level, grade) {
    return students.filter(student => 
        student.grade && student.grade.includes(level) && student.grade.includes(grade)
    );
}

function getStudentsInBranch(level, grade) {
    return students.filter(student => 
        student.grade && student.grade.includes(level) && student.grade.includes(grade)
    );
}

function calculateAttendanceRate(level, grade) {
    // محاكاة حساب معدل الحضور
    return Math.floor(Math.random() * 30) + 70; // قيمة عشوائية بين 70-99%
}

function calculateSuccessRate(level, grade) {
    // محاكاة حساب معدل النجاح
    return Math.floor(Math.random() * 20) + 80; // قيمة عشوائية بين 80-99%
}

function calculateBranchAttendanceRate(studentsInBranch) {
    // محاكاة حساب معدل الحضور لفرع معين
    return Math.floor(Math.random() * 30) + 70; // قيمة عشوائية بين 70-99%
}

function calculateBranchSuccessRate(studentsInBranch) {
    // محاكاة حساب معدل النجاح لفرع معين
    return Math.floor(Math.random() * 20) + 80; // قيمة عشوائية بين 80-99%
}

// إدارة المواد
function showSubjectManagementModal() {
    // إغلاق النوافذ الأخرى أولاً
    closeModal('gradesModal');
    closeTeacherAssignmentModal();
    if (document.getElementById('addTeacherModal')) {
        closeModal('addTeacherModal');
    }
    if (document.getElementById('addGradeLevelModal')) {
        closeModal('addGradeLevelModal');
    }
    
    const modal = document.getElementById('subjectManagementModal');
    if (modal) {
        modal.style.display = 'flex';
        populateSubjectGradeLevelOptions();
        fetchSubjects();
    }
}

function closeSubjectManagementModal() {
    const modal = document.getElementById('subjectManagementModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function populateSubjectGradeLevelOptions() {
    const subjectGradeLevelSelect = document.getElementById('subjectGradeLevel');
    const gradeLevelFilterSelect = document.getElementById('gradeLevelFilter');
    
    if (subjectGradeLevelSelect) {
        subjectGradeLevelSelect.innerHTML = '<option value="">غير محدد</option>';
        gradeLevels.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = grade;
            subjectGradeLevelSelect.appendChild(option);
        });
    }
    
    if (gradeLevelFilterSelect) {
        gradeLevelFilterSelect.innerHTML = '<option value="">جميع المستويات</option>';
        gradeLevels.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = grade;
            gradeLevelFilterSelect.appendChild(option);
        });
    }
}

function refreshSubjectsTable(filteredSubjects = null) {
    const tbody = document.getElementById('subjectsTableBody');
    const countSpan = document.getElementById('subjectsCount');
    if (!tbody || !countSpan) return;
    
    const displaySubjects = filteredSubjects || subjects;
    countSpan.textContent = displaySubjects.length;
    
    if (displaySubjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #666;">لا توجد مواد مضافة</td></tr>';
        return;
    }
    
    let html = '';
    displaySubjects.forEach(s => {
        html += `
            <tr>
                <td class="td-school">${escapeHtml(s.name)}</td>
                <td class="td-school">${s.grade_level || '<span style="color: #999;">عامة</span>'}</td>
                <td class="td-school">${new Date(s.created_at).toLocaleDateString('ar-EG')}</td>
                <td class="td-school">
                    <button class="btn-small btn-danger" onclick="deleteSubject(${s.id})" title="حذف المادة">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function filterSubjects() {
    const searchTerm = document.getElementById('subjectSearch')?.value.toLowerCase().trim() || '';
    const selectedGrade = document.getElementById('gradeLevelFilter')?.value || '';
    
    const filtered = subjects.filter(s => {
        const matchesName = s.name.toLowerCase().includes(searchTerm);
        const matchesGrade = !selectedGrade || s.grade_level === selectedGrade;
        return matchesName && matchesGrade;
    });
    
    refreshSubjectsTable(filtered);
}

window.showSubjectManagementModal = showSubjectManagementModal;
window.closeSubjectManagementModal = closeSubjectManagementModal;
window.filterSubjects = filterSubjects;

async function addSubject(e) {
    e.preventDefault();
    
    const subjectName = document.getElementById('subjectNameInput').value.trim();
    const gradeLevel = document.getElementById('subjectGradeLevel')?.value || null;
    
    if (!subjectName) {
        showNotification('يرجى إدخال اسم المادة', 'error');
        return;
    }
    
    if (!gradeLevel) {
        showNotification('يجب تحديد مستوى دراسي', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/school/${currentSchool.id}/subject`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ name: subjectName, grade_level: gradeLevel })
        });
        
        if (response.ok) {
            showNotification('تم إضافة المادة بنجاح', 'success');
            document.getElementById('subjectNameInput').value = '';
            fetchSubjects(); // Refresh subjects list
        } else {
            const error = await response.json();
            showNotification(error.error_ar || error.error || 'حدث خطأ في إضافة المادة', 'error');
        }
    } catch (error) {
        console.error('Error saving subject:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

function renderSubjects() {
    // This function is no longer used as we render subjects dynamically
    // But keeping it for backward compatibility
    const container = document.getElementById('subjectsList');
    if (!container) return;
    
    // Group subjects by grade level for better display
    const subjectsByGrade = {};
    subjects.forEach(subject => {
        if (!subjectsByGrade[subject.grade_level]) {
            subjectsByGrade[subject.grade_level] = [];
        }
        subjectsByGrade[subject.grade_level].push(subject);
    });
    
    // Sort subjects alphabetically within each grade level
    for (const grade in subjectsByGrade) {
        subjectsByGrade[grade].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }
    
    let html = '';
    
    // Display subjects grouped by grade level (sorted alphabetically)
    const sortedGrades = Object.keys(subjectsByGrade).sort((a, b) => a.localeCompare(b, 'ar'));
    
    for (const grade of sortedGrades) {
        html += `<div class="grade-subjects-section">
                    <h4 class="grade-subjects-title">${grade}</h4>
                    <div class="subjects-grid">`;
        
        subjectsByGrade[grade].forEach((subject, index) => {
            html += `<div class="subject-card">
                        <span class="subject-name">${escapeHtml(subject.name)}</span>
                        <div class="subject-actions">
                            <button class="btn-small btn-info" onclick="editSubject(${subject.id})">
                                <i class="fas fa-edit"></i> تعديل
                            </button>
                            <button class="btn-small btn-danger" onclick="deleteSubject(${subject.id})">
                                <i class="fas fa-trash"></i> حذف
                            </button>
                        </div>
                    </div>`;
        });
        
        html += `</div></div>`;
    }
    
    container.innerHTML = html || '<p class="no-subjects">لا توجد مواد دراسية مُضافة حالياً</p>';
}

async function editSubject(id) {
    const subject = subjects.find(s => s.id === id);
    if (!subject) return;
    
    const newName = prompt('أدخل الاسم الجديد للمادة:', subject.name);
    const newGradeLevel = prompt('أدخل المستوى الدراسي الجديد:', subject.grade_level);
    
    if (newName && newName.trim() && (newName.trim() !== subject.name || newGradeLevel.trim() !== subject.grade_level)) {
        try {
            const response = await fetch(`/api/subject/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ 
                    name: newName.trim(), 
                    grade_level: newGradeLevel.trim() 
                })
            });
            
            if (response.ok) {
                showNotification('تم تعديل المادة بنجاح', 'success');
                fetchSubjects(); // Refresh subjects list
                
                // Reload grade content if a grade level is selected
                if (selectedGradeLevel) {
                    loadGradeSubjectsForLevel(selectedGradeLevel);
                }
            } else {
                const error = await response.json();
                showNotification(error.error || 'حدث خطأ في تعديل المادة', 'error');
            }
        } catch (error) {
            console.error('Error updating subject:', error);
            showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        }
    }
}

async function deleteSubject(id) {
    if (!confirm('هل أنت متأكد من حذف هذه المادة؟')) return;
    
    try {
        const response = await fetch(`/api/subject/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showNotification('تم حذف المادة بنجاح', 'success');
            fetchSubjects(); // Refresh subjects list
            
            // Reload grade content if a grade level is selected
            if (selectedGradeLevel) {
                loadGradeSubjectsForLevel(selectedGradeLevel);
            }
        } else {
            const error = await response.json();
            showNotification(error.error || 'حدث خطأ في حذف المادة', 'error');
        }
    } catch (error) {
        console.error('Error deleting subject:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

function generateStudentCode() {
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    const random = Math.random().toString(36).substr(2, 3).toUpperCase(); // 3 random characters
    return `STD-${timestamp}-${random}`;
}

function generateUniqueStudentCode() {
    let code;
    do {
        code = generateStudentCode();
    } while (students.some(student => student.student_code === code));
    return code;
}

// Student management wrapper functions
function viewStudentInfo(studentId) {
    openStudentInfoModal(studentId);
}

// Make viewStudentInfo available globally
window.viewStudentInfo = viewStudentInfo;

function viewStudentGrades(studentId) {
    openGradesModal(studentId);
}

function viewStudentAttendance(studentId) {
    openAttendanceModal(studentId);
}

// Add Student Form Functions
function showAddStudentForm(gradeLevel) {
    // Create or get the form container
    let formContainer = document.getElementById('addStudentFormContainer');
    if (!formContainer) {
        formContainer = document.createElement('div');
        formContainer.id = 'addStudentFormContainer';
        document.getElementById('gradeLevelContent').appendChild(formContainer);
    }
    
    // Create grade level ID for form ID
    const gradeLevelId = gradeLevel.replace(/\s+/g, '-');
    
    // Generate the form HTML
    formContainer.innerHTML = `
        <div id="addStudentFormWrapper-${gradeLevelId}" class="add-student-form" style="display: block; margin-top: 1rem; padding: 1.5rem; background: var(--background-secondary, #f8f9fa); border-radius: 8px;">
            <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-user-plus"></i> إضافة طالب جديد</h3>
            <form id="addStudentForm-${gradeLevelId}">
                <input type="hidden" name="grade_level" value="${gradeLevel}">
                <div class="form-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div class="form-group-school">
                        <label for="full_name"><i class="fas fa-user"></i> اسم الطالب الرباعي *</label>
                        <input type="text" id="full_name" name="full_name" class="form-input" required placeholder="أدخل الاسم الكامل">
                    </div>
                    <div class="form-group-school">
                        <label for="room"><i class="fas fa-door-open"></i> القاعة *</label>
                        <input type="text" id="room" name="room" class="form-input" required placeholder="أدخل رقم القاعة">
                    </div>
                </div>
                <div class="form-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
                    <div class="form-group-school">
                        <label for="parent_contact"><i class="fas fa-phone"></i> رقم ولي الأمر</label>
                        <input type="tel" id="parent_contact" name="parent_contact" class="form-input" placeholder="أدخل رقم الهاتف">
                    </div>
                    <div class="form-group-school">
                        <label for="blood_type"><i class="fas fa-tint"></i> فصيلة الدم</label>
                        <select id="blood_type" name="blood_type" class="form-input">
                            <option value="">اختر فصيلة الدم</option>
                            <option value="O+">O+</option>
                            <option value="O-">O-</option>
                            <option value="A+">A+</option>
                            <option value="A-">A-</option>
                            <option value="B+">B+</option>
                            <option value="B-">B-</option>
                            <option value="AB+">AB+</option>
                            <option value="AB-">AB-</option>
                        </select>
                    </div>
                </div>
                <div class="form-row" style="display: grid; grid-template-columns: 1fr; gap: 1rem; margin-top: 1rem;">
                    <div class="form-group-school">
                        <label for="chronic_disease"><i class="fas fa-heartbeat"></i> الأمراض المزمنة</label>
                        <input type="text" id="chronic_disease" name="chronic_disease" class="form-input" placeholder="أدخل أي أمراض مزمنة إن وجدت">
                    </div>
                </div>
                <div class="form-group-school" style="margin-top: 1rem;">
                    <label for="notes"><i class="fas fa-sticky-note"></i> ملاحظات</label>
                    <textarea id="notes" name="notes" class="textarea-school form-input" rows="3" placeholder="أي ملاحظات إضافية..."></textarea>
                </div>
                <div class="form-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <button type="submit" class="btn-primary-school btn-primary">
                        <i class="fas fa-save"></i> حفظ بيانات الطالب
                    </button>
                    <button type="button" class="btn-secondary-school" onclick="hideAddStudentForm('${gradeLevel}')">
                        <i class="fas fa-times"></i> إلغاء
                    </button>
                </div>
            </form>
        </div>
    `;
    
    // Scroll to form
    formContainer.scrollIntoView({ behavior: 'smooth' });
}

function hideAddStudentForm(gradeLevel) {
    const gradeLevelId = gradeLevel.replace(/\s+/g, '-');
    const formContainer = document.getElementById('addStudentFormContainer');
    if (formContainer) {
        formContainer.remove();
    }
}

function showBulkAddStudentForm(gradeLevel) {
    // Create or get the form container
    let formContainer = document.getElementById('bulkAddStudentFormContainer');
    if (!formContainer) {
        formContainer = document.createElement('div');
        formContainer.id = 'bulkAddStudentFormContainer';
        document.getElementById('gradeLevelContent').appendChild(formContainer);
    }
    
    // Create grade level ID for form ID
    const gradeLevelId = gradeLevel.replace(/\s+/g, '-');
    
    // Generate the bulk add form HTML
    formContainer.innerHTML = `
        <div id="bulkAddStudentForm-${gradeLevelId}" class="bulk-add-student-form" style="display: block; margin-top: 1rem; padding: 1.5rem; background: var(--background-secondary, #f8f9fa); border-radius: 8px;">
            <h3 style="margin: 0 0 1rem 0;"><i class="fas fa-users"></i> إضافة جماعية للطلاب</h3>
            <form id="bulkAddStudentForm-${gradeLevelId}">
                <input type="hidden" name="bulk_grade_level" value="${gradeLevel}">
                <div class="form-group-school" style="margin-bottom: 1rem;">
                    <label for="bulk_room"><i class="fas fa-door-open"></i> القاعة *</label>
                    <input type="text" id="bulk_room" name="bulk_room" class="form-input" required placeholder="أدخل رقم القاعة">
                </div>
                <div class="bulk-students-list" id="bulkStudentsList-${gradeLevelId}">
                    <div class="bulk-student-row" style="display: grid; grid-template-columns: 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <input type="text" name="bulk_full_name_1" placeholder="اسم الطالب الرباعي" class="form-input" required>
                        <button type="button" class="btn-danger-school btn-small" onclick="this.parentElement.remove()">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <button type="button" class="btn-secondary-school btn-small" onclick="addBulkStudentRow('${gradeLevelId}')" style="margin: 0.5rem 0;">
                    <i class="fas fa-plus"></i> إضافة صف آخر
                </button>
                <div class="form-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <button type="submit" class="btn-primary-school btn-primary">
                        <i class="fas fa-save"></i> حفظ جميع الطلاب
                    </button>
                    <button type="button" class="btn-secondary-school" onclick="hideBulkAddStudentForm('${gradeLevel}')">
                        <i class="fas fa-times"></i> إلغاء
                    </button>
                </div>
            </form>
        </div>
    `;
    
    // Scroll to form
    formContainer.scrollIntoView({ behavior: 'smooth' });
}

function hideBulkAddStudentForm(gradeLevel) {
    const formContainer = document.getElementById('bulkAddStudentFormContainer');
    if (formContainer) {
        formContainer.remove();
    }
}

function addBulkStudentRow(gradeLevelId) {
    const container = document.getElementById(`bulkStudentsList-${gradeLevelId}`);
    if (!container) return;
    
    const rowCount = container.querySelectorAll('.bulk-student-row').length + 1;
    
    const row = document.createElement('div');
    row.className = 'bulk-student-row';
    row.style = 'display: grid; grid-template-columns: 1fr auto; gap: 0.5rem; margin-bottom: 0.5rem;';
    row.innerHTML = `
        <input type="text" name="bulk_full_name_${rowCount}" placeholder="اسم الطالب الرباعي" class="form-input" required>
        <button type="button" class="btn-danger-school btn-small" onclick="this.parentElement.remove()">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(row);
}

async function addStudent(e) {
    e.preventDefault();
    
    // Prevent double submission
    if (e.target.dataset.submitting === 'true') {
        return;
    }
    e.target.dataset.submitting = 'true';
    
    const formData = new FormData(e.target);
    const editingId = e.target.dataset.editingId;
    
    // Get form values
    const full_name = formData.get('full_name');
    const room = formData.get('room');
    const notes = formData.get('notes');
    const grade_level = formData.get('grade_level'); // Get the grade level from hidden input
    const parent_contact = formData.get('parent_contact'); // New field
    const blood_type = formData.get('blood_type'); // New field
    const chronic_disease = formData.get('chronic_disease'); // New field
    
    // Validate required fields
    if (!full_name || !room) {
        showNotification('جميع الحقول المطلوبة يجب أن تكون مملوءة', 'error');
        return;
    }
    
    // Create grade string (using the combined grade level for proper display)
    const gradeString = selectedGradeLevel || (currentSchool && currentSchool.level ? `${currentSchool.level} - ${grade_level}` : grade_level);
    
    const studentData = {
        full_name: full_name,
        grade: gradeString,
        room: room,
        notes: notes,
        parent_contact: parent_contact || null,
        blood_type: blood_type || null,
        chronic_disease: chronic_disease || null
    };
    
    try {
        if (editingId) {
            // Update existing student
            const response = await fetch(`/api/student/${editingId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(studentData)
            });
            
            if (response.ok) {
                showNotification('تم تحديث بيانات الطالب بنجاح!', 'success');
                
                // Reset form mode
                delete e.target.dataset.editingId;
                const submitBtn = e.target.querySelector('button[type="submit"]');
                submitBtn.innerHTML = '<i class="fas fa-save"></i> حفظ بيانات الطالب';
                
                // Reset form title back to "Add Student"
                const formContainer = e.target.closest('.add-student-form');
                if (formContainer) {
                    const titleElement = formContainer.querySelector('h3');
                    if (titleElement) {
                        titleElement.innerHTML = '<i class="fas fa-user-plus"></i> إضافة طالب جديد';
                    }
                }
            } else {
                const error = await response.json();
                showNotification(error.error || 'حدث خطأ في تحديث الطالب', 'error');
                return;
            }
        } else {
            // Add new student
            const response = await fetch(`/api/school/${currentSchool.id}/student`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(studentData)
            });
            
            if (response.ok) {
                const result = await response.json();
                showNotification(`تم حفظ بيانات الطالب بنجاح! رمز الطالب: <code class="code-btn" onclick="copyToClipboard('${escapeHtml(result.student.student_code)}')">${escapeHtml(result.student.student_code)}</code>`, 'success');
            } else {
                const error = await response.json();
                if (error.error_ar) {
                    showNotification(error.error_ar, 'error');
                } else {
                    showNotification(error.error || 'حدث خطأ في إضافة الطالب', 'error');
                }
                return;
            }
        }
        
        // Reload students from server
        await fetchStudents();
        
        // Reload grade content to update the student list
        if (selectedGradeLevel) {
            // Extract the original grade level from the combined grade level
            const parts = selectedGradeLevel.split(' - ');
            const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
            loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
        } else {
            // If no grade level is selected, refresh the global student list
            renderStudentsTable();
        }
        
        // Reset form
        e.target.reset();
        
    } catch (error) {
        console.error('Error saving student:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        // Reset submission lock
        e.target.dataset.submitting = 'false';
    }
}

function renderStudentsTable() {
    console.log('renderStudentsTable called, students array length:', students.length);
    console.log('Students array:', JSON.stringify(students, null, 2));
    
    // This function is now only used for the global student list
    // The grade-specific student list is rendered in loadGradeSubjectsForLevel()
    
    const tbody = document.getElementById('studentsTableBody');
    
    // It's okay if tbody doesn't exist since we're using dynamic grade-specific tables now
    if (!tbody) {
        console.log('studentsTableBody element not found - using dynamic grade tables instead');
        return;
    }

    console.log('Rendering students table, students array length:', students.length);

    // Sort students alphabetically by full name
    const sortedStudents = [...students]
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    
    // Remove duplicates by creating a map with full_name as key
    const uniqueStudents = [];
    const seenNames = new Set();
    
    sortedStudents.forEach(student => {
        if (!seenNames.has(student.full_name)) {
            seenNames.add(student.full_name);
            uniqueStudents.push(student);
        }
    });

    if (uniqueStudents.length === 0) {
        console.log('No students to display, showing empty message');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">لا يوجد طلاب مسجلين حالياً</td></tr>';
        return;
    }

    console.log('Rendering', uniqueStudents.length, 'students');
    tbody.innerHTML = uniqueStudents.map((student, index) => {
        // Get performance prediction if AI model is available
        let performanceLevel = 'غير محدد';
        let performanceClass = '';
        
        if (aiModel) {
            const prediction = aiModel.predictPerformance(student);
            performanceLevel = 
                prediction.level === 'excellent' ? 'ممتاز' :
                prediction.level === 'good' ? 'جيد' :
                prediction.level === 'average' ? 'متوسط' : 'يحتاج تحسناً';
            performanceClass = 
                prediction.level === 'excellent' ? 'excellent' :
                prediction.level === 'good' ? 'good' :
                prediction.level === 'average' ? 'average' : 'needs-improvement';
        }
        
        return `
        <tr data-id="${student.id}">
            <td>${index + 1}</td>
            <td><strong>${escapeHtml(student.full_name)}</strong></td>
            <td>${escapeHtml(student.room)}</td>
            <td><code class="code-btn" onclick="copyToClipboard('${escapeHtml(student.student_code)}')">${escapeHtml(student.student_code)}</code></td>
            <td><span class="performance-badge ${performanceClass}">${performanceLevel}</span></td>
            <td>
                <button class="btn-small btn-info" onclick="openGradesModal(${student.id})"><i class="fas fa-chart-line"></i> الدرجات</button>
                <button class="btn-small btn-success" onclick="openAttendanceModal(${student.id})"><i class="fas fa-calendar-check"></i> الحضور</button>
                <button class="btn-small btn-warning" onclick="openPromotionModal(${student.id})" title="ترقية الطالب"><i class="fas fa-arrow-up"></i> ترقية</button>
                <button class="btn-small btn-primary" onclick="openStudentHistoryModal(${student.id})" title="عرض السجل الأكاديمي"><i class="fas fa-history"></i> السجل</button>
                <button class="btn-small btn-info" onclick="editStudent(${student.id})"><i class="fas fa-edit"></i> تعديل</button>
                <button class="btn-small btn-danger" onclick="deleteStudent(${student.id})"><i class="fas fa-trash"></i> حذف</button>
            </td>
        </tr>
        `;
    }).join('');
    
    console.log('Finished rendering students table');
}

// Add search and filtering functionality
function searchStudents(gradeLevel) {
    // Get the grade level ID for the search input
    const gradeLevelId = gradeLevel ? gradeLevel.replace(/\s+/g, '-') : null;
    
    // Get search term from the grade-specific search input
    let searchTerm = '';
    if (gradeLevelId) {
        const searchInput = document.getElementById(`studentSearch-${gradeLevelId}`);
        if (searchInput) {
            searchTerm = searchInput.value.toLowerCase();
        }
    } else {
        // Fallback to global search input if no grade level specified
        const searchInput = document.getElementById('studentSearch');
        if (searchInput) {
            searchTerm = searchInput.value.toLowerCase();
        }
    }
    
    // Create combined grade level for filtering
    const combinedGradeLevel = currentSchool && currentSchool.level ? `${currentSchool.level} - ${gradeLevel}` : gradeLevel;
    
    // Filter students for the selected grade level and sort alphabetically
    const gradeLevelStudents = students
        .filter(student => {
            if (student.grade) {
                // For the grade level selection, we're looking for exact matches
                // The student.grade contains the full combined string like "إعدادية - الرابع الأدبي"
                // The combinedGradeLevel contains the same format
                return student.grade === combinedGradeLevel;
            }
            return false;
        })
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    
    // Filter students based on the search term
    const filteredStudents = gradeLevelStudents.filter(student => {
        return student.full_name.toLowerCase().includes(searchTerm);
    });
    
    // Remove duplicates by creating a map with full_name as key
    const uniqueStudents = [];
    const seenNames = new Set();
    
    filteredStudents.forEach(student => {
        if (!seenNames.has(student.full_name)) {
            seenNames.add(student.full_name);
            uniqueStudents.push(student);
        }
    });
    
    // Re-render table with filtered students
    const tbody = document.getElementById(`studentsTableBody-${gradeLevelId}`);
    // It's okay if tbody doesn't exist since we're using dynamic grade-specific tables now
    if (!tbody) {
        console.log('studentsTableBody element not found - using dynamic grade tables instead');
        return;
    }
    
    if (uniqueStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">لا توجد نتائج مطابقة للبحث</td></tr>';
        return;
    }
    
    tbody.innerHTML = uniqueStudents.map((student, index) => {
        // Get performance prediction if AI model is available
        let performanceLevel = 'غير محدد';
        let performanceClass = '';
        
        if (aiModel) {
            const prediction = aiModel.predictPerformance(student);
            performanceLevel = 
                prediction.level === 'excellent' ? 'ممتاز' :
                prediction.level === 'good' ? 'جيد' :
                prediction.level === 'average' ? 'متوسط' : 'يحتاج تحسناً';
            performanceClass = 
                prediction.level === 'excellent' ? 'excellent' :
                prediction.level === 'good' ? 'good' :
                prediction.level === 'average' ? 'average' : 'needs-improvement';
        }
        
        return `
        <tr data-id="${student.id}">
            <td>${index + 1}</td>
            <td><strong>${escapeHtml(student.full_name)}</strong></td>
            <td>${escapeHtml(student.room)}</td>
            <td><code class="code-btn" onclick="copyToClipboard('${escapeHtml(student.student_code)}')">${escapeHtml(student.student_code)}</code></td>
            <td><span class="performance-badge ${performanceClass}">${performanceLevel}</span></td>
            <td>
                <button class="btn-small btn-info" onclick="openGradesModal(${student.id})"><i class="fas fa-chart-line"></i> الدرجات</button>
                <button class="btn-small btn-success" onclick="openAttendanceModal(${student.id})"><i class="fas fa-calendar-check"></i> الحضور</button>
                <button class="btn-small btn-warning" onclick="openPromotionModal(${student.id})" title="ترقية الطالب"><i class="fas fa-arrow-up"></i> ترقية</button>
                <button class="btn-small btn-primary" onclick="openStudentHistoryModal(${student.id})" title="عرض السجل الأكاديمي"><i class="fas fa-history"></i> السجل</button>
                <button class="btn-small btn-info" onclick="editStudent(${student.id})"><i class="fas fa-edit"></i> تعديل</button>
                <button class="btn-small btn-danger" onclick="deleteStudent(${student.id})"><i class="fas fa-trash"></i> حذف</button>
            </td>
        </tr>
        `;
    }).join('');
}

// عرض معلومات الطالب الشخصية
function openStudentInfoModal(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) {
        showNotification('لم يتم العثور على بيانات الطالب', 'error');
        return;
    }
    
    // تعبئة بيانات الطالب في النافذة المنبثقة
    document.getElementById('infoStudentName').textContent = student.full_name || '-';
    document.getElementById('infoStudentGrade').textContent = student.grade || '-';
    document.getElementById('infoStudentRoom').textContent = student.room || '-';
    document.getElementById('infoStudentCode').textContent = student.student_code || '-';
    document.getElementById('infoParentContact').textContent = student.parent_contact || 'غير محدد';
    document.getElementById('infoBloodType').textContent = student.blood_type || 'غير محدد';
    document.getElementById('infoChronicDisease').textContent = student.chronic_disease || 'لا يوجد';
    document.getElementById('infoStudentNotes').textContent = student.notes || 'لا توجد ملاحظات';
    
    // فتح النافذة المنبثقة
    document.getElementById('studentInfoModal').style.display = 'flex';
}

// Make openStudentInfoModal available globally
window.openStudentInfoModal = openStudentInfoModal;

// إدارة الدرجات
async function openGradesModal(studentId) {
    currentStudentId = studentId;
    const student = students.find(s => s.id === studentId);
    if (!student) {
        showNotification('لم يتم العثور على بيانات الطالب', 'error');
        return;
    }
    
    document.getElementById('gradesStudentName').textContent = student.full_name;
    const codeElem = document.getElementById('gradesStudentCode');
    if (codeElem) {
        codeElem.textContent = student.student_code;
        codeElem.onclick = () => copyToClipboard(student.student_code);
    }
    
    // Make sure academic year is loaded
    if (!currentAcademicYear || !selectedAcademicYearId) {
        await loadAcademicYears();
    }
    
    // Show academic year info in the modal title
    const modalTitle = document.querySelector('#gradesModal .section-title');
    if (modalTitle && currentAcademicYear) {
        // Check if academic year badge already exists
        let yearBadge = modalTitle.querySelector('.academic-year-badge');
        if (!yearBadge) {
            yearBadge = document.createElement('span');
            yearBadge.className = 'academic-year-badge';
            yearBadge.style.cssText = 'background: #ffc107; color: #333; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; margin-right: 0.5rem;';
            modalTitle.appendChild(yearBadge);
        }
        yearBadge.innerHTML = `<i class="fas fa-calendar"></i> ${escapeHtml(currentAcademicYear.name)}`;
    }
    
    // Initialize grades object if not exists
    if (!student.grades) {
        student.grades = {};
    }
    
    // Load grades for the current academic year
    if (selectedAcademicYearId) {
        try {
            const yearGrades = await getStudentGradesForYear(studentId, selectedAcademicYearId);
            if (yearGrades && Object.keys(yearGrades).length > 0) {
                // Replace student grades with current academic year grades only
                student.grades = yearGrades;
                console.log('Grades loaded successfully:', yearGrades);
            } else {
                console.log('No grades found for academic year, initializing empty grades');
                // If no grades for current academic year, initialize with empty grades
                student.grades = {};
            }
        } catch (error) {
            console.error('Error fetching student grades:', error);
            showNotification('حدث خطأ أثناء تحميل الدرجات', 'error');
            // Initialize with empty grades to allow the interface to work
            student.grades = {};
        }
    } else {
        console.warn('Selected academic year ID is not set, initializing with empty grades');
        student.grades = {};
    }
    
    // Get the current grade level subjects - check both selectedGradeLevel and student's grade
    let currentGradeSubjects = getSubjectsForStudent(student);
    
    // Show message if no subjects are found
    if (currentGradeSubjects.length === 0) {
        showNotification('لا توجد مواد دراسية مضافة لهذا الصف. يرجى إضافة المواد أولاً.', 'warning');
    }
    
    // Ensure student has grades for all current grade subjects
    currentGradeSubjects.forEach(subject => {
        if (!student.grades[subject.name]) {
            student.grades[subject.name] = {
                month1: 0,
                month2: 0,
                midterm: 0,
                month3: 0,
                month4: 0,
                final: 0
            };
        }
    });
    
    // Also ensure that grades that exist but don't have corresponding subjects are preserved
    for (const subjectName in student.grades) {
        if (!currentGradeSubjects.some(subj => subj.name === subjectName)) {
            // Add this subject to the list to make sure it's displayed
            currentGradeSubjects.push({ name: subjectName });
        }
    }
    
    renderGradesTable();
    
    // Display performance insights and predictions
    displayPerformanceInsights(student);
    
    document.getElementById('gradesModal').style.display = 'flex';
}

// Helper function to get subjects for a specific student based on their grade level
function getSubjectsForStudent(student) {
    let currentGradeSubjects = [];
    
    // First try to use selectedGradeLevel if available
    if (selectedGradeLevel) {
        const parts = selectedGradeLevel.split(' - ');
        const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
        currentGradeSubjects = gradeSubjects[originalGradeLevel] || [];
    }
    
    // If no subjects found and student has a grade, try to extract from student's grade
    if (currentGradeSubjects.length === 0 && student && student.grade) {
        const studentGradeParts = student.grade.split(' - ');
        const studentGradeLevel = studentGradeParts.length > 1 ? studentGradeParts[1] : student.grade;
        currentGradeSubjects = gradeSubjects[studentGradeLevel] || [];
        
        // Also try with trimmed version
        if (currentGradeSubjects.length === 0) {
            currentGradeSubjects = gradeSubjects[studentGradeLevel.trim()] || [];
        }
    }
    
    return currentGradeSubjects;
}

function renderGradesTable() {
    const tbody = document.getElementById('gradesTableBody');
    if (!tbody) return;
    
    const student = students.find(s => s.id === currentStudentId);
    if (!student) return;
    
    // Get the current grade level subjects using the helper function
    let currentGradeSubjects = getSubjectsForStudent(student);
    
    // If no subjects found, check if there are any grades stored for the student
    if (currentGradeSubjects.length === 0) {
        // If there are grades but no subjects, try to get subjects from the grades themselves
        if (student.grades && Object.keys(student.grades).length > 0) {
            // Create subject objects from the grade keys
            currentGradeSubjects = Object.keys(student.grades).map(subjectName => ({
                name: subjectName
            }));
            console.log('Using grades to create subject list:', currentGradeSubjects);
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #6c757d;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                لا توجد مواد دراسية مضافة لهذا الصف.<br>
                <small>يرجى إضافة المواد الدراسية من قسم "المواد الدراسية" أولاً.</small>
            </td></tr>`;
            
            // Reset totals and averages
            resetTotalsAndAverages();
            return;
        }
    }
    
    // Initialize totals for each period
    const totals = {
        month1: 0,
        month2: 0,
        midterm: 0,
        month3: 0,
        month4: 0,
        final: 0
    };
    
    let subjectCount = currentGradeSubjects.length;
    
    tbody.innerHTML = currentGradeSubjects.map(subjectObj => {
        const subject = subjectObj.name;
        const grades = student.grades[subject] || {
            month1: 0, month2: 0, midterm: 0, month3: 0, month4: 0, final: 0
        };
        
        // Add to totals (only count non-zero grades for totals)
        Object.keys(totals).forEach(period => {
            const gradeValue = parseInt(grades[period]) || 0;
            totals[period] += gradeValue;
        });
        
        // Determine the latest grade and result with trend analysis
        const latestGrade = getLatestGrade(grades);
        const trendAnalysis = analyzeGradeTrend(grades, getMaxGradeForStudent(student));
        const result = getGradeResult(latestGrade, student, trendAnalysis);
        
        // Build tooltip with trend info
        let trendTooltip = '';
        if (trendAnalysis.trend !== 'none') {
            if (trendAnalysis.hasImprovement) {
                trendTooltip = 'تحسن ملحوظ في الأداء';
            } else if (trendAnalysis.hasDeterioration) {
                trendTooltip = 'تراجع في الأداء';
            }
        }
        
        return `
            <tr>
                <td><strong>${subject}</strong></td>
                <td><input type="number" class="grade-input" value="${grades.month1}" 
                          oninput="validateGradeInput(this, ${getMaxGradeForStudent(student)}); recalculateInsights()" onchange="updateGrade('${subject}', 'month1', this.value)" min="0" max="${getMaxGradeForStudent(student)}" data-max="${getMaxGradeForStudent(student)}"></td>
                <td><input type="number" class="grade-input" value="${grades.month2}" 
                          oninput="validateGradeInput(this, ${getMaxGradeForStudent(student)}); recalculateInsights()" onchange="updateGrade('${subject}', 'month2', this.value)" min="0" max="${getMaxGradeForStudent(student)}" data-max="${getMaxGradeForStudent(student)}"></td>
                <td><input type="number" class="grade-input" value="${grades.midterm}" 
                          oninput="validateGradeInput(this, ${getMaxGradeForStudent(student)}); recalculateInsights()" onchange="updateGrade('${subject}', 'midterm', this.value)" min="0" max="${getMaxGradeForStudent(student)}" data-max="${getMaxGradeForStudent(student)}"></td>
                <td><input type="number" class="grade-input" value="${grades.month3}" 
                          oninput="validateGradeInput(this, ${getMaxGradeForStudent(student)}); recalculateInsights()" onchange="updateGrade('${subject}', 'month3', this.value)" min="0" max="${getMaxGradeForStudent(student)}" data-max="${getMaxGradeForStudent(student)}"></td>
                <td><input type="number" class="grade-input" value="${grades.month4}" 
                          oninput="validateGradeInput(this, ${getMaxGradeForStudent(student)}); recalculateInsights()" onchange="updateGrade('${subject}', 'month4', this.value)" min="0" max="${getMaxGradeForStudent(student)}" data-max="${getMaxGradeForStudent(student)}"></td>
                <td><input type="number" class="grade-input" value="${grades.final}" 
                          oninput="validateGradeInput(this, ${getMaxGradeForStudent(student)}); recalculateInsights()" onchange="updateGrade('${subject}', 'final', this.value)" min="0" max="${getMaxGradeForStudent(student)}" data-max="${getMaxGradeForStudent(student)}"></td>
                <td><span class="result-${result.status}" title="${result.trendInfo || ''}">${result.text}${result.trendIcon || ''}</span></td>
            </tr>
        `;
    }).join('');
    
    // Update totals and averages
    updateTotalsAndAverages(totals, subjectCount);
    
    // Update performance insights if AI model is available
    if (aiModel && student) {
        const prediction = aiModel.predictPerformance(student);
        
        // Calculate average grade for display
        let totalGrades = 0;
        let gradeCount = 0;
        for (const subject in student.grades) {
            const subjectGrades = student.grades[subject];
            for (const period in subjectGrades) {
                const grade = parseInt(subjectGrades[period]) || 0;
                if (grade > 0) {
                    totalGrades += grade;
                    gradeCount++;
                }
            }
        }
        const avgGrade = gradeCount > 0 ? (totalGrades / gradeCount).toFixed(1) : 0;
        
        // Update performance insights
        document.getElementById('studentAvgGrade').textContent = avgGrade;
        document.getElementById('studentPerformancePrediction').textContent = 
            prediction.level === 'excellent' ? 'ممتاز' :
            prediction.level === 'good' ? 'جيد' :
            prediction.level === 'average' ? 'متوسط' : 'يحتاج تحسناً';
        
        // Update recommendations
        const recommendationsElem = document.getElementById('studentRecommendations');
        if (recommendationsElem) {
            if (prediction.recommendations) {
                // recommendations is now HTML string from generateProfessionalRecommendations
                recommendationsElem.innerHTML = prediction.recommendations;
            } else {
                recommendationsElem.textContent = '-';
            }
        }
    }
}

function getLatestGrade(grades) {
    // Check grades from final to month1 to find the latest non-zero grade
    const periods = ['final', 'month4', 'month3', 'midterm', 'month2', 'month1'];
    
    for (let period of periods) {
        const grade = parseInt(grades[period]) || 0;
        if (grade > 0) {
            return { grade, period };
        }
    }
    
    return { grade: 0, period: 'none' };
}

// Function to determine maximum grade based on student's grade level
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

// Function to validate grade input and show immediate visual feedback
function validateGradeInput(inputElement, maxGrade) {
    const value = parseInt(inputElement.value) || 0;
    
    // Remove any existing error styling
    inputElement.classList.remove('grade-input-error');
    
    // Remove any existing error tooltip
    const existingTooltip = inputElement.parentElement.querySelector('.grade-error-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // Check if value exceeds max grade
    if (value > maxGrade) {
        // Add error styling
        inputElement.classList.add('grade-input-error');
        
        // Show error notification
        showNotification(`خطأ: الدرجة القصوى لهذا الصف هي ${maxGrade}. الدرجة المدخلة (${value}) غير صالحة.`, 'error');
        
        // Reset to max grade after a short delay
        setTimeout(() => {
            inputElement.value = maxGrade;
            inputElement.classList.remove('grade-input-error');
        }, 1500);
        
        return false;
    }
    
    // Check if value is negative
    if (value < 0) {
        inputElement.classList.add('grade-input-error');
        showNotification('خطأ: لا يمكن إدخال درجة سالبة.', 'error');
        
        setTimeout(() => {
            inputElement.value = 0;
            inputElement.classList.remove('grade-input-error');
        }, 1500);
        
        return false;
    }
    
    return true;
}

function getGradeResult(latestGrade, student, trendAnalysis = null) {
    if (latestGrade.grade === 0) {
        return { status: 'pending', text: 'معلق', recommendation: 'لم يتم إدخال درجات بعد', trendIcon: '', trendInfo: '' };
    }
    
    // Determine pass threshold based on student's grade level
    const maxGrade = getMaxGradeForStudent(student);
    let passThreshold, safeThreshold;
    
    // For primary school grades 1-4, grade scale is 10
    if (maxGrade === 10) {
        passThreshold = 5;
        safeThreshold = 7;
    } else {
        passThreshold = 50;
        safeThreshold = 70;
    }
    
    // Build trend icon and info
    let trendIcon = '';
    let trendInfo = '';
    
    if (trendAnalysis) {
        if (trendAnalysis.hadZeroBeforeGoodGrade) {
            trendIcon = ' 📈';
            trendInfo = `تحسن ممتاز من 0 إلى ${trendAnalysis.latestGrade}/${maxGrade}! استمر في هذا التقدم مع الحفاظ على الاستمرارية.`;
        } else if (trendAnalysis.hasImprovement) {
            trendIcon = ' ↑';
            trendInfo = `مسار تصاعدي: ${trendAnalysis.firstGrade} → ${trendAnalysis.latestGrade}/${maxGrade}`;
        } else if (trendAnalysis.hasDeterioration) {
            trendIcon = ' ↓';
            trendInfo = `مسار تنازلي: ${trendAnalysis.firstGrade} → ${trendAnalysis.latestGrade}/${maxGrade}`;
        } else if (trendAnalysis.consistency === 'inconsistent') {
            trendIcon = ' ⚡';
            trendInfo = 'أداء غير مستقر - يحتاج متابعة';
        }
    }
    
    if (latestGrade.grade >= safeThreshold) {
        // Safe pass - no risk
        let recommendation = 'أداء ممتاز! استمر على هذا المستوى الرائع.';
        
        // Add trend-specific recommendation
        if (trendAnalysis && trendAnalysis.hadZeroBeforeGoodGrade) {
            recommendation = `تحسن ممتاز! من 0 إلى ${latestGrade.grade}/${maxGrade}. استمر في هذا التقدم مع الحفاظ على الاستمرارية في جميع الفترات.`;
        } else if (trendAnalysis && trendAnalysis.hasImprovement) {
            recommendation = `مسار تصاعدي ممتاز! استمر في الحفاظ على هذا المستوى.`;
        } else if (trendAnalysis && trendAnalysis.consistency === 'inconsistent') {
            recommendation = 'ناجح ولكن الأداء غير مستقر. يُنصح بالحفاظ على أداء ثابت في جميع الفترات.';
        }
        
        return { 
            status: 'pass-safe', 
            text: 'ناجح', 
            recommendation,
            riskLevel: 'safe',
            trendIcon,
            trendInfo
        };
    } else if (latestGrade.grade >= passThreshold) {
        // At-risk pass - warning
        let recommendation = 'تحذير: الطالب ناجح ولكن في منطقة الخطر. يحتاج لمزيد من المتابعة والدعم لتجنب الرسوب.';
        
        // Add trend-specific recommendation
        if (trendAnalysis && trendAnalysis.hadZeroBeforeGoodGrade) {
            recommendation = `تحسن ملحوظ! لكن لا يزال في منطقة الخطر (${latestGrade.grade}/${maxGrade}). استمر في التحسن للوصول للمنطقة الآمنة (${safeThreshold}/${maxGrade}).`;
        } else if (trendAnalysis && trendAnalysis.hasImprovement) {
            recommendation = `مسار تصاعدي جيد! استمر للوصول للمنطقة الآمنة (${safeThreshold}/${maxGrade}).`;
        } else if (trendAnalysis && trendAnalysis.hasDeterioration) {
            recommendation = `تحذير: مسار تنازلي! الدرجات تتراجع من ${trendAnalysis.firstGrade} إلى ${latestGrade.grade}/${maxGrade}. يحتاج تدخل عاجل.`;
        }
        
        return { 
            status: 'pass-at-risk', 
            text: 'ناجح (تحذير)', 
            recommendation,
            riskLevel: 'at-risk',
            trendIcon,
            trendInfo
        };
    } else {
        // Fail
        let recommendation = 'يحتاج الطالب لخطة تقوية عاجلة ومتابعة مكثفة مع الأهل.';
        
        // Add trend-specific recommendation
        if (trendAnalysis && trendAnalysis.hasImprovement) {
            recommendation = `تحسن ملحوظ! ارتفعت الدرجة من ${trendAnalysis.firstGrade} إلى ${latestGrade.grade}/${maxGrade}. استمر في التحسن للوصول لدرجة النجاح (${passThreshold}/${maxGrade}).`;
        } else if (trendAnalysis && trendAnalysis.hasDeterioration) {
            recommendation = `تحذير شديد: الدرجات تتراجع من ${trendAnalysis.firstGrade} إلى ${latestGrade.grade}/${maxGrade}. يحتاج تدخل فوري!`;
        }
        
        return { 
            status: 'fail', 
            text: 'راسب', 
            recommendation,
            riskLevel: 'fail',
            trendIcon,
            trendInfo
        };
    }
}

// Helper function to get grade thresholds for a student
function getGradeThresholds(student) {
    const maxGrade = getMaxGradeForStudent(student);
    
    if (maxGrade === 10) {
        return {
            maxGrade: 10,
            passThreshold: 5,
            safeThreshold: 7,
            atRiskRange: '5-6',
            safeRange: '7-10',
            failRange: '0-4'
        };
    } else {
        return {
            maxGrade: 100,
            passThreshold: 50,
            safeThreshold: 70,
            atRiskRange: '50-69',
            safeRange: '70-100',
            failRange: '0-49'
        };
    }
}

// Function to get detailed grade status for a single grade value
function getDetailedGradeStatus(gradeValue, student) {
    const thresholds = getGradeThresholds(student);
    
    if (gradeValue === 0) {
        return {
            status: 'pending',
            text: 'معلق',
            cssClass: 'grade-pending',
            recommendation: 'لم يتم إدخال الدرجة بعد'
        };
    } else if (gradeValue >= thresholds.safeThreshold) {
        return {
            status: 'safe',
            text: 'آمن',
            cssClass: 'grade-safe',
            recommendation: 'أداء ممتاز - لا يوجد خطر'
        };
    } else if (gradeValue >= thresholds.passThreshold) {
        return {
            status: 'at-risk',
            text: 'تحذير',
            cssClass: 'grade-at-risk',
            recommendation: 'ناجح ولكن في منطقة الخطر - يحتاج متابعة'
        };
    } else {
        return {
            status: 'fail',
            text: 'راسب',
            cssClass: 'grade-fail',
            recommendation: 'يحتاج خطة تقوية عاجلة'
        };
    }
}

function updateTotalsAndAverages(totals, subjectCount) {
    // Update totals
    document.getElementById('month1Total').textContent = totals.month1;
    document.getElementById('month2Total').textContent = totals.month2;
    document.getElementById('midtermTotal').textContent = totals.midterm;
    document.getElementById('month3Total').textContent = totals.month3;
    document.getElementById('month4Total').textContent = totals.month4;
    document.getElementById('finalTotal').textContent = totals.final;
    
    // Calculate and update averages
    if (subjectCount > 0) {
        const month1Avg = (totals.month1 / subjectCount).toFixed(1);
        const month2Avg = (totals.month2 / subjectCount).toFixed(1);
        const midtermAvg = (totals.midterm / subjectCount).toFixed(1);
        const month3Avg = (totals.month3 / subjectCount).toFixed(1);
        const month4Avg = (totals.month4 / subjectCount).toFixed(1);
        const finalAvg = (totals.final / subjectCount).toFixed(1);
        
        document.getElementById('month1Average').textContent = month1Avg;
        document.getElementById('month2Average').textContent = month2Avg;
        document.getElementById('midtermAverage').textContent = midtermAvg;
        document.getElementById('month3Average').textContent = month3Avg;
        document.getElementById('month4Average').textContent = month4Avg;
        document.getElementById('finalAverage').textContent = finalAvg;
        
        // Calculate overall average (sum of all periods divided by total possible)
        const totalSum = Object.values(totals).reduce((sum, val) => sum + val, 0);
        const overallAvg = (totalSum / (subjectCount * 6)).toFixed(1);
        document.getElementById('overallAverage').textContent = overallAvg;
    }
}

// Function to reset totals and averages when no subjects are found
function resetTotalsAndAverages() {
    const periods = ['month1', 'month2', 'midterm', 'month3', 'month4', 'final'];
    periods.forEach(period => {
        const totalElem = document.getElementById(period + 'Total');
        const avgElem = document.getElementById(period + 'Average');
        if (totalElem) totalElem.textContent = '0';
        if (avgElem) avgElem.textContent = '0';
    });
    if (document.getElementById('overallAverage')) {
        document.getElementById('overallAverage').textContent = '0';
    }
    // Reset performance insights
    if (document.getElementById('studentAvgGrade')) {
        document.getElementById('studentAvgGrade').textContent = '0';
    }
    if (document.getElementById('studentPerformancePrediction')) {
        document.getElementById('studentPerformancePrediction').textContent = '-';
    }
    if (document.getElementById('studentRecommendations')) {
        document.getElementById('studentRecommendations').textContent = '-';
    }
}

function recalculateInsights() {
    const student = students.find(s => s.id === currentStudentId);
    if (!student) return;

    // We'll temporarily update the student's grades object with values from inputs
    // but we won't save to server here (that's for updateGrade onchange)
    const tbody = document.getElementById('gradesTableBody');
    const rows = tbody.querySelectorAll('tr');
    
    let tempGrades = {};
    let totalGrades = 0;
    let gradeCount = 0;
    
    rows.forEach(row => {
        const subject = row.cells[0].textContent.trim();
        const inputs = row.querySelectorAll('.grade-input');
        const periods = ['month1', 'month2', 'midterm', 'month3', 'month4', 'final'];
        
        tempGrades[subject] = {};
        inputs.forEach((input, index) => {
            const val = parseInt(input.value) || 0;
            const period = periods[index];
            tempGrades[subject][period] = val;
            
            if (val > 0) {
                totalGrades += val;
                gradeCount++;
            }
        });
    });

    // Create a temporary student object for the AI model
    const tempStudent = { ...student, grades: tempGrades };
    const prediction = aiModel.predictPerformance(tempStudent);
    
    // Update UI
    const maxGrade = getMaxGradeForStudent(student);
    const avgGrade = gradeCount > 0 ? (totalGrades / gradeCount).toFixed(1) : 0;
    
    document.getElementById('studentAvgGrade').textContent = avgGrade;
    document.getElementById('studentPerformancePrediction').textContent = 
        prediction.level === 'excellent' ? 'ممتاز' :
        prediction.level === 'good' ? 'جيد' :
        prediction.level === 'average' ? 'متوسط' : 'يحتاج تحسناً';
    
    // Update recommendations
    const recommendationsElem = document.getElementById('studentRecommendations');
    if (recommendationsElem) {
        if (prediction.recommendations) {
            // recommendations is now HTML string from generateProfessionalRecommendations
            recommendationsElem.innerHTML = prediction.recommendations;
        } else {
            recommendationsElem.textContent = '-';
        }
    }
        
    // Also update the overall average in the footer
    if (document.getElementById('overallAverage')) {
        // Calculate totals for each period for the footer
        const periodTotals = { month1: 0, month2: 0, midterm: 0, month3: 0, month4: 0, final: 0 };
        const periods = ['month1', 'month2', 'midterm', 'month3', 'month4', 'final'];
        
        Object.values(tempGrades).forEach(subjGrades => {
            periods.forEach(p => {
                periodTotals[p] += subjGrades[p] || 0;
            });
        });
        
        const subjectCount = Object.keys(tempGrades).length;
        if (subjectCount > 0) {
            periods.forEach((p, idx) => {
                const totalElem = document.getElementById(p + 'Total');
                const avgElem = document.getElementById(p + 'Average');
                if (totalElem) totalElem.textContent = periodTotals[p];
                if (avgElem) avgElem.textContent = (periodTotals[p] / subjectCount).toFixed(1);
            });
            
            const grandTotal = Object.values(periodTotals).reduce((a, b) => a + b, 0);
            const overallAvg = (grandTotal / (subjectCount * 6)).toFixed(1);
            document.getElementById('overallAverage').textContent = overallAvg;
        }
    }
}

async function updateGrade(subject, period, value) {
    const student = students.find(s => s.id === currentStudentId);
    if (!student) return;
    
    // Get max grade for this student
    const maxGrade = getMaxGradeForStudent(student);
    const gradeValue = parseInt(value) || 0;
    
    // Validate grade against max grade limit
    if (gradeValue > maxGrade) {
        showNotification(`خطأ: الدرجة القصوى لهذا الصف هي ${maxGrade}. لا يمكن إدخال درجة أعلى من ${maxGrade}.`, 'error');
        // Reset the input to max grade
        renderGradesTable();
        return;
    }
    
    if (gradeValue < 0) {
        showNotification('خطأ: لا يمكن إدخال درجة سالبة.', 'error');
        renderGradesTable();
        return;
    }
    
    if (!student.grades) {
        student.grades = {};
    }
    
    if (!student.grades[subject]) {
        student.grades[subject] = {};
    }
    
    student.grades[subject][period] = gradeValue;
    
    // Save to server
    try {
        const response = await fetch(`/api/student/${currentStudentId}/detailed`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                detailed_scores: student.grades,
                daily_attendance: student.attendance || {}
            })
        });
        
        if (response.ok) {
            // Show brief success feedback
            console.log('Grade saved successfully for', subject, period, value);
            
            // Also save to academic year tables if an academic year is selected
            if (selectedAcademicYearId && student.grades) {
                const saved = await saveStudentGradesForYear(currentStudentId, selectedAcademicYearId, student.grades);
            }
        } else {
            const errorData = await response.json();
            console.error('Server error saving grades:', errorData);
            // Show server error message (which includes grade validation)
            const errorMessage = errorData.error_ar || errorData.error || 'حدث خطأ في حفظ الدرجات';
            showNotification(errorMessage, 'error');
            renderGradesTable();
            return;
        }
    } catch (error) {
        console.error('Error saving grades:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
    
    // Re-render the table to update totals and averages
    renderGradesTable();
}

async function saveGrades() {
    const student = students.find(s => s.id === currentStudentId);
    if (!student) {
        showNotification('لم يتم العثور على الطالب', 'error');
        return;
    }
    
    // Save to original student record for backward compatibility
    try {
        const response = await fetch(`/api/student/${currentStudentId}/detailed`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                detailed_scores: student.grades || {},
                daily_attendance: student.attendance || {}
            })
        });
        
        if (!response.ok) {
            showNotification('حدث خطأ في حفظ الدرجات', 'error');
            return;
        }
    } catch (error) {
        console.error('Error saving grades:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        return;
    }
    
    // Also save to academic year tables if an academic year is selected
    if (selectedAcademicYearId && student.grades) {
        const saved = await saveStudentGradesForYear(currentStudentId, selectedAcademicYearId, student.grades);
        if (saved) {
            showNotification(`تم حفظ الدرجات بنجاح للسنة الدراسية ${currentAcademicYear?.name || ''}`, 'success');
        }
    } else {
        showNotification('تم حفظ الدرجات بنجاح', 'success');
    }
    
    closeModal('gradesModal');
}

// إدارة الحضور
async function openAttendanceModal(studentId) {
    currentStudentId = studentId;
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    
    document.getElementById('attendanceStudentName').textContent = student.full_name;
    const codeElem = document.getElementById('attendanceStudentCode');
    if (codeElem) {
        codeElem.textContent = student.student_code;
        codeElem.onclick = () => copyToClipboard(student.student_code);
    }
    document.getElementById('attendanceDate').value = new Date().toISOString().split('T')[0];
    
    // Show academic year info in the modal title
    const modalTitle = document.querySelector('#attendanceModal .section-title');
    if (modalTitle && currentAcademicYear) {
        let yearBadge = modalTitle.querySelector('.academic-year-badge');
        if (!yearBadge) {
            yearBadge = document.createElement('span');
            yearBadge.className = 'academic-year-badge';
            yearBadge.style.cssText = 'background: #ffc107; color: #333; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; margin-right: 0.5rem;';
            modalTitle.appendChild(yearBadge);
        }
        yearBadge.innerHTML = `<i class="fas fa-calendar"></i> ${escapeHtml(currentAcademicYear.name)}`;
    }
    
    // Initialize attendance if not exists
    if (!student.attendance) {
        student.attendance = {};
    }
    
    // Load attendance for the current academic year
    if (selectedAcademicYearId) {
        const yearAttendance = await getStudentAttendanceForYear(studentId, selectedAcademicYearId);
        if (Object.keys(yearAttendance).length > 0) {
            // Replace student attendance with current academic year attendance only
            student.attendance = yearAttendance;
        } else {
            // If no attendance for current academic year, initialize with empty attendance
            student.attendance = {};
        }
    }
    
    renderAttendanceTable();
    document.getElementById('attendanceModal').style.display = 'flex';
}

async function addDailyAttendance() {
    const date = document.getElementById('attendanceDate').value;
    if (!date) {
        showNotification('يرجى اختيار التاريخ', 'error');
        return;
    }
    
    const student = students.find(s => s.id === currentStudentId);
    if (!student) return;
    
    if (!student.attendance) {
        student.attendance = {};
    }
    
    if (student.attendance[date]) {
        showNotification('حضور هذا اليوم موجود بالفعل', 'error');
        return;
    }
    
    // Get the current grade level subjects
    let currentGradeSubjects = [];
    if (selectedGradeLevel) {
        // Extract the original grade level from the combined grade level
        const parts = selectedGradeLevel.split(' - ');
        const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
        currentGradeSubjects = gradeSubjects[originalGradeLevel] || [];
    }
    
    // Initialize attendance for all subjects
    student.attendance[date] = {};
    currentGradeSubjects.forEach(subjectObj => {
        student.attendance[date][subjectObj.name] = 'حاضر'; // Default to present
    });
    
    // Save to server
    try {
        const response = await fetch(`/api/student/${currentStudentId}/detailed`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                detailed_scores: student.grades || {},
                daily_attendance: student.attendance
            })
        });
        
        if (response.ok) {
            renderAttendanceTable();
            showNotification('تم إضافة يوم جديد', 'success');
        } else {
            showNotification('حدث خطأ في حفظ بيانات الحضور', 'error');
        }
    } catch (error) {
        console.error('Error saving attendance:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

function renderAttendanceTable() {
    const container = document.getElementById('attendanceTableContainer');
    if (!container) return;
    
    const student = students.find(s => s.id === currentStudentId);
    if (!student || !student.attendance) {
        container.innerHTML = '<p>لا يوجد بيانات حضور</p>';
        return;
    }
    
    // Get the current grade level subjects
    let currentGradeSubjects = [];
    if (selectedGradeLevel) {
        // Extract the original grade level from the combined grade level
        const parts = selectedGradeLevel.split(' - ');
        const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
        currentGradeSubjects = gradeSubjects[originalGradeLevel] || [];
    }
    
    const dates = Object.keys(student.attendance).sort().reverse();
    
    container.innerHTML = dates.map(date => {
        const attendance = student.attendance[date];
        
        return `
            <div class="attendance-day">
                <div class="day-header">
                    <span>تاريخ: ${date}</span>
                    <button class="btn-small btn-danger" onclick="removeDayAttendance('${date}')">
                        <i class="fas fa-trash"></i> حذف اليوم
                    </button>
                </div>
                <div class="subjects-attendance">
                    ${currentGradeSubjects.map(subjectObj => {
                        const subject = subjectObj.name;
                        return `
                        <div class="subject-attendance">
                            <span>${subject}</span>
                            <div class="attendance-status">
                                <button class="status-btn status-present ${attendance[subject] === 'حاضر' ? 'active' : ''}" 
                                        onclick="setAttendanceStatus('${date}', '${subject}', 'حاضر')">حاضر</button>
                                <button class="status-btn status-absent ${attendance[subject] === 'غائب' ? 'active' : ''}" 
                                        onclick="setAttendanceStatus('${date}', '${subject}', 'غائب')">غائب</button>
                                <button class="status-btn status-leave ${attendance[subject] === 'إجازة' ? 'active' : ''}" 
                                        onclick="setAttendanceStatus('${date}', '${subject}', 'إجازة')">إجازة</button>
                            </div>
                        </div>
                    `;}).join('')}
                </div>
            </div>
        `;
    }).join('');
}

async function setAttendanceStatus(date, subject, status) {
    const student = students.find(s => s.id === currentStudentId);
    if (!student) return;
    
    if (!student.attendance) {
        student.attendance = {};
    }
    
    if (!student.attendance[date]) {
        student.attendance[date] = {};
    }
    
    student.attendance[date][subject] = status;
    
    // Save to server
    try {
        const response = await fetch(`/api/student/${currentStudentId}/detailed`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                detailed_scores: student.grades || {},
                daily_attendance: student.attendance
            })
        });
        
        if (!response.ok) {
            showNotification('حدث خطأ في حفظ بيانات الحضور', 'error');
        }
    } catch (error) {
        console.error('Error saving attendance:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
    
    renderAttendanceTable();
}

function removeDayAttendance(date) {
    if (!confirm(`هل أنت متأكد من حذف حضور يوم ${date}؟`)) {
        return;
    }
    
    const student = students.find(s => s.id === currentStudentId);
    if (!student) return;
    
    delete student.attendance[date];
    renderAttendanceTable();
    showNotification('تم حذف حضور اليوم', 'success');
}

async function saveAttendance() {
    const student = students.find(s => s.id === currentStudentId);
    if (!student) {
        showNotification('لم يتم العثور على الطالب', 'error');
        return;
    }
    
    // Save to original student record for backward compatibility
    try {
        const response = await fetch(`/api/student/${currentStudentId}/detailed`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                detailed_scores: student.grades || {},
                daily_attendance: student.attendance || {}
            })
        });
        
        if (!response.ok) {
            showNotification('حدث خطأ في حفظ الحضور', 'error');
            return;
        }
    } catch (error) {
        console.error('Error saving attendance:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        return;
    }
    
    // Also save to academic year tables if an academic year is selected
    if (selectedAcademicYearId && student.attendance) {
        // Convert attendance format for API
        const attendanceForApi = {};
        for (const date in student.attendance) {
            const dayData = student.attendance[date];
            if (typeof dayData === 'object') {
                // If it's subject-based attendance, determine overall status
                const statuses = Object.values(dayData);
                const absentCount = statuses.filter(s => s === 'غائب' || s === 'absent').length;
                const lateCount = statuses.filter(s => s === 'متأخر' || s === 'late').length;
                
                let status = 'present';
                if (absentCount > statuses.length / 2) status = 'absent';
                else if (lateCount > 0) status = 'late';
                
                attendanceForApi[date] = { status, notes: '' };
            } else {
                attendanceForApi[date] = { status: dayData, notes: '' };
            }
        }
        
        const saved = await saveStudentAttendanceForYear(currentStudentId, selectedAcademicYearId, attendanceForApi);
        if (saved) {
            showNotification(`تم حفظ بيانات الحضور بنجاح للسنة الدراسية ${currentAcademicYear?.name || ''}`, 'success');
        }
    } else {
        showNotification('تم حفظ بيانات الحضور بنجاح', 'success');
    }
    
    closeModal('attendanceModal');
}

// دوال مساعدة
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function copyToClipboard(text) {
    // Always use fallback for compatibility
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showNotification(`تم نسخ الرمز: ${text}`, 'info');
}

function editStudent(id) {
    const student = students.find(s => s.id === id);
    if (!student) return;
    
    // Get the grade level from the student's grade
    let gradeLevelId = '';
    let gradeLevelName = '';
    if (selectedGradeLevel) {
        const parts = selectedGradeLevel.split(' - ');
        gradeLevelName = parts.length > 1 ? parts[1] : selectedGradeLevel;
        gradeLevelId = gradeLevelName.replace(/\s+/g, '-');
    }
    
    // Check if form exists, if not, create it first
    let form = document.getElementById(`addStudentForm-${gradeLevelId}`) || document.getElementById('addStudentForm');
    if (!form) {
        // Create the form by calling showAddStudentForm
        if (selectedGradeLevel) {
            showAddStudentForm(gradeLevelName);
            // Now get the form after it's created
            form = document.getElementById(`addStudentForm-${gradeLevelId}`);
        }
    }
    
    if (!form) {
        showNotification('لم يتم العثور على نموذج التعديل', 'error');
        return;
    }
    
    // Fill the form with student data for editing
    form.full_name.value = student.full_name;
    form.room.value = student.room;
    if (form.notes) {
        form.notes.value = student.notes || '';
    }
    
    // Fill new fields
    if (form.parent_contact) {
        form.parent_contact.value = student.parent_contact || '';
    }
    if (form.blood_type) {
        form.blood_type.value = student.blood_type || '';
    }
    if (form.chronic_disease) {
        form.chronic_disease.value = student.chronic_disease || '';
    }
    
    // Change button text and add update functionality
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-save"></i> تحديث بيانات الطالب';
    
    // Update form title to indicate edit mode
    const formContainer = form.closest('.add-student-form');
    if (formContainer) {
        const titleElement = formContainer.querySelector('h3');
        if (titleElement) {
            titleElement.innerHTML = `<i class="fas fa-user-edit"></i> تعديل بيانات الطالب: ${escapeHtml(student.full_name)}`;
        }
    }
    
    // Store the student ID for updating
    form.dataset.editingId = id;
    
    // Scroll to form
    form.scrollIntoView({ behavior: 'smooth' });
}

async function deleteStudent(id) {
    if (!confirm('هل أنت متأكد من حذف بيانات هذا الطالب؟')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/student/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            // Reload students from server
            await fetchStudents();
            
            // Reload grade content
            if (selectedGradeLevel) {
                loadGradeSubjectsForLevel(selectedGradeLevel);
            }
            
            showNotification('تم حذف بيانات الطالب بنجاح', 'success');
        } else {
            const error = await response.json();
            showNotification(error.error || 'حدث خطأ في حذف الطالب', 'error');
        }
    } catch (error) {
        console.error('Error deleting student:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
    }
}

function logout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.removeItem('token');
        localStorage.removeItem('school');
        localStorage.removeItem('subjects'); // Keep subjects as they are school-specific
        window.location.href = '/index.html';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 9999;
        max-width: 400px;
        word-wrap: break-word;
        animation: slideIn 0.3s ease;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// إضافة دوال جديدة للتبديل بين التبويبات
function switchTab(tabId) {
    // إخفاء جميع التبويبات
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // إزالة الفئة النشطة من جميع الأزرار
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // إظهار التبويب المحدد
    document.getElementById(tabId).classList.add('active');
    
    // تعيين الزر المضغوط كنشط
    event.target.classList.add('active');
}

// Update the updateGradeOptionsBasedOnLevel function to work with the new structure
function updateGradeOptionsBasedOnLevel(educationalLevel, formType = 'single') {
    // This function is kept for backward compatibility but is not used in the new structure
}

// Update the existing updateGradeOptions function to work with the new structure
function updateGradeOptions(level) {
    // This function is kept for backward compatibility but is not used in the new structure
}

function setupBulkRegistration() {
    // Get the current grade level from the selectedGradeLevel variable
    if (!selectedGradeLevel) return;
    
    // Extract the original grade level from the combined grade level
    const parts = selectedGradeLevel.split(' - ');
    const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
    const gradeLevelId = originalGradeLevel.replace(/\s+/g, '-');
    
    // Toggle bulk registration form
    const toggleBtn = document.getElementById(`toggleBulkRegistration-${gradeLevelId}`);
    const singleForm = document.getElementById(`addStudentForm-${gradeLevelId}`);
    const bulkForm = document.getElementById(`bulkAddStudentForm-${gradeLevelId}`);
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (singleForm.style.display === 'none') {
                singleForm.style.display = 'block';
                bulkForm.style.display = 'none';
                toggleBtn.innerHTML = '<i class="fas fa-users"></i> التبديل إلى التسجيل الجماعي';
            } else {
                singleForm.style.display = 'none';
                bulkForm.style.display = 'block';
                toggleBtn.innerHTML = '<i class="fas fa-user"></i> التبديل إلى التسجيل الفردي';
            }
        });
    }
    
    // Add new student row in bulk form
    const addRowBtn = document.getElementById(`addBulkStudentRow-${gradeLevelId}`);
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => addBulkStudentRow(gradeLevelId));
    }
    
    // Remove student row
    const bulkStudentsList = document.getElementById(`bulkStudentsList-${gradeLevelId}`);
    if (bulkStudentsList) {
        bulkStudentsList.addEventListener('click', function(e) {
            if (e.target.closest('.remove-student-row')) {
                const row = e.target.closest('.bulk-student-row');
                if (bulkStudentsList.querySelectorAll('.bulk-student-row').length > 1) {
                    row.remove();
                } else {
                    showNotification('يجب أن يبقى طالب واحد على الأقل', 'error');
                }
            }
        });
    }
    
    // Reset bulk form
    const resetBulkBtn = document.getElementById(`resetBulkFormBtn-${gradeLevelId}`);
    if (resetBulkBtn) {
        resetBulkBtn.addEventListener('click', () => resetBulkForm(gradeLevelId));
    }
    
    // Cancel bulk registration
    const cancelBulkBtn = document.getElementById(`cancelBulkRegistration-${gradeLevelId}`);
    if (cancelBulkBtn) {
        cancelBulkBtn.addEventListener('click', () => {
            singleForm.style.display = 'block';
            bulkForm.style.display = 'none';
            toggleBtn.innerHTML = '<i class="fas fa-users"></i> التبديل إلى التسجيل الجماعي';
            resetBulkForm(gradeLevelId);
        });
    }
    
    // Reset single form
    const resetFormBtn = document.getElementById(`resetFormBtn-${gradeLevelId}`);
    if (resetFormBtn) {
        resetFormBtn.addEventListener('click', () => {
            document.getElementById(`addStudentForm-${gradeLevelId}`).reset();
        });
    }
    
    // Forms are handled via event delegation in setupEventListeners, no need for direct listeners here
}

function addBulkStudentRow(gradeLevelId) {
    const container = document.getElementById(`bulkStudentsList-${gradeLevelId}`);
    const rowCount = container.querySelectorAll('.bulk-student-row').length + 1;
    
    const row = document.createElement('div');
    row.className = 'bulk-student-row';
    row.innerHTML = `
        <input type="text" name="bulk_full_name_${rowCount}" placeholder="اسم الطالب الرباعي" class="form-input" required>
        <textarea name="bulk_notes_${rowCount}" placeholder="ملاحظات" class="textarea-school form-input"></textarea>
        <button type="button" class="btn-danger-school btn-small remove-student-row">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(row);
}

function resetBulkForm(gradeLevelId) {
    const bulkForm = document.getElementById(`bulkAddStudentForm-${gradeLevelId}`);
    if (bulkForm) {
        bulkForm.reset();
        
        // Reset to single student row
        const container = document.getElementById(`bulkStudentsList-${gradeLevelId}`);
        container.innerHTML = `
            <div class="bulk-student-row">
                <input type="text" name="bulk_full_name_1" placeholder="اسم الطالب الرباعي" class="form-input" required>
                <textarea name="bulk_notes_1" placeholder="ملاحظات" class="textarea-school form-input"></textarea>
                <button type="button" class="btn-danger-school btn-small remove-student-row">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }
}

async function addBulkStudents(e, originalGradeLevel) {
    e.preventDefault();
    
    // Prevent double submission
    if (e.target.dataset.submitting === 'true') {
        return;
    }
    e.target.dataset.submitting = 'true';
    
    const formData = new FormData(e.target);
    const room = formData.get('bulk_room');
    const grade_level = formData.get('bulk_grade_level'); // Get the grade level from hidden input
    
    // Validate required fields
    if (!room) {
        showNotification('جميع الحقول المطلوبة يجب أن تكون مملوءة', 'error');
        e.target.dataset.submitting = 'false';
        return;
    }
    
    // Get all student rows
    const studentRows = document.querySelectorAll('.bulk-student-row');
    const students = [];
    
    for (let i = 0; i < studentRows.length; i++) {
        const fullName = formData.get(`bulk_full_name_${i + 1}`);
        const notes = formData.get(`bulk_notes_${i + 1}`);
        
        // Validate required fields for each student
        if (!fullName) {
            showNotification('جميع الحقول المطلوبة لكل طالب يجب أن تكون مملوءة', 'error');
            return;
        }
        
        if (fullName) {
            // Create grade string (using the combined grade level for proper display)
            const gradeString = selectedGradeLevel || (currentSchool && currentSchool.level ? `${currentSchool.level} - ${grade_level}` : grade_level);
            
            students.push({
                full_name: fullName,
                grade: gradeString,
                room: room,
                notes: notes || ''
            });
        }
    }
    
    if (students.length === 0) {
        showNotification('يرجى إدخال بيانات طالب واحد على الأقل', 'error');
        return;
    }
    
    // Add students
    let successCount = 0;
    let errorCount = 0;
    
    for (const student of students) {
        try {
            const response = await fetch(`/api/school/${currentSchool.id}/student`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(student)
            });
            
            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error('Error saving student:', error);
            errorCount++;
        }
    }
    
    // Show result notification
    if (errorCount === 0) {
        showNotification(`تم تسجيل ${successCount} طالب بنجاح!`, 'success');
        resetBulkForm();
        await fetchStudents(); // Refresh student list
        
        // Reload grade content
        if (selectedGradeLevel) {
            // Extract the original grade level from the combined grade level
            const parts = selectedGradeLevel.split(' - ');
            const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
            loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
        }
    } else if (successCount > 0) {
        showNotification(`تم تسجيل ${successCount} طالب بنجاح، فشل تسجيل ${errorCount} طالب`, 'info');
        await fetchStudents(); // Refresh student list
        
        // Reload grade content
        if (selectedGradeLevel) {
            // Extract the original grade level from the combined grade level
            const parts = selectedGradeLevel.split(' - ');
            const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
            loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
        }
    } else {
        showNotification('فشل تسجيل جميع الطلاب', 'error');
    }
    
    // Reset submission lock
    e.target.dataset.submitting = 'false';
}

function setupKeyboardShortcuts() {
    // Ctrl+Shift+B to toggle bulk registration
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'B') {
            e.preventDefault();
            document.getElementById('toggleBulkRegistration')?.click();
        }
        
        // Ctrl+Enter to submit forms
        if (e.ctrlKey && e.key === 'Enter') {
            const activeForm = document.activeElement.closest('form');
            if (activeForm) {
                activeForm.dispatchEvent(new Event('submit'));
            }
        }
        
        // ESC to reset forms
        if (e.key === 'Escape') {
            if (document.getElementById('bulkAddStudentForm') && document.getElementById('bulkAddStudentForm').style.display !== 'none') {
                resetBulkForm();
            } else {
                document.getElementById('addStudentForm')?.reset();
            }
        }
    });
    
    // Auto-focus first input when forms are shown
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const form = mutation.target;
                if (form.style.display !== 'none') {
                    const firstInput = form.querySelector('input, select, textarea');
                    if (firstInput) {
                        firstInput.focus();
                    }
                }
            }
        });
    });
    
    if (document.getElementById('addStudentForm')) {
        observer.observe(document.getElementById('addStudentForm'), { attributes: true });
    }
    if (document.getElementById('bulkAddStudentForm')) {
        observer.observe(document.getElementById('bulkAddStudentForm'), { attributes: true });
    }
}

// Subject management is now centralized at school level - see showSubjectManagementModal()
// Grade-level specific subject functions are deprecated
function showAddSubjectForm(gradeLevel) {
    showNotification('يرجى إدارة المواد من لوحة تحكم المدرسة - تبويب إدارة المواد', 'info');
}

function hideAddSubjectForm(gradeLevel) {
    // Form is no longer shown at grade level
}

function addSubjectAutoSave(gradeLevel) {
    showNotification('يرجى إدارة المواد من لوحة تحكم المدرسة - تبويب إدارة المواد', 'info');
}

// Temporary storage kept for legacy compatibility
let tempSubjects = {};

// Legacy functions - no longer used at grade level
function addSubjectToGradeTemp(gradeLevel) {
    showNotification('يرجى إدارة المواد من لوحة تحكم المدرسة - تبويب إدارة المواد', 'info');
}

function renderTempSubjects(gradeLevel) {
    // No longer rendering temporary subjects at grade level
}

// Export teachers to Excel
function exportTeachersToExcel() {
    if (!teachers || teachers.length === 0) {
        showNotification('لا توجد بيانات معلمين لتصديرها', 'warning');
        return;
    }

    try {
        // Prepare data for export
        const exportData = teachers.map(teacher => ({
            'الاسم': teacher.full_name || teacher.name,
            'الرمز': teacher.teacher_code,
            'البريد الإلكتروني': teacher.email || '',
            'رقم الهاتف': teacher.phone || '',
            'التخصص': teacher.specialization || '',
            'المواد المعينة': teacher.assigned_subjects ? teacher.assigned_subjects.map(s => s.name).join(', ') : '',
            'عدد المواد': teacher.assigned_subjects ? teacher.assigned_subjects.length : 0,
            'تاريخ الإنشاء': teacher.created_at ? new Date(teacher.created_at).toLocaleDateString('ar-SA') : ''
        }));

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'المعلمين');
        
        // Generate filename with timestamp
        const fileName = `المعلمين_${getCurrentAcademicYearName()}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Export to file
        XLSX.writeFile(wb, fileName);
        
        showNotification('تم تصدير بيانات المعلمين بنجاح', 'success');
    } catch (error) {
        console.error('Error exporting teachers:', error);
        showNotification('حدث خطأ في تصدير بيانات المعلمين', 'error');
    }
}

// Export all students to Excel
function exportStudentsToExcel() {
    if (!students || students.length === 0) {
        showNotification('لا توجد بيانات طلاب لتصديرها', 'warning');
        return;
    }

    try {
        // Prepare data for export
        const exportData = students.map(student => ({
            'الاسم': student.full_name,
            'الرمز': student.student_code,
            'الصف': student.grade,
            'القاعة': student.room || '',
            'البريد الإلكتروني': student.email || '',
            'رقم الهاتف': student.phone || '',
            'تاريخ الإنشاء': student.created_at ? new Date(student.created_at).toLocaleDateString('ar-SA') : ''
        }));

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
        
        // Generate filename with timestamp
        const fileName = `الطلاب_${getCurrentAcademicYearName()}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Export to file
        XLSX.writeFile(wb, fileName);
        
        showNotification('تم تصدير بيانات الطلاب بنجاح', 'success');
    } catch (error) {
        console.error('Error exporting students:', error);
        showNotification('حدث خطأ في تصدير بيانات الطلاب', 'error');
    }
}

// Export students by grade level to Excel
function exportStudentsByGradeToExcel(gradeLevel) {
    if (!students || students.length === 0) {
        showNotification('لا توجد بيانات طلاب لتصديرها', 'warning');
        return;
    }

    // Filter students by grade level
    const gradeStudents = students.filter(student => student.grade === gradeLevel);
    
    if (gradeStudents.length === 0) {
        showNotification(`لا توجد بيانات طلاب في الصف ${gradeLevel}`, 'warning');
        return;
    }

    try {
        // Prepare data for export
        const exportData = gradeStudents.map(student => ({
            'الاسم': student.full_name,
            'الرمز': student.student_code,
            'الصف': student.grade,
            'القاعة': student.room || '',
            'البريد الإلكتروني': student.email || '',
            'رقم الهاتف': student.phone || '',
            'تاريخ الإنشاء': student.created_at ? new Date(student.created_at).toLocaleDateString('ar-SA') : ''
        }));

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `الطلاب_${gradeLevel}`);
        
        // Generate filename with timestamp
        const fileName = `طلاب_${gradeLevel}_${getCurrentAcademicYearName()}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        // Export to file
        XLSX.writeFile(wb, fileName);
        
        showNotification(`تم تصدير بيانات طلاب الصف ${gradeLevel} بنجاح`, 'success');
    } catch (error) {
        console.error('Error exporting students by grade:', error);
        showNotification('حدث خطأ في تصدير بيانات الطلاب', 'error');
    }
}

// Helper function to get current academic year name
function getCurrentAcademicYearName() {
    if (currentAcademicYear && currentAcademicYear.name) {
        return currentAcademicYear.name.replace(/\//g, '-');
    }
    return 'غير محدد';
}

// Function to add a subject to a specific grade level



// Function to remove a subject from temporary storage
function removeTempSubject(gradeLevel, index) {
    if (!tempSubjects[gradeLevel]) return;
    
    // Remove the subject at the specified index
    tempSubjects[gradeLevel].splice(index, 1);
    
    // Update the display
    renderTempSubjects(gradeLevel);
    
    showNotification('تم حذف المادة من القائمة المؤقتة', 'success');
}

// Function to save all temporary subjects
async function saveSubjects(gradeLevel) {
    const subjectsToSave = tempSubjects[gradeLevel] || [];
    
    if (subjectsToSave.length === 0) {
        showNotification('لا توجد مواد لحفظها', 'error');
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Save each subject
    for (const subject of subjectsToSave) {
        try {
            const response = await fetch('/api/school/' + currentSchool.id + '/subject', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    name: subject.name,
                    grade_level: subject.grade_level
                })
            });
            
            if (response.ok) {
                successCount++;
            } else {
                errorCount++;
                console.error('Error saving subject:', subject.name);
            }
        } catch (error) {
            errorCount++;
            console.error('Error saving subject:', subject.name, error);
        }
    }
    
    // Clear temporary storage for this grade level
    tempSubjects[gradeLevel] = [];
    
    // Update the display
    renderTempSubjects(gradeLevel);
    
    // Refresh subjects list
    await fetchSubjects();
    
    // Reload grade content to show the new subjects
    if (selectedGradeLevel) {
        // Extract the original grade level from the combined grade level
        const parts = selectedGradeLevel.split(' - ');
        const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
        loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
    }
    
    // Show notification
    if (errorCount === 0) {
        showNotification('تم حفظ ' + successCount + ' مادة بنجاح', 'success');
    } else {
        showNotification('تم حفظ ' + successCount + ' مادة، فشل حفظ ' + errorCount + ' مادة', 'warning');
    }
}

// Function to open the subjects form
function openSubjectsModal() {
    // Check if a grade level is selected
    if (!selectedGradeLevel) {
        showNotification('يرجى اختيار صف أولاً', 'error');
        return;
    }
    
    // Extract the original grade level from the combined grade level
    const parts = selectedGradeLevel.split(' - ');
    const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
    
    // Show the add subject form for the selected grade level
    showAddSubjectForm(originalGradeLevel);
}

// Performance Analytics Functions
function showPerformanceAnalytics() {
    // Show the performance analytics section
    document.getElementById('performanceAnalyticsSection').style.display = 'block';
    
    // Populate grade level dropdown
    const gradeSelect = document.getElementById('analyticsGradeLevel');
    gradeSelect.innerHTML = '<option value="">اختر الصف</option>';
    
    // Get unique grade levels from students
    const gradeLevels = [...new Set(students.map(student => student.grade))];
    gradeLevels.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade;
        option.textContent = grade;
        gradeSelect.appendChild(option);
    });
    
    // Populate subjects dropdown
    const subjectSelect = document.getElementById('analyticsSubject');
    subjectSelect.innerHTML = '<option value="">جميع المواد</option>';
    
    // Get unique subjects
    const allSubjects = [...new Set(subjects.map(subject => subject.name))];
    allSubjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        subjectSelect.appendChild(option);
    });
    
    // Load initial analytics
    loadPerformanceAnalytics();
}

function loadPerformanceAnalytics() {
    const selectedGrade = document.getElementById('analyticsGradeLevel').value;
    const selectedSubject = document.getElementById('analyticsSubject').value;
    
    // Filter students based on selection
    let filteredStudents = students;
    if (selectedGrade) {
        filteredStudents = filteredStudents.filter(student => student.grade === selectedGrade);
    }
    
    if (filteredStudents.length === 0) {
        // Reset indicators
        document.getElementById('avgGrade').textContent = '0';
        document.getElementById('passRate').textContent = '0%';
        document.getElementById('attendanceRate').textContent = '0%';
        document.getElementById('excellenceRate').textContent = '0%';
        return;
    }
    
    // Calculate performance indicators
    let totalGrades = 0;
    let gradeCount = 0;
    let passCount = 0;
    let presentCount = 0;
    let totalCount = 0;
    let excellenceCount = 0;
    
    // Data for charts
    const gradeDistribution = { excellent: 0, good: 0, average: 0, poor: 0 };
    const attendanceDistribution = { present: 0, absent: 0, late: 0, excused: 0 };
    
    filteredStudents.forEach(student => {
        // Calculate grades - only use data for the current academic year
        for (const subject in student.grades) {
            // If a specific subject is selected, only calculate for that subject
            if (selectedSubject && subject !== selectedSubject) continue;
            
            const subjectGrades = student.grades[subject];
            for (const period in subjectGrades) {
                const grade = parseInt(subjectGrades[period]) || 0;
                if (grade > 0) {
                    totalGrades += grade;
                    gradeCount++;
                    
                    // Check if student passed (assuming 50% is passing)
                    const maxGrade = getMaxGradeForStudent(student);
                    const passThreshold = maxGrade === 10 ? 5 : 50;
                    if (grade >= passThreshold) {
                        passCount++;
                    }
                    
                    // Check for excellence (assuming 90% is excellence)
                    if (grade >= (maxGrade === 10 ? 9 : 90)) {
                        excellenceCount++;
                        gradeDistribution.excellent++;
                    } else if (grade >= (maxGrade === 10 ? 7 : 70)) {
                        gradeDistribution.good++;
                    } else if (grade >= (maxGrade === 10 ? 5 : 50)) {
                        gradeDistribution.average++;
                    } else {
                        gradeDistribution.poor++;
                    }
                }
            }
        }
        
        // Calculate attendance - only use data for the current academic year
        for (const date in student.attendance) {
            const dayAttendance = student.attendance[date];
            for (const subject in dayAttendance) {
                // If a specific subject is selected, only calculate for that subject
                if (selectedSubject && subject !== selectedSubject) continue;
                
                totalCount++;
                const status = dayAttendance[subject];
                if (status === 'حاضر') {
                    presentCount++;
                    attendanceDistribution.present++;
                } else if (status === 'غائب') {
                    attendanceDistribution.absent++;
                } else if (status === 'متأخر') {
                    attendanceDistribution.late++;
                } else if (status === 'إجازة') {
                    attendanceDistribution.excused++;
                }
            }
        }
    });
    
    // Update indicators
    const avgGrade = gradeCount > 0 ? (totalGrades / gradeCount).toFixed(1) : 0;
    const passRate = gradeCount > 0 ? ((passCount / gradeCount) * 100).toFixed(1) + '%' : '0%';
    const attendanceRate = totalCount > 0 ? ((presentCount / totalCount) * 100).toFixed(1) + '%' : '0%';
    const excellenceRate = gradeCount > 0 ? ((excellenceCount / gradeCount) * 100).toFixed(1) + '%' : '0%';
    
    document.getElementById('avgGrade').textContent = avgGrade;
    document.getElementById('passRate').textContent = passRate;
    document.getElementById('attendanceRate').textContent = attendanceRate;
    document.getElementById('excellenceRate').textContent = excellenceRate;
    
    // Update charts
    updateCharts(gradeDistribution, attendanceDistribution);
    
    // Generate AI predictions
    if (aiModel) {
        const predictions = aiModel.predictStudentOutcomes(filteredStudents);
        
        // Update top performers list
        const topList = document.getElementById('topStudentsList');
        topList.innerHTML = '';
        predictions.topPerformers.slice(0, 3).forEach(prediction => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${escapeHtml(prediction.student.full_name)}</strong> <code class="code-btn" style="min-width:auto; font-size:0.8rem; padding: 0.1rem 0.3rem;" onclick="copyToClipboard('${escapeHtml(prediction.student.student_code)}')">${escapeHtml(prediction.student.student_code)}</code> - ${(prediction.prediction.score).toFixed(1)}%`;
            topList.appendChild(li);
        });
        
        // Update struggling students list
        const strugglingList = document.getElementById('strugglingStudentsList');
        strugglingList.innerHTML = '';
        predictions.strugglingStudents.slice(0, 3).forEach(prediction => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${escapeHtml(prediction.student.full_name)}</strong> <code class="code-btn" style="min-width:auto; font-size:0.8rem; padding: 0.1rem 0.3rem;" onclick="copyToClipboard('${escapeHtml(prediction.student.student_code)}')">${escapeHtml(prediction.student.student_code)}</code> - ${(prediction.prediction.score).toFixed(1)}%`;
            strugglingList.appendChild(li);
        });
        
        // Update recommendations list
        const recommendationsList = document.getElementById('recommendationsList');
        recommendationsList.innerHTML = '';
        
        // Get overall recommendations based on class performance
        const avgPerformance = predictions.topPerformers.length > 0 ? 
            predictions.topPerformers.reduce((sum, p) => sum + p.prediction.score, 0) / predictions.topPerformers.length : 0;
        
        const classRecommendations = generateRecommendations(avgPerformance, avgGrade, parseFloat(attendanceRate));
        classRecommendations.slice(0, 3).forEach(rec => {
            const li = document.createElement('li');
            li.textContent = rec;
            recommendationsList.appendChild(li);
        });
    }
}

function updateCharts(gradeDistribution, attendanceDistribution) {
    // Destroy existing charts if they exist
    if (gradesChart) {
        gradesChart.destroy();
    }
    
    if (attendanceChart) {
        attendanceChart.destroy();
    }
    
    // Create grades distribution chart
    const gradesCtx = document.getElementById('gradesChart').getContext('2d');
    gradesChart = new Chart(gradesCtx, {
        type: 'bar',
        data: {
            labels: ['ممتاز', 'جيد', 'متوسط', 'ضعيف'],
            datasets: [{
                label: 'توزيع الدرجات',
                data: [
                    gradeDistribution.excellent,
                    gradeDistribution.good,
                    gradeDistribution.average,
                    gradeDistribution.poor
                ],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(239, 68, 68, 0.7)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(59, 130, 246, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'توزيع الدرجات'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
    
    // Create attendance distribution chart
    const attendanceCtx = document.getElementById('attendanceChart').getContext('2d');
    attendanceChart = new Chart(attendanceCtx, {
        type: 'pie',
        data: {
            labels: ['حاضر', 'غائب', 'متأخر', 'إجازة'],
            datasets: [{
                label: 'توزيع الحضور',
                data: [
                    attendanceDistribution.present,
                    attendanceDistribution.absent,
                    attendanceDistribution.late,
                    attendanceDistribution.excused
                ],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(156, 163, 175, 0.7)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(239, 68, 68, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(156, 163, 175, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'توزيع الحضور'
                }
            }
        }
    });
}

// Add these functions to the window object for global access
window.showPerformanceAnalytics = showPerformanceAnalytics;
window.loadPerformanceAnalytics = loadPerformanceAnalytics;
window.openGradesModal = openGradesModal;
window.getSubjectsForStudent = getSubjectsForStudent;
window.resetTotalsAndAverages = resetTotalsAndAverages;

// ============================================================================
// ACADEMIC YEAR MANAGEMENT SYSTEM
// ============================================================================

/**
 * Setup the academic year form input behavior
 * When start year is entered, auto-calculate end year
 */
function setupAcademicYearForm() {
    const startYearInput = document.getElementById('newYearStart');
    const endYearInput = document.getElementById('newYearEnd');
    
    if (startYearInput && endYearInput) {
        startYearInput.addEventListener('input', function() {
            const startYear = parseInt(this.value);
            if (startYear && !isNaN(startYear)) {
                endYearInput.value = startYear + 1;
            } else {
                endYearInput.value = '';
            }
        });
    }
}

// Load the current academic year from the centralized system
async function loadAcademicYears() {
    try {
        const response = await fetch('/api/academic-year/current', {
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.current_academic_year) {
                currentAcademicYear = result.current_academic_year;
                selectedAcademicYearId = result.academic_year_id;
                
                // Update the UI to show current academic year
                updateCurrentYearDisplay();
                
                // Now that we have the current academic year, load student data for this year
                if (currentStudentId) {
                    await loadStudentDataForCurrentYear();
                }
            }
        } else {
            console.error('Failed to load current academic year');
        }
    } catch (error) {
        console.error('Error loading current academic year:', error);
    }
}

function updateAcademicYearSelector() {
    // Since we're using the centralized system, just update display
    updateCurrentYearDisplay();
}

function onAcademicYearChange() {
    // This should not be called since academic years are centralized
    // Just reload data for the current academic year
    if (currentStudentId) {
        loadStudentDataForCurrentYear();
    }
}

async function loadStudentDataForCurrentYear() {
    if (!currentStudentId || !selectedAcademicYearId) return;
    
    try {
        // Load grades for current academic year
        const gradesResponse = await fetch(`/api/student/${currentStudentId}/grades/${selectedAcademicYearId}`, {
            headers: getAuthHeaders()
        });
        
        if (gradesResponse.ok) {
            const gradesResult = await gradesResponse.json();
            if (gradesResult.success && gradesResult.grades) {
                const student = students.find(s => s.id === currentStudentId);
                if (student) {
                    student.grades = { ...student.grades, ...gradesResult.grades };
                }
            }
        }
        
        // Load attendance for current academic year
        const attendanceResponse = await fetch(`/api/student/${currentStudentId}/attendance/${selectedAcademicYearId}`, {
            headers: getAuthHeaders()
        });
        
        if (attendanceResponse.ok) {
            const attendanceResult = await attendanceResponse.json();
            if (attendanceResult.success && attendanceResult.attendance) {
                const student = students.find(s => s.id === currentStudentId);
                if (student) {
                    student.attendance = { ...student.attendance, ...attendanceResult.attendance };
                }
            }
        }
        
        // Refresh UI if a student modal is open
        if (document.getElementById('gradesModal').style.display === 'flex') {
            renderGradesTable();
        }
        if (document.getElementById('attendanceModal').style.display === 'flex') {
            renderAttendanceTable();
        }
        
    } catch (error) {
        console.error('Error loading student data for current year:', error);
    }
}

function showAcademicYearManagement() {
    showNotification('إدارة السنوات الدراسية مركزية ويتم التحكم بها من قبل مدير النظام.', 'info');
}

function updateCurrentYearDisplay() {
    const yearDisplay = document.getElementById('currentAcademicYearDisplay');
    if (yearDisplay && currentAcademicYear) {
        yearDisplay.textContent = currentAcademicYear.name;
        yearDisplay.title = `السنة الدراسية الحالية: ${escapeHtml(currentAcademicYear.name)}`;
    }
}

function updateAcademicYearsTable() {
    // Academic years table removed from school dashboard
}

function addNewAcademicYear() {
    showNotification('إدارة السنوات الدراسية أصبحت مركزية. يرجى التواصل مع مدير النظام لإضافة سنوات دراسية جديدة.', 'info');
}

function generateUpcomingYears() {
    showNotification('إدارة السنوات الدراسية أصبحت مركزية. يرجى التواصل مع مدير النظام لإدارة السنوات الدراسية.', 'info');
}

function setAsCurrentYear(yearId) {
    showNotification('السنة الدراسية الحالية يتم تحديدها تلقائياً بناءً على التاريخ الحالي', 'info');
}

function deleteAcademicYear(yearId) {
    showNotification('إدارة السنوات الدراسية أصبحت مركزية. يرجى التواصل مع مدير النظام لحذف السنوات الدراسية.', 'info');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

/**
 * Get student grades for the selected academic year
 */
async function getStudentGradesForYear(studentId, academicYearId) {
    if (!academicYearId) {
        return {};
    }
    
    try {
        const response = await fetch(`/api/student/${studentId}/grades/${academicYearId}`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();
        
        if (result.success) {
            return result.grades || {};
        }
    } catch (error) {
        console.error('Error fetching student grades:', error);
    }
    return {};
}

/**
 * Save student grades for the selected academic year
 */
async function saveStudentGradesForYear(studentId, academicYearId, grades) {
    if (!academicYearId) {
        showNotification('يرجى اختيار سنة دراسية أولاً', 'error');
        return false;
    }
    
    try {
        const response = await fetch(`/api/student/${studentId}/grades/${academicYearId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ grades })
        });
        const result = await response.json();
        
        if (result.success) {
            return true;
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ في حفظ الدرجات', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error saving student grades:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        return false;
    }
}

/**
 * Get student attendance for the selected academic year
 */
async function getStudentAttendanceForYear(studentId, academicYearId) {
    if (!academicYearId) {
        return {};
    }
    
    try {
        const response = await fetch(`/api/student/${studentId}/attendance/${academicYearId}`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();
        
        if (result.success) {
            return result.attendance || {};
        }
    } catch (error) {
        console.error('Error fetching student attendance:', error);
    }
    return {};
}

/**
 * Save student attendance for the selected academic year
 */
async function saveStudentAttendanceForYear(studentId, academicYearId, attendance) {
    if (!academicYearId) {
        showNotification('يرجى اختيار سنة دراسية أولاً', 'error');
        return false;
    }
    
    try {
        const response = await fetch(`/api/student/${studentId}/attendance/${academicYearId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ attendance })
        });
        const result = await response.json();
        
        if (result.success) {
            return true;
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ في حفظ الحضور', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error saving student attendance:', error);
        showNotification('حدث خطأ في الاتصال بالخادم', 'error');
        return false;
    }
}

// Make academic year functions available globally
window.loadAcademicYears = loadAcademicYears;
window.onAcademicYearChange = onAcademicYearChange;
window.showAcademicYearManagement = showAcademicYearManagement;
window.addNewAcademicYear = addNewAcademicYear;
window.generateUpcomingYears = generateUpcomingYears;
window.setAsCurrentYear = setAsCurrentYear;
window.deleteAcademicYear = deleteAcademicYear;
window.getStudentGradesForYear = getStudentGradesForYear;
window.saveStudentGradesForYear = saveStudentGradesForYear;
window.getStudentAttendanceForYear = getStudentAttendanceForYear;
window.saveStudentAttendanceForYear = saveStudentAttendanceForYear;
window.setupAcademicYearForm = setupAcademicYearForm;

// ============================================================================
// EXCEL EXPORT FUNCTIONALITY
// ============================================================================

/**
 * Export all students to Excel file
 * Generates an Excel file containing all student information including:
 * - Student name, code, grade level, room
 * - Parent contact, blood type, chronic diseases
 * - Notes
 */
function exportStudentsToExcel() {
    if (!currentSchool) {
        showNotification('يرجى تسجيل الدخول أولاً', 'error');
        return;
    }
    
    if (!students || students.length === 0) {
        showNotification('لا يوجد طلاب مسجلين للتصدير', 'warning');
        return;
    }
    
    // Check if XLSX library is loaded
    if (typeof XLSX === 'undefined') {
        showNotification('خطأ: مكتبة Excel غير محملة', 'error');
        console.error('XLSX library not loaded');
        return;
    }
    
    try {
        // Prepare data for export
        const exportData = students.map((student, index) => {
            return {
                'الرقم': index + 1,
                'اسم الطالب': student.full_name || '',
                'رمز الطالب': student.student_code || '',
                'الصف الدراسي': student.grade || '',
                'رقم القاعة': student.room || '',
                'رقم ولي الأمر': student.parent_contact || '',
                'فصيلة الدم': student.blood_type || '',
                'الأمراض المزمنة': student.chronic_disease || 'لا يوجد',
                'الملاحظات': student.notes || ''
            };
        });
        
        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        
        // Set column widths for better readability
        const columnWidths = [
            { wch: 8 },   // الرقم
            { wch: 35 },  // اسم الطالب
            { wch: 20 },  // رمز الطالب
            { wch: 25 },  // الصف الدراسي
            { wch: 12 },  // رقم القاعة
            { wch: 20 },  // رقم ولي الأمر
            { wch: 12 },  // فصيلة الدم
            { wch: 25 },  // الأمراض المزمنة
            { wch: 30 }   // الملاحظات
        ];
        worksheet['!cols'] = columnWidths;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'بيانات الطلاب');
        
        // Generate filename with school name and date
        const schoolName = currentSchool.name || 'المدرسة';
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        const filename = `${schoolName}_طلاب_${dateStr}.xlsx`;
        
        // Download the file
        XLSX.writeFile(workbook, filename);
        
        showNotification(`تم تصدير ${students.length} طالب بنجاح`, 'success');
        console.log(`Exported ${students.length} students to ${filename}`);
        
    } catch (error) {
        console.error('Error exporting students to Excel:', error);
        showNotification('حدث خطأ أثناء تصدير البيانات', 'error');
    }
}

// Make export function available globally
window.exportStudentsToExcel = exportStudentsToExcel;

// Student Promotion Functions

async function openPromotionModal(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) {
        showNotification('لم يتم العثور على بيانات الطالب', 'error');
        return;
    }
    
    // Create promotion modal HTML
    const modalHtml = `
        <div id="promotionModal" class="modal" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
            <div class="modal-content" style="background: white; padding: 2rem; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0;"><i class="fas fa-arrow-up"></i> ترقية الطالب: ${escapeHtml(student.full_name)}</h3>
                    <button onclick="closeModal('promotionModal')" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
                </div>
                
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                    <h4 style="margin-bottom: 0.5rem;">معلومات الطالب الحالية</h4>
                    <p><strong>الصف الحالي:</strong> <span id="currentGradeDisplay">${student.grade}</span></p>
                    <p><strong>رمز الطالب:</strong> <code class="code-btn" onclick="copyToClipboard('${escapeHtml(student.student_code)}')" style="cursor: pointer;">${escapeHtml(student.student_code)}</code></p>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label for="newGradeSelect" style="display: block; margin-bottom: 0.5rem;"><i class="fas fa-graduation-cap"></i> اختر الصف الجديد</label>
                    <select id="newGradeSelect" class="form-input" style="width: 100%; padding: 0.75rem; margin-bottom: 1rem;">
                        <option value="">-- اختر الصف الجديد --</option>
                    </select>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label for="academicYearSelect" style="display: block; margin-bottom: 0.5rem;"><i class="fas fa-calendar"></i> اختر السنة الدراسية</label>
                    <select id="academicYearSelect" class="form-input" style="width: 100%; padding: 0.75rem; margin-bottom: 1rem;">
                        <option value="">-- اختر السنة الدراسية --</option>
                    </select>
                </div>
                
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px;">
                    <p style="margin: 0; color: #856404;"><i class="fas fa-info-circle"></i> <strong>ملاحظة مهمة:</strong> عند ترقية الطالب:
                        <ul style="margin: 0.5rem 0 0 1.5rem; padding: 0;">
                            <li>سيتم تحديث مستوى الطالب الدراسي فقط</li>
                            <li>سيتم الاحتفاظ بجميع الدرجات السابقة كسجل أكاديمي دائم</li>
                            <li>سيتم إنشاء سجلات جديدة للصف الجديد دون التأثير على السجلات السابقة</li>
                        </ul>
                    </p>
                </div>
                
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="promoteSingleStudent(${studentId})" class="btn-primary-school btn-success" style="flex: 1; padding: 0.75rem;">
                        <i class="fas fa-check"></i> ترقية الطالب
                    </button>
                    <button onclick="closeModal('promotionModal')" class="btn-primary-school btn-secondary" style="flex: 1; padding: 0.75rem;">
                        <i class="fas fa-times"></i> إلغاء
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('promotionModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Populate grade options
    populateGradeOptions('newGradeSelect', student.grade);
    
    // Load academic years
    loadAcademicYearsForPromotion('academicYearSelect');
    
    // Show the modal
    document.getElementById('promotionModal').style.display = 'flex';
}

async function openMassPromotionModal() {
    // Create mass promotion modal HTML
    const modalHtml = `
        <div id="massPromotionModal" class="modal" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
            <div class="modal-content" style="background: white; padding: 2rem; border-radius: 10px; max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0;"><i class="fas fa-users"></i> ترقية جماعية للطلاب</h3>
                    <button onclick="closeModal('massPromotionModal')" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label for="gradeFilterSelect" style="display: block; margin-bottom: 0.5rem;"><i class="fas fa-filter"></i> تصفية حسب الصف الحالي</label>
                    <select id="gradeFilterSelect" class="form-input" style="width: 100%; padding: 0.75rem; margin-bottom: 1rem;">
                        <option value="">-- جميع الصفوف --</option>
                    </select>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label for="studentsTablePromotion" style="display: block; margin-bottom: 0.5rem;"><i class="fas fa-list"></i> اختر الطلاب للترقية</label>
                    <div class="table-responsive">
                        <table class="table-school table-enhanced">
                            <thead>
                                <tr>
                                    <th class="th-school"><input type="checkbox" id="selectAllPromotion" onchange="toggleSelectAllPromotion()"></th>
                                    <th class="th-school">الاسم</th>
                                    <th class="th-school">الصف الحالي</th>
                                    <th class="th-school">القاعة</th>
                                    <th class="th-school">رمز الطالب</th>
                                </tr>
                            </thead>
                            <tbody id="studentsTablePromotion">
                                <!-- Students will be loaded here -->
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label for="newGradeSelectMass" style="display: block; margin-bottom: 0.5rem;"><i class="fas fa-graduation-cap"></i> اختر الصف الجديد</label>
                    <select id="newGradeSelectMass" class="form-input" style="width: 100%; padding: 0.75rem; margin-bottom: 1rem;">
                        <option value="">-- اختر الصف الجديد --</option>
                    </select>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label for="academicYearSelectMass" style="display: block; margin-bottom: 0.5rem;"><i class="fas fa-calendar"></i> اختر السنة الدراسية</label>
                    <select id="academicYearSelectMass" class="form-input" style="width: 100%; padding: 0.75rem; margin-bottom: 1rem;">
                        <option value="">-- اختر السنة الدراسية --</option>
                    </select>
                </div>
                
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px;">
                    <p style="margin: 0; color: #856404;"><i class="fas fa-info-circle"></i> <strong>ملاحظة مهمة:</strong> عند ترقية الطلاب:
                        <ul style="margin: 0.5rem 0 0 1.5rem; padding: 0;">
                            <li>سيتم تحديث مستوى الطلاب الدراسي فقط</li>
                            <li>سيتم الاحتفاظ بجميع الدرجات السابقة كسجل أكاديمي دائم</li>
                            <li>سيتم إنشاء سجلات جديدة للصف الجديد دون التأثير على السجلات السابقة</li>
                        </ul>
                    </p>
                </div>
                
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="promoteMultipleStudents()" class="btn-primary-school btn-success" style="flex: 1; padding: 0.75rem;">
                        <i class="fas fa-check"></i> ترقية الطلاب المحددين
                    </button>
                    <button onclick="closeModal('massPromotionModal')" class="btn-primary-school btn-secondary" style="flex: 1; padding: 0.75rem;">
                        <i class="fas fa-times"></i> إغاء
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('massPromotionModal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Populate grade options
    populateGradeOptions('newGradeSelectMass', '');
    
    // Load academic years
    loadAcademicYearsForPromotion('academicYearSelectMass');
    
    // Load students table
    loadStudentsForPromotion();
    
    // Populate grade filter options
    populateGradeFilterOptions();
    
    // Show the modal
    document.getElementById('massPromotionModal').style.display = 'flex';
}

function populateGradeOptions(selectId, currentGrade = '') {
    const selectElement = document.getElementById(selectId);
    if (!selectElement) return;
    
    // Clear existing options
    selectElement.innerHTML = '<option value="">-- اختر الصف الجديد --</option>';
    
    // Use the school's defined grade levels for promotion options
    // Get the grade levels that are appropriate for promotion
    const schoolGradeLevels = gradeLevels;
    
    schoolGradeLevels.forEach(grade => {
        // Create the combined grade level string that includes both educational stage and specific grade
        const combinedGradeLevel = `${currentSchool.level} - ${grade}`;
        
        // Only show grades that are different from the current grade
        if (combinedGradeLevel !== currentGrade) {
            const option = document.createElement('option');
            option.value = combinedGradeLevel;
            option.textContent = combinedGradeLevel;
            selectElement.appendChild(option);
        }
    });
}

function populateGradeFilterOptions() {
    const selectElement = document.getElementById('gradeFilterSelect');
    if (!selectElement) return;
    
    // Clear existing options
    selectElement.innerHTML = '<option value="">-- جميع الصفوف --</option>';
    
    // Use the school's defined grade levels for filtering options
    const schoolGradeLevels = gradeLevels;
    
    schoolGradeLevels.forEach(grade => {
        // Create the combined grade level string that includes both educational stage and specific grade
        const combinedGradeLevel = `${currentSchool.level} - ${grade}`;
        
        const option = document.createElement('option');
        option.value = combinedGradeLevel;
        option.textContent = combinedGradeLevel;
        selectElement.appendChild(option);
    });
}

async function loadAcademicYearsForPromotion(selectId) {
    try {
        const response = await fetch(`/api/school/${currentSchool.id}/academic-years`, {
            headers: getAuthHeaders()
        });
        
        if (!response.ok) {
            throw new Error('فشل في تحميل السنوات الدراسية');
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'خطأ في تحميل السنوات الدراسية');
        }
        
        const selectElement = document.getElementById(selectId);
        if (!selectElement) return;
        
        // Clear existing options
        selectElement.innerHTML = '<option value="">-- اختر السنة الدراسية --</option>';
        
        result.academic_years.forEach(year => {
            const option = document.createElement('option');
            option.value = year.id;
            option.textContent = `${year.name} ${year.is_current ? '(الحالي)' : ''}`;
            selectElement.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error loading academic years:', error);
        showNotification('حدث خطأ أثناء تحميل السنوات الدراسية: ' + error.message, 'error');
    }
}

function loadStudentsForPromotion(gradeFilter = '') {
    const tbody = document.getElementById('studentsTablePromotion');
    if (!tbody) return;
    
    // Filter students based on grade filter
    const filteredStudents = gradeFilter ? 
        students.filter(s => s.grade === gradeFilter) : 
        students;
    
    tbody.innerHTML = filteredStudents.map(student => `
        <tr>
            <td class="td-school"><input type="checkbox" class="student-checkbox" value="${student.id}"></td>
            <td class="td-school">${escapeHtml(student.full_name)}</td>
            <td class="td-school">${student.grade}</td>
            <td class="td-school">${escapeHtml(student.room)}</td>
            <td class="td-school"><code class="code-btn" onclick="copyToClipboard('${escapeHtml(student.student_code)}')" style="cursor: pointer;">${escapeHtml(student.student_code)}</code></td>
        </tr>
    `).join('');
}

function toggleSelectAllPromotion() {
    const selectAllCheckbox = document.getElementById('selectAllPromotion');
    const checkboxes = document.querySelectorAll('.student-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
}

async function promoteSingleStudent(studentId) {
    const newGrade = document.getElementById('newGradeSelect').value;
    const academicYearId = document.getElementById('academicYearSelect').value;
    
    if (!newGrade) {
        showNotification('الرجاء اختيار الصف الجديد', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/student/${studentId}/promote`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                new_grade: newGrade,
                new_academic_year_id: academicYearId || null
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showNotification('تم ترقية الطالب بنجاح', 'success');
            
            // Update the student in the local array
            const studentIndex = students.findIndex(s => s.id === studentId);
            if (studentIndex !== -1) {
                students[studentIndex] = result.student;
            }
            
            // Refresh the grade level content if applicable
            if (selectedGradeLevel) {
                // Extract the original grade level from the combined grade level
                const parts = selectedGradeLevel.split(' - ');
                const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
                await loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
            }
            
            closeModal('promotionModal');
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ أثناء ترقية الطالب', 'error');
        }
    } catch (error) {
        console.error('Error promoting student:', error);
        showNotification('حدث خطأ أثناء ترقية الطالب: ' + error.message, 'error');
    }
}

async function promoteMultipleStudents() {
    const selectedCheckboxes = document.querySelectorAll('.student-checkbox:checked');
    const studentIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));
    const newGrade = document.getElementById('newGradeSelectMass').value;
    const academicYearId = document.getElementById('academicYearSelectMass').value;
    
    if (studentIds.length === 0) {
        showNotification('الرجاء اختيار طلاب للترقية', 'error');
        return;
    }
    
    if (!newGrade) {
        showNotification('الرجاء اختيار الصف الجديد', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/students/promote-many', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                student_ids: studentIds,
                new_grade: newGrade,
                new_academic_year_id: academicYearId || null
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showNotification(`تم ترقية ${result.promoted_count} طالب/طلاب بنجاح`, 'success');
            
            // Refresh the grade level content if applicable
            if (selectedGradeLevel) {
                // Extract the original grade level from the combined grade level
                const parts = selectedGradeLevel.split(' - ');
                const originalGradeLevel = parts.length > 1 ? parts[1] : selectedGradeLevel;
                await loadGradeSubjectsForLevel(selectedGradeLevel, originalGradeLevel);
            }
            
            closeModal('massPromotionModal');
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ أثناء ترقية الطلاب', 'error');
        }
    } catch (error) {
        console.error('Error promoting multiple students:', error);
        showNotification('حدث خطأ أثناء ترقية الطلاب: ' + error.message, 'error');
    }
}

// Event listener for grade filter change
if (document.getElementById('gradeFilterSelect')) {
    document.getElementById('gradeFilterSelect').addEventListener('change', function() {
        loadStudentsForPromotion(this.value);
    });
}

// Function to open student history modal
async function openStudentHistoryModal(studentId) {
    const student = students.find(s => s.id === studentId);
    if (!student) {
        showNotification('لم يتم العثور على بيانات الطالب', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/student/${studentId}/history`, {
            headers: getAuthHeaders()
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const history = result.academic_history;
            
            // Create history modal HTML
            const modalHtml = `
                <div id="studentHistoryModal" class="modal" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; justify-content: center; align-items: center;">
                    <div class="modal-content" style="background: white; padding: 2rem; border-radius: 10px; max-width: 1000px; width: 95%; max-height: 90vh; overflow-y: auto;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                            <h3 style="margin: 0;"><i class="fas fa-history"></i> السجل الأكاديمي للطالب: ${escapeHtml(student.full_name)}</h3>
                            <button onclick="closeModal('studentHistoryModal')" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
                        </div>
                        
                        <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                            <p><strong>الصف الحالي:</strong> ${result.student.grade}</p>
                            <p><strong>رمز الطالب:</strong> <code class="code-btn" onclick="copyToClipboard('${escapeHtml(result.student.student_code)}')" style="cursor: pointer;">${escapeHtml(result.student.student_code)}</code></p>
                            <p><strong>عدد السنوات الدراسية:</strong> ${Object.keys(history.grades).length} سنة</p>
                        </div>
                        
                        <!-- Academic Years Summary -->
                        <div style="margin-bottom: 1.5rem; padding: 1rem; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196F3;">
                            <h4 style="margin-top: 0; color: #1976D2;"><i class="fas fa-list"></i> ملخص السنوات الدراسية</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem;">
                                ${Object.entries(history.grades).map(([yearName, yearData]) => `
                                    <div style="background: white; padding: 0.75rem; border-radius: 6px; border: 1px solid #bbdefb; text-align: center;">
                                        <strong style="color: #1976D2;">${yearName}</strong>
                                        <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
                                            ${Object.keys(yearData.subjects).length} مواد
                                        </div>
                                        ${yearData.year_info.id === currentAcademicYear?.id ? '<span style="font-size: 0.75rem; background: #4CAF50; color: white; padding: 0.2rem 0.5rem; border-radius: 3px; display: inline-block; margin-top: 0.25rem;">الحالي</span>' : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        
                        <div class="tabs" style="margin-bottom: 1.5rem;">
                            <div class="tab active" onclick="switchTab('gradesHistoryTab')">الدرجات</div>
                            <div class="tab" onclick="switchTab('attendanceHistoryTab')">الحضور</div>
                        </div>
                        
                        <div id="gradesHistoryTab" class="tab-content active">
                            <h4><i class="fas fa-graduation-cap"></i> الدرجات حسب السنوات الدراسية</h4>
                            <p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem;">
                                <i class="fas fa-info-circle"></i> يتم حفظ سجل كل سنة دراسية بشكل منفصل. عند ترقية الطالب، يتم إنشاء سجل جديد للسنة الحالية.
                            </p>
                            ${Object.keys(history.grades).length > 0 ? 
                                Object.entries(history.grades).map(([yearName, yearData]) => `
                                    <div style="margin-bottom: 1.5rem; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden;">
                                        <div style="background: #f8f9fa; padding: 1rem; font-weight: bold; border-bottom: 1px solid #dee2e6;">
                                            ${yearName} ${yearData.year_info.id === currentAcademicYear?.id ? '(الحالي)' : ''}
                                        </div>
                                        <div class="table-responsive">
                                            <table class="table-school table-enhanced">
                                                <thead>
                                                    <tr>
                                                        <th class="th-school">المادة</th>
                                                        <th class="th-school">شهر 1</th>
                                                        <th class="th-school">شهر 2</th>
                                                        <th class="th-school">نصف السنة</th>
                                                        <th class="th-school">شهر 3</th>
                                                        <th class="th-school">شهر 4</th>
                                                        <th class="th-school">النهائي</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${Object.entries(yearData.subjects).map(([subjectName, grades]) => `
                                                        <tr>
                                                            <td class="td-school">${subjectName}</td>
                                                            <td class="td-school">${grades.month1}</td>
                                                            <td class="td-school">${grades.month2}</td>
                                                            <td class="td-school">${grades.midterm}</td>
                                                            <td class="td-school">${grades.month3}</td>
                                                            <td class="td-school">${grades.month4}</td>
                                                            <td class="td-school">${grades.final}</td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                `).join('') :
                                '<p style="text-align: center; padding: 2rem; color: #6c757d;">لا توجد بيانات درجات مسجلة</p>'
                            }
                        </div>
                        
                        <div id="attendanceHistoryTab" class="tab-content" style="display: none;">
                            <h4><i class="fas fa-calendar-check"></i> الحضور والغياب حسب السنوات الدراسية</h4>
                            ${Object.keys(history.attendance).length > 0 ? 
                                Object.entries(history.attendance).map(([yearName, yearAttendance]) => `
                                    <div style="margin-bottom: 1.5rem; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden;">
                                        <div style="background: #f8f9fa; padding: 1rem; font-weight: bold; border-bottom: 1px solid #dee2e6;">
                                            ${yearName}
                                        </div>
                                        <div class="table-responsive">
                                            <table class="table-school table-enhanced">
                                                <thead>
                                                    <tr>
                                                        <th class="th-school">التاريخ</th>
                                                        <th class="th-school">الحالة</th>
                                                        <th class="th-school">الملاحظات</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${Object.entries(yearAttendance).map(([date, record]) => `
                                                        <tr>
                                                            <td class="td-school">${date}</td>
                                                            <td class="td-school">
                                                                <span class="status-badge status-${record.status}">${record.status === 'present' ? 'حاضر' : record.status === 'absent' ? 'غائب' : record.status === 'late' ? 'متأخر' : 'معذور'}</span>
                                                            </td>
                                                            <td class="td-school">${record.notes || '-'}</td>
                                                        </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                `).join('') :
                                '<p style="text-align: center; padding: 2rem; color: #6c757d;">لا توجد بيانات حضور مسجلة</p>'
                            }
                        </div>
                        
                        <button class="btn-primary-school btn-secondary" style="margin-top: 1rem;" onclick="closeModal('studentHistoryModal')">
                            <i class="fas fa-times"></i> إغلاق
                        </button>
                    </div>
                </div>
            `;
            
            // Remove existing modal if any
            const existingModal = document.getElementById('studentHistoryModal');
            if (existingModal) existingModal.remove();
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            // Show the modal
            document.getElementById('studentHistoryModal').style.display = 'flex';
        } else {
            showNotification(result.error_ar || result.error || 'حدث خطأ أثناء تحميل السجل الأكاديمي', 'error');
        }
    } catch (error) {
        console.error('Error loading student history:', error);
        showNotification('حدث خطأ أثناء تحميل السجل الأكاديمي: ' + error.message, 'error');
    }
}

// Make promotion functions available globally
window.openPromotionModal = openPromotionModal;
window.openMassPromotionModal = openMassPromotionModal;
window.openStudentHistoryModal = openStudentHistoryModal;

// End of file

