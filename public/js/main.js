// Enterprise Lite AI Platform - Main JavaScript
class SMEAIPlatform {
    constructor() {
        this.currentUser = null;
        this.tenantId = 'default';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
        this.setupPlanSelection();
        this.ensureTenantId();
    }

    setupEventListeners() {
        // Subscription form
        const subscriptionForm = document.getElementById('subscriptionForm');
        if (subscriptionForm) {
            subscriptionForm.addEventListener('submit', (e) => this.handleSubscription(e));
        }

        // Navigation
        this.setupNavigation();

        const previewDemoLink = document.querySelector('[data-preview-demo]');
        if (previewDemoLink) {
            previewDemoLink.addEventListener('click', (event) => {
                event.preventDefault();
                const previewUser = {
                    id: 'preview_user',
                    company_name: 'Preview Company',
                    email: 'preview@example.com',
                    tenantId: 'preview-company'
                };
                localStorage.setItem('currentUser', JSON.stringify(previewUser));
                window.location.href = 'admin.html';
            });
        }
    }

    setupNavigation = function () {
        // Check if user is logged in and show appropriate navigation
        const nav = document.querySelector('nav');
        if (this.currentUser && nav) {
            this.updateNavigationForLoggedInUser();
        }
    };

    updateNavigationForLoggedInUser = function () {
        // Don't overwrite navigation on pages that already have proper nav (admin, sales-ai, support-ai, interview-ai)
        const isAppPage = window.location.pathname.includes('admin') || 
                          window.location.pathname.includes('sales-ai') || 
                          window.location.pathname.includes('support-ai') || 
                          window.location.pathname.includes('interview-ai') ||
                          window.location.pathname.includes('chat');
        if (isAppPage) return; // These pages have their own navigation
        
        // Only update nav on homepage/landing pages
        const navRight = document.querySelector('nav [class*="md\\:flex"]');
        if (navRight) {
            navRight.innerHTML = `
                <a href="admin.html" class="px-4 py-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded text-sm font-medium transition">Dashboard</a>
                <a href="sales-ai.html" class="px-4 py-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded text-sm font-medium transition">Sales AI</a>
                <a href="support-ai.html" class="px-4 py-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded text-sm font-medium transition">Support AI</a>
                <a href="interview-ai.html" class="px-4 py-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded text-sm font-medium transition">Interview AI</a>
                <button onclick="platform.logout()" class="ml-4 px-4 py-2 border border-neutral-300 rounded text-sm font-medium hover:bg-neutral-100 transition">
                    <i class="fas fa-sign-out-alt mr-1"></i>Sign Out
                </button>
            `;
        }
    };

    setupPlanSelection() {
        // Single plan - no selection needed
        const selectedPlanInput = document.getElementById('selectedPlan');
        if (selectedPlanInput) {
            selectedPlanInput.value = 'complete';
        }
    }

    async handleSubscription(e) {
        e.preventDefault();
        
        const formData = this.getFormData();
        const validation = this.validateSubscriptionForm(formData);
        
        if (!validation.isValid) {
            this.showError(validation.errors.join(', '));
            return;
        }

        this.showLoading(true);
        
        try {
            // Create company record
            const company = await this.createCompany(formData);
            
            // Process payment (simulated)
            const paymentResult = await this.processPayment(formData);
            
            if (paymentResult.success) {
                // Update company with subscription status
                await this.updateCompanySubscription(company.id, formData.selectedPlan);
                
                // Generate invoice and receipt
                await this.generateInvoice(company.id, formData);
                
                // Set current user session
                this.currentUser = company;
                localStorage.setItem('currentUser', JSON.stringify(company));
                
                this.showSuccess('Subscription successful! Redirecting to dashboard...');
                setTimeout(() => {
                    window.location.href = 'admin.html';
                }, 2000);
            } else {
                this.showError('Payment failed. Please check your payment details.');
            }
        } catch (error) {
            console.error('Subscription error:', error);
            this.showError('An error occurred during subscription. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    getFormData() {
        return {
            companyName: document.getElementById('companyName').value.trim(),
            contactPerson: document.getElementById('contactPerson').value.trim(),
            email: document.getElementById('email').value.trim(),
            phone: document.getElementById('phone').value.trim(),
            address: document.getElementById('address').value.trim(),
            selectedPlan: document.getElementById('selectedPlan').value,
            cardNumber: document.getElementById('cardNumber').value.trim(),
            expiryDate: document.getElementById('expiryDate').value.trim(),
            cvv: document.getElementById('cvv').value.trim(),
            cardholderName: document.getElementById('cardholderName').value.trim(),
            agreeTerms: document.getElementById('agreeTerms').checked
        };
    }

    validateSubscriptionForm(data) {
        const errors = [];
        
        if (!data.companyName) errors.push('Company name is required');
        if (!data.contactPerson) errors.push('Contact person is required');
        if (!data.email) errors.push('Email is required');
        if (!this.isValidEmail(data.email)) errors.push('Valid email is required');
        if (!data.phone) errors.push('Phone number is required');
        if (!data.selectedPlan) errors.push('Please select a subscription plan');
        if (!data.agreeTerms) errors.push('Please agree to terms and conditions');
        
        // Basic payment validation (in real app, use proper payment processor)
        if (!data.cardNumber || data.cardNumber.length < 16) errors.push('Valid card number is required');
        if (!data.expiryDate || !data.expiryDate.match(/^\d{2}\/\d{2}$/)) errors.push('Valid expiry date is required');
        if (!data.cvv || data.cvv.length < 3) errors.push('Valid CVV is required');
        if (!data.cardholderName) errors.push('Cardholder name is required');
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    async createCompany(formData) {
        const companyData = {
            company_name: formData.companyName,
            contact_person: formData.contactPerson,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            subscription_status: 'pending',
            subscription_plan: formData.selectedPlan,
            subscription_date: new Date().toISOString(),
            next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
        };

        const tenantId = this.getTenantId();
        const headers = SMEAIClient ? SMEAIClient.buildHeaders(tenantId, null, { 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json', 'x-tenant-id': tenantId };
        const response = await fetch('/api/companies', {
            method: 'POST',
            headers,
            body: JSON.stringify(companyData)
        });

        if (!response.ok) {
            throw new Error('Failed to create company record');
        }

        return await response.json();
    }

    async processPayment(formData) {
        // Simulate payment processing
        return new Promise((resolve) => {
            setTimeout(() => {
                // In real implementation, integrate with payment processor
                const success = Math.random() > 0.1; // 90% success rate for demo
                resolve({
                    success: success,
                    transactionId: this.generateId(),
                    amount: this.getPlanPrice(formData.selectedPlan)
                });
            }, 2000);
        });
    }

    getPlanPrice(plan) {
        return 99; // Single plan price
    }

    async updateCompanySubscription(companyId, plan) {
        const tenantId = this.getTenantId();
        const headers = global.SMEAIClient
            ? global.SMEAIClient.buildHeaders(tenantId, null, { 'Content-Type': 'application/json' })
            : { 'Content-Type': 'application/json', 'x-tenant-id': tenantId };
        const response = await fetch(`/api/companies/${encodeURIComponent(companyId)}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                subscription_status: 'active',
                subscription_plan: plan
            })
        });

        if (!response.ok) {
            throw new Error('Failed to update subscription status');
        }

        return await response.json();
    }

    async generateInvoice(companyId, formData) {
        // In real implementation, generate actual PDF invoice
        console.log('Generating invoice for company:', companyId);
        console.log('Plan:', formData.selectedPlan);
        console.log('Amount:', this.getPlanPrice(formData.selectedPlan));
        
        // Could integrate with invoice generation service here
        return {
            invoiceId: this.generateId(),
            receiptId: this.generateId(),
            generated: true
        };
    }

    generateId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    checkAuthStatus() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                this.currentUser = JSON.parse(storedUser);
                this.ensureTenantId();
                this.setupNavigation();
            } catch (error) {
                console.error('Error parsing stored user:', error);
                localStorage.removeItem('currentUser');
            }
        }
    }

    logout() {
        this.currentUser = null;
        this.tenantId = 'default';
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }

    ensureTenantId() {
        if (!this.currentUser) {
            this.tenantId = this.previewTenant;
            return;
        }

        if (this.currentUser.tenantId) {
            this.tenantId = this.currentUser.tenantId;
            return;
        }

        const slug = this.slugifyTenant(this.currentUser.company_name || this.currentUser.email || 'tenant');
        this.tenantId = slug || this.previewTenant;
        this.currentUser.tenantId = this.tenantId;
        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
    }

    slugifyTenant(value) {
        if (!value || typeof value !== 'string') return 'tenant';
        const slug = value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 60);
        return slug || 'tenant';
    }

    get previewTenant() {
        return window.__DEFAULT_TENANT_ID__ || 'preview-company';
    }

    getTenantId() {
        return this.tenantId || this.previewTenant;
    }

    makeTenantAwareUrl(path, extraQuery = {}) {
        const params = new URLSearchParams(extraQuery);
        const tenant = this.getTenantId();
        if (tenant) params.set('tenant', tenant);
        const query = params.toString();
        return query ? `${path}?${query}` : path;
    }

    showLoading(show) {
        const modal = document.getElementById('loadingModal');
        if (modal) {
            modal.classList.toggle('hidden', !show);
            modal.classList.toggle('flex', show);
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all transform ${
            type === 'error' ? 'bg-red-500' : 
            type === 'success' ? 'bg-green-500' : 'bg-blue-500'
        } text-white`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${
                    type === 'error' ? 'fa-exclamation-circle' : 
                    type === 'success' ? 'fa-check-circle' : 'fa-info-circle'
                } mr-2"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 hover:opacity-70">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
}

// Initialize the platform
const platform = new SMEAIPlatform();

// Utility functions for other pages
window.SMEAIUtils = {
    async uploadFile(file, category) {
        console.warn('SMEAIUtils.uploadFile is deprecated. Use SMEAIUploader instead.');
        return SMEAIClient.uploadFiles([file], { tenantId: platform.getTenantId(), persona: category });
    },

    generateAILink(type, configId) {
        const params = new URLSearchParams({ tenant: platform.getTenantId(), type, config: configId || 'preview' });
        return `${window.location.origin}/component-preview.html?${params.toString()}`;
    },

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    formatDateTime(dateString) {
        return new Date(dateString).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    escapeHtml(text) {
        if (typeof text !== 'string') {
            return text;
        }
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};