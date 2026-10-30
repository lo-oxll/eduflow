/**
 * Enhanced client-side validation and form handling for EduFlow
 * Provides comprehensive form validation, real-time feedback, and improved UX
 */

class FormValidator {
    constructor() {
        this.validators = new Map();
        this.errorMessages = new Map();
        this.setupDefaultValidators();
        this.setupErrorMessages();
    }

    setupDefaultValidators() {
        // Required field validator
        this.validators.set('required', (value, params) => {
            if (value === null || value === undefined) return false;
            if (typeof value === 'string') return value.trim().length > 0;
            if (Array.isArray(value)) return value.length > 0;
            return value !== '';
        });

        // String length validator
        this.validators.set('minLength', (value, params) => {
            if (!value || typeof value !== 'string') return true;
            return value.length >= params;
        });

        this.validators.set('maxLength', (value, params) => {
            if (!value || typeof value !== 'string') return true;
            return value.length <= params;
        });

        // Email validator
        this.validators.set('email', (value, params) => {
            if (!value) return true;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(value);
        });

        // Phone validator
        this.validators.set('phone', (value, params) => {
            if (!value) return true;
            const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
            const cleanValue = value.replace(/[\s\-()]/g, '');
            return phoneRegex.test(cleanValue);
        });

        // Number validators
        this.validators.set('min', (value, params) => {
            if (value === null || value === undefined || value === '') return true;
            const numValue = parseFloat(value);
            return !isNaN(numValue) && numValue >= params;
        });

        this.validators.set('max', (value, params) => {
            if (value === null || value === undefined || value === '') return true;
            const numValue = parseFloat(value);
            return !isNaN(numValue) && numValue <= params;
        });

        this.validators.set('integer', (value, params) => {
            if (value === null || value === undefined || value === '') return true;
            return Number.isInteger(parseFloat(value));
        });

        // Custom validators
        this.validators.set('bloodType', (value, params) => {
            if (!value) return true;
            const validTypes = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
            return validTypes.includes(value);
        });

        this.validators.set('gradeFormat', (value, params) => {
            if (!value) return true;
            const parts = value.split(' - ');
            return parts.length >= 2;
        });

        this.validators.set('educationalLevel', (value, params) => {
            if (!value) return true;
            const validLevels = ['ابتدائي', 'متوسطة', 'ثانوية', 'إعدادية'];
            return validLevels.includes(value);
        });

        this.validators.set('studyType', (value, params) => {
            if (!value) return true;
            const validTypes = ['صباحي', 'مسائي'];
            return validTypes.includes(value);
        });

        this.validators.set('genderType', (value, params) => {
            if (!value) return true;
            const validTypes = ['بنين', 'بنات', 'مختلطة'];
            return validTypes.includes(value);
        });
    }

    setupErrorMessages() {
        this.errorMessages.set('required', {
            en: 'This field is required',
            ar: 'هذا الحقل مطلوب'
        });

        this.errorMessages.set('minLength', {
            en: 'Minimum length is {0} characters',
            ar: 'الحد الأدنى للطول هو {0} حرف'
        });

        this.errorMessages.set('maxLength', {
            en: 'Maximum length is {0} characters',
            ar: 'الحد الأقصى للطول هو {0} حرف'
        });

        this.errorMessages.set('email', {
            en: 'Please enter a valid email address',
            ar: 'الرجاء إدخال عنوان بريد إلكتروني صحيح'
        });

        this.errorMessages.set('phone', {
            en: 'Please enter a valid phone number',
            ar: 'الرجاء إدخال رقم هاتف صحيح'
        });

        this.errorMessages.set('min', {
            en: 'Value must be at least {0}',
            ar: 'يجب أن تكون القيمة على الأقل {0}'
        });

        this.errorMessages.set('max', {
            en: 'Value must be at most {0}',
            ar: 'يجب أن تكون القيمة على الأكثر {0}'
        });

        this.errorMessages.set('integer', {
            en: 'Please enter a whole number',
            ar: 'الرجاء إدخال عدد صحيح'
        });

        this.errorMessages.set('bloodType', {
            en: 'Please select a valid blood type',
            ar: 'الرجاء اختيار فصيلة دم صحيحة'
        });

        this.errorMessages.set('gradeFormat', {
            en: 'Invalid grade format',
            ar: 'تنسيق الصف غير صحيح'
        });

        this.errorMessages.set('educationalLevel', {
            en: 'Please select a valid educational level',
            ar: 'الرجاء اختيار مستوى تعليمي صحيح'
        });

        this.errorMessages.set('studyType', {
            en: 'Please select a valid study type',
            ar: 'الرجاء اختيار نوع دراسة صحيح'
        });

        this.errorMessages.set('genderType', {
            en: 'Please select a valid gender type',
            ar: 'الرجاء اختيار نوع صحيح'
        });
    }

    validateField(value, rules) {
        const errors = [];

        for (const [ruleName, ruleParams] of Object.entries(rules)) {
            const validator = this.validators.get(ruleName);
            if (validator && !validator(value, ruleParams)) {
                const messageTemplates = this.errorMessages.get(ruleName);
                if (messageTemplates) {
                    const message = messageTemplates[document.documentElement.lang || 'en'];
                    errors.push(this.formatMessage(message, ruleParams));
                }
            }
        }

        return errors;
    }

    formatMessage(template, params) {
        if (!params) return template;
        
        if (Array.isArray(params)) {
            params.forEach((param, index) => {
                template = template.replace(`{${index}}`, param);
            });
        } else {
            template = template.replace('{0}', params);
        }
        
        return template;
    }

    validateForm(formData, fieldRules) {
        const results = {
            isValid: true,
            errors: {},
            fieldErrors: {}
        };

        for (const [fieldName, rules] of Object.entries(fieldRules)) {
            const value = formData[fieldName];
            const fieldErrors = this.validateField(value, rules);
            
            if (fieldErrors.length > 0) {
                results.isValid = false;
                results.fieldErrors[fieldName] = fieldErrors;
                results.errors[fieldName] = fieldErrors[0]; // First error message
            }
        }

        return results;
    }
}

class EnhancedFormHandler {
    constructor() {
        this.validator = new FormValidator();
        this.loadingStates = new Map();
        this.setupGlobalEventListeners();
    }

    setupGlobalEventListeners() {
        // Handle form submissions
        document.addEventListener('submit', (e) => {
            const form = e.target;
            if (form.dataset.enhancedValidation !== undefined) {
                this.handleFormSubmit(e);
            }
        });

        // Handle real-time validation
        document.addEventListener('input', (e) => {
            const field = e.target;
            if (field.dataset.validateOnInput !== undefined) {
                this.validateFieldRealTime(field);
            }
        });

        // Handle blur validation
        document.addEventListener('blur', (e) => {
            const field = e.target;
            if (field.dataset.validateOnBlur !== undefined) {
                this.validateFieldRealTime(field);
            }
        });
    }

    handleFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        
        // Get form rules from data attributes
        const fieldRules = this.extractFieldRules(form);
        const formData = this.getFormData(form);
        
        // Validate form
        const validation = this.validator.validateForm(formData, fieldRules);
        
        if (!validation.isValid) {
            this.displayFormErrors(form, validation.fieldErrors);
            return;
        }
        
        // Clear previous errors
        this.clearFormErrors(form);
        
        // Submit form
        this.submitForm(form, formData);
    }

    extractFieldRules(form) {
        const rules = {};
        const fields = form.querySelectorAll('[data-rules]');
        
        fields.forEach(field => {
            const fieldName = field.name || field.id;
            if (fieldName) {
                try {
                    rules[fieldName] = JSON.parse(field.dataset.rules);
                } catch (e) {
                    console.warn(`Invalid rules for field ${fieldName}:`, field.dataset.rules);
                }
            }
        });
        
        return rules;
    }

    getFormData(form) {
        const formData = new FormData(form);
        const data = {};
        
        for (const [key, value] of formData.entries()) {
            if (data[key]) {
                // Handle multiple values
                if (Array.isArray(data[key])) {
                    data[key].push(value);
                } else {
                    data[key] = [data[key], value];
                }
            } else {
                data[key] = value;
            }
        }
        
        return data;
    }

    validateFieldRealTime(field) {
        const fieldName = field.name || field.id;
        if (!fieldName) return;
        
        // Get rules from parent form
        const form = field.closest('form');
        if (!form) return;
        
        const fieldRules = this.extractFieldRules(form);
        const rules = fieldRules[fieldName];
        if (!rules) return;
        
        const value = field.value;
        const errors = this.validator.validateField(value, rules);
        
        this.displayFieldErrors(field, errors);
    }

    displayFieldErrors(field, errors) {
        // Remove existing error elements
        this.clearFieldErrors(field);
        
        if (errors.length > 0) {
            field.classList.add('field-error');
            
            // Create error container
            const errorContainer = document.createElement('div');
            errorContainer.className = 'field-error-messages';
            
            errors.forEach(error => {
                const errorElement = document.createElement('div');
                errorElement.className = 'field-error-message';
                errorElement.textContent = error;
                errorContainer.appendChild(errorElement);
            });
            
            field.parentNode.insertBefore(errorContainer, field.nextSibling);
        } else {
            field.classList.remove('field-error');
        }
    }

    displayFormErrors(form, fieldErrors) {
        // Clear all previous errors
        this.clearFormErrors(form);
        
        // Display errors for each field
        Object.entries(fieldErrors).forEach(([fieldName, errors]) => {
            const field = form.querySelector(`[name="${fieldName}"], #${fieldName}`);
            if (field) {
                this.displayFieldErrors(field, errors);
            }
        });
        
        // Scroll to first error
        const firstErrorField = form.querySelector('.field-error');
        if (firstErrorField) {
            firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstErrorField.focus();
        }
    }

    clearFieldErrors(field) {
        field.classList.remove('field-error');
        const errorContainer = field.parentNode.querySelector('.field-error-messages');
        if (errorContainer) {
            errorContainer.remove();
        }
    }

    clearFormErrors(form) {
        const errorFields = form.querySelectorAll('.field-error');
        errorFields.forEach(field => {
            this.clearFieldErrors(field);
        });
    }

    async submitForm(form, formData) {
        const submitButton = form.querySelector('button[type="submit"]');
        const loadingState = this.showLoadingState(submitButton);
        
        try {
            const action = form.action || window.location.href;
            const method = form.method || 'POST';
            
            const response = await fetch(action, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccessMessage(result.message || 'Operation completed successfully');
                if (result.redirect) {
                    window.location.href = result.redirect;
                } else if (form.dataset.resetOnSuccess !== undefined) {
                    form.reset();
                    this.clearFormErrors(form);
                }
            } else {
                if (result.errors) {
                    this.displayFormErrors(form, result.errors);
                } else {
                    this.showErrorMessage(result.message || 'An error occurred');
                }
            }
        } catch (error) {
            console.error('Form submission error:', error);
            this.showErrorMessage('Network error. Please try again.');
        } finally {
            this.hideLoadingState(loadingState);
        }
    }

    showLoadingState(button) {
        if (!button) return null;
        
        const originalContent = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + 
                          (button.dataset.loadingText || 'Processing...');
        button.disabled = true;
        
        return {
            button: button,
            originalContent: originalContent
        };
    }

    hideLoadingState(loadingState) {
        if (!loadingState) return;
        
        loadingState.button.innerHTML = loadingState.originalContent;
        loadingState.button.disabled = false;
    }

    showSuccessMessage(message) {
        this.showMessage(message, 'success');
    }

    showErrorMessage(message) {
        this.showMessage(message, 'error');
    }

    showInfoMessage(message) {
        this.showMessage(message, 'info');
    }

    showMessage(message, type = 'info') {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.form-message');
        existingMessages.forEach(msg => msg.remove());
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `form-message form-message-${type}`;
        messageElement.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                               type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button class="message-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        
        // Add to document
        document.body.appendChild(messageElement);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (messageElement.parentElement) {
                messageElement.remove();
            }
        }, 5000);
    }

    // Predefined validation rules for EduFlow
    getStudentRules() {
        return {
            full_name: {
                required: true,
                minLength: 2,
                maxLength: 255
            },
            grade: {
                required: true,
                gradeFormat: true
            },
            room: {
                required: true,
                maxLength: 100
            },
            blood_type: {
                bloodType: true
            },
            parent_contact: {
                maxLength: 255
            }
        };
    }

    getSchoolRules() {
        return {
            name: {
                required: true,
                minLength: 2,
                maxLength: 255
            },
            study_type: {
                required: true,
                studyType: true
            },
            level: {
                required: true,
                educationalLevel: true
            },
            gender_type: {
                required: true,
                genderType: true
            }
        };
    }

    getSubjectRules() {
        return {
            name: {
                required: true,
                minLength: 1,
                maxLength: 255
            },
            grade_level: {
                required: true,
                maxLength: 50
            }
        };
    }
}

// Initialize form handler when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.formHandler = new EnhancedFormHandler();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FormValidator, EnhancedFormHandler };
}