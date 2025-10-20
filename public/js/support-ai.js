// Support AI Configuration JavaScript
class SupportAIManager {
    constructor() {
        this.currentConfig = null;
        this.uploadedFiles = [];
        this.supportCategories = [];
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.setupSharedClients();
        this.setupEventListeners();
        this.initializeTonePicker();
        this.loadExistingConfiguration();
        this.initializeDefaultCategories();
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
        this.uploader = new SMEAIUploader({
            tenantId: platform.getTenantId(),
            onStatus: (type, message) => this.showNotification(message, type),
            onManifest: (manifest) => this.handleManifest(manifest),
            onQualityReport: (report) => this.updateQualitySummary(report),
            onError: (error) => console.error('Uploader error:', error)
        });
    }

    setupEventListeners() {
        const toggleVideo = document.getElementById('toggleVideo');
        const videoContainer = document.getElementById('videoContainer');
        toggleVideo.addEventListener('click', () => {
            const isHidden = videoContainer.classList.contains('hidden');
            videoContainer.classList.toggle('hidden', !isHidden);
            toggleVideo.innerHTML = isHidden ?
                '<i class="fas fa-eye-slash mr-2"></i>Hide Tutorial' :
                '<i class="fas fa-eye mr-2"></i>Watch Tutorial';
        });

        this.setupFileUpload();

        document.getElementById('generateLinkBtn').addEventListener('click', () => this.generateAILink());
        document.getElementById('copySupportLinkBtn').addEventListener('click', () => this.copyAILink());
        document.getElementById('testSupportLinkBtn').addEventListener('click', () => this.testAILink());
    }

    initializeTonePicker() {
        const toneSelect = document.getElementById('supportResponseStyle');
        if (!toneSelect) return;

        toneSelect.addEventListener('change', () => this.updateToneStatus(toneSelect.value));
        this.updateToneStatus(toneSelect.value);
    }

    updateToneStatus(value) {
        const el = document.getElementById('toneStatus');
        if (!el) return;
        const labels = {
            helpful: 'Helpful',
            empathetic: 'Empathetic',
            professional: 'Professional',
            friendly: 'Friendly'
        };
        el.textContent = labels[value] || 'Helpful';
    }

    setupCategoryHandlers() {
        // Use event delegation for dynamically added category delete buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.category-item .fa-trash')) {
                const categoryItem = e.target.closest('.category-item');
                categoryItem.remove();
                this.updateSupportCategories();
            }
        });
    }

    initializeDefaultCategories() {
        // Categories are already in HTML, just update the array
        this.updateSupportCategories();
    }

    addSupportCategory() {
        const container = document.getElementById('supportCategories');
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category-item bg-white/5 rounded-lg p-4 border border-white/10';
        categoryDiv.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <input type="text" placeholder="Enter category name..." 
                    class="bg-transparent text-white font-medium text-lg border-none outline-none flex-1">
                <button class="text-red-400 hover:text-red-300">
                    <i class="fas fa-trash text-sm"></i>
                </button>
            </div>
            <textarea placeholder="Define how AI should handle this type of request..." rows="2"
                class="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-gray-400 text-sm resize-none"></textarea>
        `;
        
        container.appendChild(categoryDiv);
        
        // Focus on the new category name input
        const nameInput = categoryDiv.querySelector('input');
        nameInput.focus();
    }

    updateSupportCategories() {
        const categoryItems = document.querySelectorAll('.category-item');
        this.supportCategories = Array.from(categoryItems).map(item => {
            const nameInput = item.querySelector('input');
            const descriptionTextarea = item.querySelector('textarea');
            return {
                name: nameInput.value.trim(),
                description: descriptionTextarea.value.trim()
            };
        }).filter(cat => cat.name.length > 0);
    }

    setupFileUpload() {
        const dropZone = document.getElementById('supportDropZone');
        const fileInput = document.getElementById('supportFileInput');

        const handleSelection = async (files) => {
            if (!files || files.length === 0) return;
            try {
                await this.uploader.upload(files);
                await this.refreshManifest();
            } catch (error) {
                // notification handled already
            }
        };

        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            handleSelection(Array.from(e.dataTransfer.files));
        });

        fileInput.addEventListener('change', (e) => {
            handleSelection(Array.from(e.target.files));
            e.target.value = '';
        });
    }

    async refreshManifest() {
        const status = await this.uploader.refresh();
        this.handleManifest(status.manifest || null);
    }

    handleManifest(manifest) {
        const list = document.getElementById('supportFilesList');
        list.innerHTML = '';
        this.uploadedFiles = [];

        if (!manifest || !manifest.files) {
            this.updateStatuses();
            return;
        }

        manifest.files.forEach(file => {
            const displayName = file.name || (file.artifacts?.storageKey ? file.artifacts.storageKey.split('/').pop() : 'Uploaded file');
            this.uploadedFiles.push(file);
            const item = document.createElement('div');
            item.className = 'bg-white rounded-lg p-3 flex items-center justify-between text-gray-800 shadow-sm';
            item.innerHTML = `
                <div class="flex items-center space-x-3">
                    <i class="fas fa-file-alt text-green-500"></i>
                    <div>
                        <div class="font-semibold text-sm text-gray-900">${displayName}</div>
                        <div class="text-gray-500 text-xs">${file.type?.toUpperCase?.() || ''}</div>
                    </div>
                </div>
                <button class="text-red-500 hover:text-red-400 transition" data-file-name="${file.name}">
                    <i class="fas fa-trash text-sm"></i>
                </button>
            `;
            item.querySelector('button').addEventListener('click', async () => {
                if (!confirm(`Remove ${file.name}?`)) return;
                await this.uploader.deleteFile(file.name);
                this.updateStatuses();
            });
            list.appendChild(item);
        });
        this.updateStatuses();
    }

    updateQualitySummary(report) {
        const scoreDisplay = document.getElementById('qualityScoreDisplay');
        const countDisplay = document.getElementById('documentCountDisplay');
        const recommendationsList = document.getElementById('qualityRecommendations');

        if (!scoreDisplay || !countDisplay || !recommendationsList) return;

        if (!report) {
            scoreDisplay.textContent = '-';
            countDisplay.textContent = this.uploadedFiles.length;
            recommendationsList.innerHTML = `
                <li class="flex items-start"><i class="fas fa-circle text-xs primary-text mr-2 mt-1"></i><span>Add quick-start guides and common troubleshooting steps.</span></li>
                <li class="flex items-start"><i class="fas fa-circle text-xs primary-text mr-2 mt-1"></i><span>Include escalation policies and contact info for human support.</span></li>
                <li class="flex items-start"><i class="fas fa-circle text-xs primary-text mr-2 mt-1"></i><span>Review knowledge articles regularly to stay accurate.</span></li>
            `;
            return;
        }

        scoreDisplay.textContent = `${report.qualityScore}%`;
        countDisplay.textContent = this.uploadedFiles.length;

        if (report.recommendations?.length) {
            recommendationsList.innerHTML = report.recommendations.slice(0, 3).map(rec => `
                <li class="flex items-start"><i class="fas fa-circle text-xs primary-text mr-2 mt-1"></i><span>${rec.message}</span></li>
            `).join('');
        }
    }

    updateStatuses() {
        document.getElementById('filesStatus').textContent = `${this.uploadedFiles.length} files`;
        const toneSelect = document.getElementById('supportResponseStyle');
        if (toneSelect) {
            this.updateToneStatus(toneSelect.value);
        }
    }

    async handleFileSelection(files) {
        const validFiles = files.filter(file => {
            const validTypes = ['.pdf', '.docx', '.txt', '.csv', '.html'];
            const extension = '.' + file.name.split('.').pop().toLowerCase();
            const validSize = file.size <= 10 * 1024 * 1024; // 10MB
            
            if (!validTypes.includes(extension)) {
                this.showNotification(`${file.name}: Invalid file type`, 'error');
                return false;
            }
            
            if (!validSize) {
                this.showNotification(`${file.name}: File too large (max 10MB)`, 'error');
                return false;
            }
            
            return true;
        });

        if (validFiles.length > 0) {
            await this.uploadFiles(validFiles);
        }
    }

    async uploadFiles(files) {
        this.showUploadModal(files);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const result = await SMEAIUtils.uploadFile(file, 'support');
                if (result.success) {
                    this.uploadedFiles.push({
                        name: file.name,
                        path: result.path,
                        size: result.size,
                        uploadDate: new Date().toISOString()
                    });
                    this.updateUploadProgress(file.name, 100, 'completed');
                    this.displayUploadedFile(file.name, result);
                } else {
                    this.updateUploadProgress(file.name, 0, 'error');
                }
            } catch (error) {
                this.updateUploadProgress(file.name, 0, 'error');
                console.error('Upload error:', error);
            }
        }

        setTimeout(() => this.hideUploadModal(), 2000);
    }

    showUploadModal(files) {
        const modal = document.getElementById('uploadModal');
        const progressContainer = document.getElementById('uploadProgress');
        
        progressContainer.innerHTML = '';
        
        files.forEach(file => {
            const progressItem = document.createElement('div');
            progressItem.className = 'space-y-2';
            progressItem.innerHTML = `
                <div class="flex items-center justify-between text-sm">
                    <span class="text-white">${file.name}</span>
                    <span class="text-gray-400" id="progress-${file.name.replace(/[^a-zA-Z0-9]/g, '')}">0%</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-2">
                    <div class="bg-green-500 h-2 rounded-full transition-all duration-300" 
                         id="bar-${file.name.replace(/[^a-zA-Z0-9]/g, '')}" style="width: 0%"></div>
                </div>
            `;
            progressContainer.appendChild(progressItem);
        });

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    updateUploadProgress(fileName, percentage, status) {
        const cleanName = fileName.replace(/[^a-zA-Z0-9]/g, '');
        const progressText = document.getElementById(`progress-${cleanName}`);
        const progressBar = document.getElementById(`bar-${cleanName}`);
        
        if (progressText && progressBar) {
            if (status === 'completed') {
                progressText.textContent = 'Completed';
                progressText.className = 'text-green-400';
                progressBar.className = 'bg-green-500 h-2 rounded-full transition-all duration-300';
                progressBar.style.width = '100%';
            } else if (status === 'error') {
                progressText.textContent = 'Error';
                progressText.className = 'text-red-400';
                progressBar.className = 'bg-red-500 h-2 rounded-full transition-all duration-300';
            } else {
                progressText.textContent = `${percentage}%`;
                progressBar.style.width = `${percentage}%`;
            }
        }
    }

    hideUploadModal() {
        const modal = document.getElementById('uploadModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    displayUploadedFile(fileName, result) {
        const filesList = document.getElementById('supportFilesList');
        
        const fileItem = document.createElement('div');
        fileItem.className = 'bg-white/5 rounded-lg p-3 flex items-center justify-between';
        fileItem.innerHTML = `
            <div class="flex items-center space-x-3">
                <i class="fas fa-file-alt text-green-400"></i>
                <div>
                    <div class="text-white font-medium text-sm">${fileName}</div>
                    <div class="text-gray-400 text-xs">${this.formatFileSize(result.size)} • Uploaded just now</div>
                </div>
            </div>
            <button onclick="supportAI.removeFile('${result.path}')" class="text-red-400 hover:text-red-300 transition">
                <i class="fas fa-trash text-sm"></i>
            </button>
        `;
        
        filesList.appendChild(fileItem);
    }

    removeFile(filePath) {
        this.uploadedFiles = this.uploadedFiles.filter(file => file.path !== filePath);
        this.renderFilesList();
        this.showNotification('File removed successfully', 'success');
    }

    renderFilesList() {
        const filesList = document.getElementById('supportFilesList');
        filesList.innerHTML = '';
        
        this.uploadedFiles.forEach(file => {
            this.displayUploadedFile(file.name, file);
        });
    }

    async handleConfigSave(e) {
        e.preventDefault();
        
        this.updateSupportCategories();
        const formData = this.getFormData();
        const validation = this.validateConfiguration(formData);
        
        if (!validation.isValid) {
            this.showNotification(validation.errors.join(', '), 'error');
            return;
        }

        try {
            if (this.currentConfig) {
                await this.updateConfiguration(formData);
            } else {
                await this.createConfiguration(formData);
            }
            
            this.showNotification('Support AI configuration saved successfully!', 'success');
            this.generateAILink();
            
        } catch (error) {
            console.error('Save error:', error);
            this.showNotification('Error saving configuration', 'error');
        }
    }

    getFormData() {
        const autoEscalateCheckbox = document.getElementById('autoEscalate');
        const escalationEmail = document.getElementById('escalationEmail');
        const businessFrom = document.getElementById('businessHoursFrom');
        const businessTo = document.getElementById('businessHoursTo');

        const escalationRules = {
            autoEscalate: autoEscalateCheckbox ? autoEscalateCheckbox.checked : false,
            escalationContact: escalationEmail ? escalationEmail.value.trim() : '',
            businessHours: {
                from: businessFrom ? businessFrom.value : '',
                to: businessTo ? businessTo.value : ''
            }
        };

        const toneSelect = document.getElementById('supportResponseStyle');
        const responseStyle = toneSelect ? toneSelect.value : 'helpful';

        return {
            categories: this.supportCategories,
            escalationRules: escalationRules,
            responseStyle,
            primaryLanguage: document.getElementById('primaryLanguage').value,
            customInstructions: document.getElementById('customInstructions').value.trim(),
            collectFeedback: document.getElementById('collectFeedback').checked,
            saveTranscripts: document.getElementById('saveTranscripts').checked,
            multiLanguage: document.getElementById('multiLanguage').checked,
            knowledgeBase: this.uploadedFiles
        };
    }

    validateConfiguration(data) {
        const errors = [];
        
        if (data.categories.length === 0) {
            errors.push('At least one support category is required');
        }
        
        if (this.uploadedFiles.length === 0) {
            errors.push('Please upload at least one knowledge base file');
        }
        
        if (!data.escalationRules.escalationContact) {
            errors.push('Escalation contact email is required');
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    async createConfiguration(formData) {
        const configData = {
            company_id: this.currentUser.id,
            product_info_file: JSON.stringify(formData.knowledgeBase),
            custom_prompt: formData.customInstructions,
            ai_link: '',
            usage_count: 0,
            last_used: null,
            status: 'active',
            support_categories: JSON.stringify(formData.categories),
            escalation_rules: JSON.stringify(formData.escalationRules),
            response_style: formData.responseStyle,
            primary_language: formData.primaryLanguage,
            collect_feedback: formData.collectFeedback,
            save_transcripts: formData.saveTranscripts,
            multi_language: formData.multiLanguage
        };

        const response = await fetch('/api/support-ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(configData)
        });

        if (!response.ok) {
            throw new Error('Failed to create configuration');
        }

        this.currentConfig = await response.json();
        return this.currentConfig;
    }

    async updateConfiguration(formData) {
        const updateData = {
            product_info_file: JSON.stringify(formData.knowledgeBase),
            custom_prompt: formData.customInstructions,
            support_categories: JSON.stringify(formData.categories),
            escalation_rules: JSON.stringify(formData.escalationRules),
            response_style: formData.responseStyle,
            primary_language: formData.primaryLanguage,
            collect_feedback: formData.collectFeedback,
            save_transcripts: formData.saveTranscripts,
            multi_language: formData.multiLanguage
        };

        const response = await fetch(`/api/support-ai/${encodeURIComponent(this.currentConfig.id)}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            throw new Error('Failed to update configuration');
        }

        this.currentConfig = await response.json();
        return this.currentConfig;
    }

    generateAILink() {
        if (this.uploadedFiles.length === 0) {
            this.showNotification('Upload at least one knowledge base document before generating a link.', 'error');
            return;
        }
        const tenantId = platform.getTenantId();
        const params = new URLSearchParams({ tenant: tenantId, type: 'support', config: 'preview' });
        const link = `${window.location.origin}/component-preview.html?${params.toString()}`;
        document.getElementById('supportAILink').value = link;
        this.showNotification('Support AI link generated!', 'success');
    }

    async updateAILink(link) {
        try {
            await fetch(`/api/support-ai/${encodeURIComponent(this.currentConfig.id)}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ai_link: link })
            });
        } catch (error) {
            console.error('Error updating AI link:', error);
        }
    }

    copyAILink() {
        const linkInput = document.getElementById('supportAILink');
        if (!linkInput.value) {
            this.showNotification('Generate a link first.', 'error');
            return;
        }
        linkInput.select();
        document.execCommand('copy');
        this.showNotification('Link copied to clipboard!', 'success');
    }

    testAILink() {
        const link = document.getElementById('supportAILink').value;
        if (!link) {
            this.showNotification('Generate a link first.', 'error');
            return;
        }
        window.open(link, '_blank');
    }

    showPreview() {
        const formData = this.getFormData();
        
        if (formData.categories.length === 0) {
            this.showNotification('Please add at least one support category to preview', 'error');
            return;
        }

        const modal = document.getElementById('previewModal');
        const content = document.getElementById('previewContent');
        
        content.innerHTML = `
            <div class="space-y-4">
                <!-- Chat Interface Preview -->
                <div class="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <div class="space-y-4">
                        <!-- AI Welcome Message -->
                        <div class="flex items-start space-x-3">
                            <div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-headset text-white text-sm"></i>
                            </div>
                            <div class="bg-gray-700 rounded-lg rounded-tl-none p-3 flex-1">
                                <div class="text-white text-sm">
                                    ${this.generateWelcomeMessage(formData)}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Sample Customer Message -->
                        <div class="flex items-start space-x-3 justify-end">
                            <div class="bg-blue-600 rounded-lg rounded-tr-none p-3 max-w-xs">
                                <div class="text-white text-sm">
                                    I'm having trouble with my order. It was supposed to arrive yesterday but I haven't received it yet.
                                </div>
                            </div>
                            <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-user text-white text-sm"></i>
                            </div>
                        </div>
                        
                        <!-- AI Response -->
                        <div class="flex items-start space-x-3">
                            <div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-headset text-white text-sm"></i>
                            </div>
                            <div class="bg-gray-700 rounded-lg rounded-tl-none p-3 flex-1">
                                <div class="text-white text-sm">
                                    ${this.generateSampleResponse(formData)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Configuration Summary -->
                <div class="border-t border-gray-600 pt-4">
                    <h4 class="text-white font-semibold mb-4">Configuration Overview:</h4>
                    <div class="grid md:grid-cols-2 gap-6">
                        <div>
                            <h5 class="text-green-400 font-medium mb-2">Support Categories (${formData.categories.length})</h5>
                            <ul class="text-sm text-gray-300 space-y-1">
                                ${formData.categories.map(cat => `<li><i class="fas fa-tag text-green-400 mr-2"></i>${cat.name}</li>`).join('')}
                            </ul>
                        </div>
                        <div>
                            <h5 class="text-green-400 font-medium mb-2">Settings</h5>
                            <div class="text-sm text-gray-300 space-y-1">
                                <div><span class="text-gray-400">Style:</span> ${formData.responseStyle}</div>
                                <div><span class="text-gray-400">Language:</span> ${formData.primaryLanguage}</div>
                                <div><span class="text-gray-400">Files:</span> ${this.uploadedFiles.length} uploaded</div>
                                <div><span class="text-gray-400">Feedback:</span> ${formData.collectFeedback ? 'Enabled' : 'Disabled'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    generateWelcomeMessage(formData) {
        const styleMessages = {
            helpful: "Hello! I'm here to help you with any questions or issues you might have. How can I assist you today?",
            empathetic: "Hi there! I understand that reaching out for support can sometimes be frustrating. I'm here to help make things easier for you. What can I help you with?",
            professional: "Welcome to our support system. I'm ready to assist you with your inquiry. Please describe your issue or question.",
            friendly: "Hey! Great to see you here! I'm your friendly support assistant, and I'm excited to help you out. What's on your mind?"
        };
        
        return styleMessages[formData.responseStyle] || styleMessages.helpful;
    }

    generateSampleResponse(formData) {
        const styleResponses = {
            helpful: "I'm sorry to hear about the delay with your order! Let me help you track down what happened. Could you please provide me with your order number? I'll check the shipping status right away and see what we can do to resolve this for you.",
            empathetic: "I completely understand how frustrating it must be to wait for an order that hasn't arrived on time. That's definitely not the experience we want for our customers. Let me personally look into this for you. If you could share your order number, I'll investigate what happened with the shipping.",
            professional: "I apologize for the delivery delay. To investigate this issue, I'll need your order number to check the shipping status and tracking information. Once I have that, I can provide you with an update and next steps for resolution.",
            friendly: "Oh no! That's definitely not cool when your order doesn't show up when expected. Don't worry though - we'll get this sorted out! Just share your order number with me and I'll dive right in to see what's going on with the delivery."
        };
        
        return styleResponses[formData.responseStyle] || styleResponses.helpful;
    }

    closePreview() {
        const modal = document.getElementById('previewModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    async loadExistingConfiguration() {
        try {
            const response = await fetch(`/api/support-ai?companyId=${encodeURIComponent(this.currentUser.id)}`);
            if (!response.ok) {
                throw new Error('Failed to load Support AI configuration');
            }
            const data = await response.json();
            const records = Array.isArray(data?.data) ? data.data : [];
            if (records.length > 0) {
                this.currentConfig = records[0];
                this.populateFormWithConfig(this.currentConfig);
                this.generateAILink();
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    populateFormWithConfig(config) {
        this.uploadedFiles = [];
        if (config.product_info_file) {
            try {
                const parsed = JSON.parse(config.product_info_file);
                if (Array.isArray(parsed)) {
                    this.uploadedFiles = parsed;
                }
            } catch (error) {
                console.warn('Failed to parse knowledge base files', error);
            }
        }
        if (config.response_style) {
            const toneSelect = document.getElementById('supportResponseStyle');
            if (toneSelect) {
                toneSelect.value = config.response_style;
                this.updateToneStatus(config.response_style);
            }
        }
        this.updateStatuses();
        this.generateAILink();
    }

    loadSupportCategories(categories) {
        const container = document.getElementById('supportCategories');
        container.innerHTML = ''; // Clear existing
        
        categories.forEach(category => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'category-item bg-white/5 rounded-lg p-4 border border-white/10';
            categoryDiv.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <input type="text" value="${category.name}" 
                        class="bg-transparent text-white font-medium text-lg border-none outline-none flex-1">
                    <button class="text-red-400 hover:text-red-300">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
                <textarea rows="2" class="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder-gray-400 text-sm resize-none">${category.description}</textarea>
            `;
            container.appendChild(categoryDiv);
        });
    }

    loadEscalationRules(rules) {
        if (rules.escalationContact) {
            document.querySelector('input[type="email"]').value = rules.escalationContact;
        }
        
        if (rules.businessHours) {
            const timeInputs = document.querySelectorAll('input[type="time"]');
            if (timeInputs.length >= 2) {
                timeInputs[0].value = rules.businessHours.from || '09:00';
                timeInputs[1].value = rules.businessHours.to || '17:00';
            }
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showNotification(message, type = 'info') {
        if (window.platform && window.platform.showNotification) {
            window.platform.showNotification(message, type);
        } else {
            alert(message);
        }
    }
}

// Initialize Support AI Manager
const supportAI = new SupportAIManager();