// Interview AI JavaScript
class InterviewAIManager {
    constructor() {
        this.currentConfig = null;
        this.selectedRole = null;
        this.generatedQuestions = [];
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.setupSharedClients();
        this.setupEventListeners();
        this.initializePreview();
        this.loadRoleTemplates();
        this.loadExistingConfiguration();
    }

    checkAuthentication() {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
        if (!currentUser) {
            // Temporarily bypass authentication for preview
            this.currentUser = {
                id: 'preview_user',
                company_name: 'Preview Company'
            };
            return;
        }
        this.currentUser = currentUser;
    }

    setupSharedClients() {
        if (!this.uploader) {
            this.uploader = new SMEAIUploader({
                tenantId: window.platform?.getTenantId?.() || 'default',
                persona: 'interview',
                onStatus: (type, message) => this.showNotification(message, type),
                onManifest: () => {},
                onQualityReport: () => {},
                onError: (error) => console.error('Uploader error:', error)
            });
        }
    }

    initializePreview() {
        // This method will be implemented to initialize preview functionality
        // For now, it's a placeholder.
    }

    loadRoleTemplates() {
        // This method will be implemented to load available role templates
        // For now, it's a placeholder.
    }

    buildHeaders() {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        if (window.platform?.getTenantId) {
            headers.set('x-tenant-id', window.platform.getTenantId());
        }
        headers.set('x-persona-id', 'interview');
        if (this.currentUser?.id) {
            headers.set('x-company-id', this.currentUser.id);
        }
        return headers;
    }

    setupEventListeners() {
        // Video toggle
        const toggleVideo = document.getElementById('toggleVideo');
        const videoContainer = document.getElementById('videoContainer');
        if (toggleVideo && videoContainer) {
            toggleVideo.addEventListener('click', () => {
                const isHidden = videoContainer.classList.contains('hidden');
                videoContainer.classList.toggle('hidden', !isHidden);
                toggleVideo.innerHTML = isHidden ? 
                    '<i class="fas fa-eye-slash mr-2"></i>Hide Tutorial' : 
                    '<i class="fas fa-eye mr-2"></i>Watch Tutorial';
            });
        }

        // Role template selection
        const roleTemplates = document.querySelectorAll('.role-template');
        roleTemplates.forEach(template => {
            template.addEventListener('click', () => {
                this.selectRoleTemplate(template);
            });
        });

        const clearRoleBtn = document.getElementById('clearRoleBtn');
        if (clearRoleBtn) {
            clearRoleBtn.addEventListener('click', () => {
                const jobRoleInput = document.getElementById('jobRoleInput');
                if (jobRoleInput) {
                    jobRoleInput.value = '';
                }
            });
        }

        // Generate job button
        const generateJobBtn = document.getElementById('generateJobBtn');
        if (generateJobBtn) {
            generateJobBtn.addEventListener('click', () => this.generateJobAndQuestions());
        }

        // Questions management
        const addQuestionBtn = document.getElementById('addQuestionBtn');
        if (addQuestionBtn) {
            addQuestionBtn.addEventListener('click', () => this.addCustomQuestion());
        }

        const regenerateBtn = document.getElementById('regenerateBtn');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', () => this.regenerateQuestions());
        }

        const saveQuestionsBtn = document.getElementById('saveQuestionsBtn');
        if (saveQuestionsBtn) {
            saveQuestionsBtn.addEventListener('click', () => this.saveConfiguration());
        }

        // AI Link generation
        const generateLinkBtn = document.getElementById('generateLinkBtn');
        if (generateLinkBtn) {
            generateLinkBtn.addEventListener('click', () => this.generateAILink());
        }

        const copyLinkBtn = document.getElementById('copyInterviewLinkBtn');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => this.copyAILink());
        }

        const testLinkBtn = document.getElementById('testInterviewLinkBtn');
        if (testLinkBtn) {
            testLinkBtn.addEventListener('click', () => this.testAILink());
        }

        // Preview button
        const previewBtn = document.getElementById('previewInterviewBtn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.showPreview());
        }

        // Enable/disable CTA buttons based on input changes
        const jobRoleInput = document.getElementById('jobRoleInput');
        if (jobRoleInput) {
            jobRoleInput.addEventListener('input', () => {
                this.toggleGenerateButton(jobRoleInput.value.trim().length > 0);
            });
        }
    }

    selectRoleTemplate(template) {
        // Remove previous selection
        document.querySelectorAll('.role-template').forEach(t => {
            t.classList.remove('selected');
        });
        
        // Add selection to clicked template
        template.classList.add('selected');
        
        this.selectedRole = template.dataset.role;
        
        // Pre-fill job role input based on selection
        const jobRoleInput = document.getElementById('jobRoleInput');
        if (!jobRoleInput) return;

        const roleTemplates = {
            'sales': {
                description: 'We are hiring a proactive sales representative to manage the full sales cycle, build strong client relationships, and consistently hit monthly revenue targets. The role includes prospecting, product demos, and negotiating contracts.',
                roleType: 'sales'
            },
            'customer-service': {
                description: 'We need a customer service specialist to handle inbound inquiries, resolve issues quickly, and keep satisfaction scores high across channels such as email, phone, and chat. Empathy and communication are essential.',
                roleType: 'customer-service'
            },
            'junior-tech': {
                description: 'We are looking for a junior technical support associate to troubleshoot hardware/software problems, document fixes, and escalate complex cases. Curiosity, clear communication, and eagerness to learn new tools are key.',
                roleType: 'junior-tech'
            }
        };

        const templateData = roleTemplates[this.selectedRole];
        if (!templateData) {
            jobRoleInput.value = '';
            this.toggleGenerateButton(false);
            return;
        }

        jobRoleInput.value = templateData.description;
        jobRoleInput.dispatchEvent(new Event('input'));

        // Generate and display job description immediately
        const generatedJobDesc = this.generateJobDescription(templateData.description, templateData.roleType);
        this.displayJobDescription(generatedJobDesc);

        // Generate default questions for the template
        this.generatedQuestions = this.generateInterviewQuestions(templateData.description, templateData.roleType);
        this.displayQuestions();
        this.enableActionButtons();

        // Enable link/preview buttons now that content exists
        this.toggleGenerateButton(true);
    }

    async generateJobAndQuestions() {
        const jobRoleInput = document.getElementById('jobRoleInput');
        const jobDescription = jobRoleInput ? jobRoleInput.value.trim() : '';
        
        if (!jobDescription) {
            this.showNotification('Please describe the job role first', 'error');
            this.toggleGenerateButton(false);
            return;
        }

        this.toggleGenerateButton(false);
        this.showGeneratingModal();

        try {
            // Simulate AI generation delay
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Generate job description
            const generatedJobDesc = this.generateJobDescription(jobDescription, this.selectedRole);
            this.displayJobDescription(generatedJobDesc);
            
            // Generate interview questions
            this.generatedQuestions = this.generateInterviewQuestions(jobDescription, this.selectedRole);
            this.displayQuestions();
            
            // Enable action buttons
            this.enableActionButtons();
            this.toggleGenerateButton(true);
            
            this.showNotification('Job description and questions generated successfully!', 'success');
            
        } catch (error) {
            console.error('Generation error:', error);
            this.showNotification('Error generating content', 'error');
        } finally {
            this.hideGeneratingModal();
        }
    }

    generateJobDescription(input, roleTypeOverride) {
        // Simulate AI-generated job description based on input
        const resolvedRole = roleTypeOverride || this.selectedRole || 'general';
        
        const templates = {
            'sales': {
                title: 'Sales Representative',
                department: 'Sales & Marketing',
                summary: 'We are seeking a dynamic Sales Representative to join our growing team. The successful candidate will be responsible for driving revenue growth through lead generation, customer relationship management, and achieving sales targets.'
            },
            'customer-service': {
                title: 'Customer Service Representative',
                department: 'Customer Success',
                summary: 'We are looking for a dedicated Customer Service Representative to provide exceptional support to our clients. The role involves handling inquiries, resolving issues, and ensuring customer satisfaction across all touchpoints.'
            },
            'junior-tech': {
                title: 'Junior Technical Support',
                department: 'Information Technology',
                summary: 'We are seeking an enthusiastic Junior Technical Support specialist to provide first-line technical assistance. This role is perfect for someone starting their career in technology with a passion for problem-solving.'
            }
        };

        const template = templates[resolvedRole] || templates['sales'];
        
        return {
            jobTitle: template.title,
            department: template.department,
            jobSummary: template.summary,
            keyResponsibilities: this.extractResponsibilities(input, resolvedRole),
            requirements: this.extractRequirements(input, resolvedRole),
            benefits: [
                'Competitive salary and commission structure',
                'Health and dental insurance',
                'Professional development opportunities',
                'Flexible working arrangements',
                'Career advancement potential'
            ]
        };
    }

    extractResponsibilities(input, roleType) {
        const commonWords = ['manage', 'handle', 'provide', 'maintain', 'develop', 'support', 'assist', 'resolve', 'generate', 'meet'];
        
        // Extract key phrases from input and create responsibilities
        const responsibilities = [];
        
        if (roleType === 'sales') {
            responsibilities.push(
                'Generate new leads through various channels',
                'Build and maintain strong customer relationships',
                'Meet or exceed monthly sales targets',
                'Provide product presentations and demonstrations',
                'Negotiate contracts and close deals'
            );
        } else if (roleType === 'customer-service') {
            responsibilities.push(
                'Respond to customer inquiries via phone, email, and chat',
                'Resolve customer complaints and issues promptly',
                'Provide product information and technical support',
                'Maintain accurate customer records',
                'Escalate complex issues to appropriate departments'
            );
        } else if (roleType === 'junior-tech') {
            responsibilities.push(
                'Provide first-level technical support to users',
                'Troubleshoot hardware and software issues',
                'Install and configure computer systems',
                'Document technical procedures and solutions',
                'Assist senior technicians with complex projects'
            );
        }
        
        return responsibilities;
    }

    extractRequirements(input, roleType) {
        const requirements = [];
        
        if (roleType === 'sales') {
            requirements.push(
                'Minimum 1-2 years of sales experience preferred',
                'Excellent communication and interpersonal skills',
                'Goal-oriented with a proven track record of meeting targets',
                'Strong negotiation and closing abilities',
                'Proficiency in CRM software and Microsoft Office'
            );
        } else if (roleType === 'customer-service') {
            requirements.push(
                'High school diploma or equivalent required',
                'Previous customer service experience preferred',
                'Excellent verbal and written communication skills',
                'Strong problem-solving abilities',
                'Patience and empathy when dealing with customers'
            );
        } else if (roleType === 'junior-tech') {
            requirements.push(
                'Basic knowledge of computer systems and networks',
                'Problem-solving and analytical thinking skills',
                'Willingness to learn new technologies',
                'Good communication skills for user support',
                'Technical certification or relevant coursework a plus'
            );
        }
        
        return requirements;
    }

    generateInterviewQuestions(input, roleTypeOverride) {
        const questionSets = {
            'sales': [
                'Tell me about your previous sales experience and your biggest achievement.',
                'How do you handle rejection and maintain motivation in sales?',
                'Describe your approach to building relationships with new clients.',
                'What strategies do you use to meet and exceed sales targets?',
                'How would you handle a situation where a customer is unhappy with our product?'
            ],
            'customer-service': [
                'Describe a time when you dealt with a difficult customer. How did you handle it?',
                'What does excellent customer service mean to you?',
                'How do you prioritize multiple customer requests when you\'re busy?',
                'Tell me about a time you went above and beyond for a customer.',
                'How would you handle a situation where you don\'t know the answer to a customer\'s question?'
            ],
            'junior-tech': [
                'What interests you most about working in technology?',
                'Describe your experience with troubleshooting technical problems.',
                'How do you stay current with new technologies and trends?',
                'Tell me about a technical challenge you\'ve faced and how you solved it.',
                'How would you explain a technical concept to a non-technical user?'
            ]
        };

        const resolvedRole = roleTypeOverride || this.selectedRole || 'sales';
        const questions = questionSets[resolvedRole] || questionSets['sales'];
        
        return questions.map((question, index) => ({
            id: `q${index + 1}`,
            question: question,
            category: this.getQuestionCategory(question),
            editable: true
        }));
    }

    getQuestionCategory(question) {
        if (question.toLowerCase().includes('experience')) return 'Experience';
        if (question.toLowerCase().includes('handle') || question.toLowerCase().includes('situation')) return 'Situational';
        if (question.toLowerCase().includes('technical')) return 'Technical';
        if (question.toLowerCase().includes('customer')) return 'Customer Focus';
        return 'General';
    }

    displayJobDescription(jobDesc) {
        const container = document.getElementById('jobDescriptionContainer');
        const placeholder = document.getElementById('jobDescriptionPlaceholder');
        if (placeholder) {
            placeholder.remove();
        }

        container.innerHTML = `
            <div class="bg-white border border-gray-200 rounded-lg p-6">
                <div class="mb-4">
                    <h4 class="text-lg font-bold text-gray-800 mb-1">${jobDesc.jobTitle}</h4>
                    <p class="text-sm text-gray-600">${jobDesc.department}</p>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <h5 class="font-semibold text-gray-800 mb-2">Job Summary</h5>
                        <p class="text-sm text-gray-700">${jobDesc.jobSummary}</p>
                    </div>
                    
                    <div>
                        <h5 class="font-semibold text-gray-800 mb-2">Key Responsibilities</h5>
                        <ul class="text-sm text-gray-700 space-y-1">
                            ${jobDesc.keyResponsibilities.map(resp => `<li class="flex items-start"><i class="fas fa-chevron-right text-xs primary-text mr-2 mt-1"></i>${resp}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <div>
                        <h5 class="font-semibold text-gray-800 mb-2">Requirements</h5>
                        <ul class="text-sm text-gray-700 space-y-1">
                            ${jobDesc.requirements.map(req => `<li class="flex items-start"><i class="fas fa-check text-xs text-green-600 mr-2 mt-1"></i>${req}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    displayQuestions() {
        const container = document.getElementById('questionsContainer');
        const placeholder = document.getElementById('questionsPlaceholder');
        if (placeholder) {
            placeholder.remove();
        }

        container.innerHTML = this.generatedQuestions.map((q, index) => `
            <div class="question-item bg-white border border-gray-200 rounded-lg p-4" data-question-id="${q.id}">
                <div class="flex items-start justify-between mb-2">
                    <span class="text-xs font-medium primary-text bg-red-50 px-2 py-1 rounded">${q.category}</span>
                    <button onclick="interviewAI.removeQuestion('${q.id}')" class="text-gray-400 hover:text-red-500 transition text-sm">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="flex items-start space-x-3">
                    <div class="bg-blue-50 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        <span class="text-sm font-medium text-blue-600">${index + 1}</span>
                    </div>
                    <textarea class="flex-1 text-gray-800 text-sm resize-none border-none outline-none focus:bg-gray-50 rounded p-2" 
                              rows="2" onchange="interviewAI.updateQuestion('${q.id}', this.value)">${q.question}</textarea>
                </div>
            </div>
        `).join('');
        
        // Show questions actions
        const actionsContainer = document.getElementById('questionsActions');
        if (actionsContainer) {
            actionsContainer.classList.remove('hidden');
        }
    }

    addCustomQuestion() {
        const newQuestion = {
            id: `custom_${Date.now()}`,
            question: 'Enter your custom question here...',
            category: 'Custom',
            editable: true
        };
        
        this.generatedQuestions.push(newQuestion);
        this.displayQuestions();
    }

    updateQuestion(questionId, newText) {
        const question = this.generatedQuestions.find(q => q.id === questionId);
        if (question) {
            question.question = newText;
        }
    }

    removeQuestion(questionId) {
        this.generatedQuestions = this.generatedQuestions.filter(q => q.id !== questionId);
        this.displayQuestions();
    }

    regenerateQuestions() {
        const jobRoleInput = document.getElementById('jobRoleInput');
        const jobDescription = jobRoleInput ? jobRoleInput.value.trim() : '';
        
        if (jobDescription) {
            this.generatedQuestions = this.generateInterviewQuestions(jobDescription, this.selectedRole);
            this.displayQuestions();
            this.showNotification('Questions regenerated successfully!', 'success');
            this.toggleGenerateButton(true);
        }
    }

    async saveConfiguration() {
        try {
            const configData = {
                company_id: this.currentUser.id,
                job_role: this.selectedRole || 'custom',
                job_description: document.getElementById('jobRoleInput').value.trim(),
                interview_questions: JSON.stringify(this.generatedQuestions),
                product_info_file: '', // Not used in this simplified version
                custom_prompt: document.getElementById('jobRoleInput').value.trim(),
                ai_link: '',
                usage_count: 0,
                last_used: null,
                status: 'active'
            };

            const tenantId = window.platform?.getTenantId();
            const personaId = 'interview';
            const headers = global.SMEAIClient
                ? global.SMEAIClient.buildHeaders(tenantId, personaId, { 'Content-Type': 'application/json' })
                : { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'x-persona-id': personaId };
            let response;
            if (this.currentConfig) {
                response = await fetch(`/api/interview-ai/${encodeURIComponent(this.currentConfig.id)}`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify(configData)
                });
            } else {
                response = await fetch('/api/interview-ai', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(configData)
                });
            }

            if (!response.ok) {
                throw new Error('Failed to save Interview AI configuration');
            }

            const result = await response.json();
            this.currentConfig = result?.record || result?.data?.[0] || result;
            if (this.currentConfig?.ai_link) {
                this.updateAILinkDisplay(this.currentConfig.ai_link);
            }

            this.showNotification('Interview AI settings saved successfully!', 'success');
            this.toggleGenerateButton(false);
            
        } catch (error) {
            console.error('Error saving configuration:', error);
            this.showNotification('Error saving Interview AI settings', 'error');
        }
    }

    loadExistingConfiguration() {
        const tenantId = window.platform?.getTenantId();
        const headers = global.SMEAIClient
            ? global.SMEAIClient.buildHeaders(tenantId, 'interview', { 'Content-Type': 'application/json' })
            : { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'x-persona-id': 'interview' };
        fetch('/api/interview-ai', {
            headers
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load interview configuration');
                }
                return response.json();
            })
            .then(data => {
                const records = Array.isArray(data?.data) ? data.data : [];
                if (records.length > 0) {
                    this.currentConfig = records[0];
                    this.populateFormWithConfig(this.currentConfig);
                }
            })
            .catch(error => {
                console.error('Error loading interview configuration:', error);
            });
    }

    populateFormWithConfig(config) {
        if (!config) return;
        const jobRoleInput = document.getElementById('jobRoleInput');
        if (jobRoleInput) {
            jobRoleInput.value = config.custom_prompt || '';
            jobRoleInput.dispatchEvent(new Event('input'));
        }
        this.selectedRole = config.job_role || 'custom';
        this.selectRoleTemplate(document.querySelector(`.role-template[data-role="${this.selectedRole}"]`));
        this.generatedQuestions = JSON.parse(config.interview_questions || '[]');
        this.displayQuestions();
        this.enableActionButtons();
        this.toggleGenerateButton(true);
        if (config.ai_link) {
            this.updateAILinkDisplay(config.ai_link);
        }
    }

    updateAILinkDisplay(link) {
        const input = document.getElementById('interviewAILink');
        if (input) {
            input.value = link;
        }
    }

    async updateAILinkOnServer(link) {
        if (!this.currentConfig?.id) return;
        try {
            const tenantId = window.platform?.getTenantId();
            const headers = global.SMEAIClient
                ? global.SMEAIClient.buildHeaders(tenantId, 'interview', { 'Content-Type': 'application/json' })
                : { 'Content-Type': 'application/json', 'x-tenant-id': tenantId, 'x-persona-id': 'interview' };
            await fetch(`/api/interview-ai/${encodeURIComponent(this.currentConfig.id)}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ ai_link: link })
            });
        } catch (error) {
            console.error('Error updating AI link:', error);
        }
    }

    generateInterviewLink() {
        const tenantId = window.platform?.getTenantId();
        const params = new URLSearchParams({ tenant: tenantId, type: 'interview', config: this.currentConfig?.id || 'preview' });
        const link = `${window.location.origin}/component-preview.html?${params.toString()}`;
        this.updateAILinkDisplay(link);
        this.updateAILinkOnServer(link);
        this.showNotification('Interview AI link generated!', 'success');
    }

    copyAILink() {
        const link = document.getElementById('interviewAILink').value;
        navigator.clipboard.writeText(link).then(() => {
            this.showNotification('Interview AI link copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy link:', err);
            this.showNotification('Failed to copy Interview AI link', 'error');
        });
    }

    testAILink() {
        const link = document.getElementById('interviewAILink').value;
        if (!link) {
            this.showNotification('No Interview AI link to test.', 'error');
            return;
        }
        this.showLoadingModal('Testing Interview AI Link...');
        const tenantId = window.platform?.getTenantId();
        const headers = global.SMEAIClient
            ? global.SMEAIClient.buildHeaders(tenantId, 'interview')
            : this.buildHeaders();
        fetch(link, {
            method: 'GET',
            headers
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            })
            .then(data => {
                this.showNotification(`Interview AI Link is working! Response: ${JSON.stringify(data)}`, 'success');
            })
            .catch(error => {
                console.error('Error testing Interview AI Link:', error);
                this.showNotification(`Interview AI Link is not working. Error: ${error.message}`, 'error');
            })
            .finally(() => {
                this.hideLoadingModal();
            });
    }

    showPreview() {
        const link = document.getElementById('interviewAILink').value;
        if (!link) {
            this.showNotification('No Interview AI link to preview.', 'error');
            return;
        }
        this.showLoadingModal('Previewing Interview AI...');
        const tenantId = window.platform?.getTenantId();
        const headers = global.SMEAIClient
            ? global.SMEAIClient.buildHeaders(tenantId, 'interview')
            : this.buildHeaders();
        fetch(link, {
            method: 'GET',
            headers
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            })
            .then(data => {
                this.showNotification(`Interview AI Preview successful! Response: ${JSON.stringify(data)}`, 'success');
            })
            .catch(error => {
                console.error('Error previewing Interview AI:', error);
                this.showNotification(`Interview AI Preview failed. Error: ${error.message}`, 'error');
            })
            .finally(() => {
                this.hideLoadingModal();
            });
    }

    toggleGenerateButton(enabled) {
        const generateJobBtn = document.getElementById('generateJobBtn');
        const saveQuestionsBtn = document.getElementById('saveQuestionsBtn');
        const generateLinkBtn = document.getElementById('generateLinkBtn');
        const previewBtn = document.getElementById('previewInterviewBtn');

        if (generateJobBtn) generateJobBtn.disabled = !enabled;
        if (saveQuestionsBtn) saveQuestionsBtn.disabled = !enabled;
        if (generateLinkBtn) generateLinkBtn.disabled = !enabled;
        if (previewBtn) previewBtn.disabled = !enabled;
    }

    enableActionButtons() {
        const saveQuestionsBtn = document.getElementById('saveQuestionsBtn');
        const generateLinkBtn = document.getElementById('generateLinkBtn');
        const previewBtn = document.getElementById('previewInterviewBtn');

        if (saveQuestionsBtn) saveQuestionsBtn.disabled = false;
        if (generateLinkBtn) generateLinkBtn.disabled = false;
        if (previewBtn) previewBtn.disabled = false;
    }

    showGeneratingModal() {
        const modal = document.getElementById('generatingModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideGeneratingModal() {
        const modal = document.getElementById('generatingModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showLoadingModal(message) {
        const modal = document.getElementById('loadingModal');
        if (modal) {
            modal.querySelector('.modal-content').textContent = message;
            modal.classList.remove('hidden');
        }
    }

    hideLoadingModal() {
        const modal = document.getElementById('loadingModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (notification) {
            notification.textContent = message;
            notification.className = 'notification';
            if (type === 'success') {
                notification.classList.add('success');
            } else if (type === 'error') {
                notification.classList.add('error');
            }
            notification.classList.remove('hidden');
            setTimeout(() => {
                notification.classList.add('hidden');
            }, 3000);
        }
    }
}

// Assuming InterviewAIManager is instantiated globally or passed to other functions
// For example:
// const interviewAI = new InterviewAIManager();
// interviewAI.init();