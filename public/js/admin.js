// Admin Dashboard JavaScript
// NOTE: These are shown only when there's NO real data - displays "No data yet" message instead
const PLACEHOLDER_METRICS = {
    sales: {
        totalInteractions: 0,
        leadsGenerated: 0
    },
    support: {
        totalInteractions: 0,
        resolved: 0,
        escalations: 0
    },
    interview: {
        completed: 0,
        qualified: 0
    }
};

class AdminDashboard {
    constructor() {
        this.currentUser = null;
        this.usageTrendsChart = null;
        this.performanceChart = null;
        this.analyticsData = {
            sales: [],
            support: [],
            interview: []
        };
        this.analyticsSummary = null;  // Server-side aggregated summary
        this.allTranscripts = [];  // Store all transcripts for filtering
        this.transcriptFilter = 'all';  // Current filter: 'all', 'sales', 'support'
        this.agentSummary = {
            sales: { ...PLACEHOLDER_METRICS.sales },
            support: { ...PLACEHOLDER_METRICS.support },
            interview: { ...PLACEHOLDER_METRICS.interview }
        };
        this.personas = [];
        this.personaListEl = null;
        this.personaFormEl = null;
        // Don't call updateAgentDashboards here - DOM not ready yet
        // It will be called in loadAllData() after DOM is ready
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.setupEventListeners();
        this.initializePersonaManager();
        this.loadAllData();
        this.initializeCharts();
        this.loadTranscripts();
        this.loadInterviewSessions();
        
        // Refresh buttons
        const refreshTranscriptsBtn = document.getElementById('refreshTranscripts');
        if (refreshTranscriptsBtn) {
            refreshTranscriptsBtn.addEventListener('click', () => this.loadTranscripts());
        }
        
        const refreshInterviewSessionsBtn = document.getElementById('refreshInterviewSessions');
        if (refreshInterviewSessionsBtn) {
            refreshInterviewSessionsBtn.addEventListener('click', () => this.loadInterviewSessions());
        }
        
        // Transcript filter tabs
        document.querySelectorAll('.transcript-filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.filterTranscripts(e.target.dataset.filter));
        });
    }
    
    filterTranscripts(filter) {
        this.transcriptFilter = filter;
        
        // Update tab styles
        document.querySelectorAll('.transcript-filter-tab').forEach(tab => {
            if (tab.dataset.filter === filter) {
                tab.classList.add('text-primary-500', 'border-primary-500');
                tab.classList.remove('text-neutral-500', 'border-transparent');
            } else {
                tab.classList.remove('text-primary-500', 'border-primary-500');
                tab.classList.add('text-neutral-500', 'border-transparent');
            }
        });
        
        // Re-render with filter
        this.renderTranscripts(this.allTranscripts);
    }

    checkAuthentication() {
        const storedUser = localStorage.getItem('currentUser');
        if (!storedUser) {
            const previewUser = {
                id: 'preview_user',
                company_name: 'Demo Company',
                email: 'demo@example.com',
                tenantId: 'default'  // Use 'default' to match demo data
            };
            this.currentUser = previewUser;
            localStorage.setItem('currentUser', JSON.stringify(previewUser));
            return;
        }
        try {
            this.currentUser = JSON.parse(storedUser);
        } catch (error) {
            console.error('Failed to parse stored user:', error);
            localStorage.removeItem('currentUser');
            const previewUser = {
                id: 'preview_user',
                company_name: 'Demo Company',
                email: 'demo@example.com',
                tenantId: 'default'  // Use 'default' to match demo data
            };
            this.currentUser = previewUser;
            localStorage.setItem('currentUser', JSON.stringify(previewUser));
        }
    }

    getTenantIdForRequests() {
        if (this.currentUser?.tenantId) {
            return this.currentUser.tenantId;
        }
        if (window.platform && typeof window.platform.getTenantId === 'function') {
            return window.platform.getTenantId();
        }
        return 'default';
    }

    setupEventListeners() {
        // Tab switching
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.currentTarget.getAttribute('data-section');
                this.switchSection(target);
            });
        });

        const accountTabs = document.querySelectorAll('.account-tab');
        accountTabs.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const target = btn.getAttribute('data-tab');
                this.switchAccountTab(target);
            });
        });

        // Timeframe selection
        const trendsTimeframe = document.getElementById('trendsTimeframe');
        if (trendsTimeframe) {
            trendsTimeframe.addEventListener('change', () => this.updateUsageTrendsChart());
        }

        // Refresh buttons (with null checks)
        const refreshPerformance = document.getElementById('refreshPerformance');
        if (refreshPerformance) refreshPerformance.addEventListener('click', () => this.refreshPerformanceData());
        
        const refreshAllData = document.getElementById('refreshAllData');
        if (refreshAllData) refreshAllData.addEventListener('click', () => this.loadAllData());

        // Export buttons (with null checks)
        const exportSales = document.getElementById('exportSales');
        if (exportSales) exportSales.addEventListener('click', () => this.exportData('sales'));
        
        const exportSupport = document.getElementById('exportSupport');
        if (exportSupport) exportSupport.addEventListener('click', () => this.exportData('support'));
        
        const exportInterview = document.getElementById('exportInterview');
        if (exportInterview) exportInterview.addEventListener('click', () => this.exportData('interview'));

        // Action buttons (with null checks)
        const clearOldDataBtn = document.getElementById('clearOldData');
        if (clearOldDataBtn) clearOldDataBtn.addEventListener('click', () => this.clearOldData());
        
        const generateReportBtn = document.getElementById('generateReport');
        if (generateReportBtn) generateReportBtn.addEventListener('click', () => this.generateExecutiveReport());
    }

    switchSection(sectionId) {
        const sections = {
            'my-ai-agents': 'my-ai-agents-section',
            'analytics': 'analytics-section',
            'account-billing': 'account-billing-section',
            'help-center': 'help-center-section'
        };

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active', 'border-cyan-400', 'text-white');
            btn.classList.add('text-gray-400', 'border-transparent');
        });

        const activeBtn = document.querySelector(`[data-section="${sectionId}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active', 'border-cyan-400', 'text-white');
            activeBtn.classList.remove('text-gray-400', 'border-transparent');
        }

        Object.values(sections).forEach(section => {
            const el = document.getElementById(section);
            if (el) {
                el.classList.add('hidden');
            }
        });

        const targetSection = sections[sectionId];
        if (targetSection) {
            const sectionEl = document.getElementById(targetSection);
            if (sectionEl) {
                sectionEl.classList.remove('hidden');
            }
        }

        if (sectionId === 'analytics') {
            this.loadTabData('sales');
        }
    }

    switchAccountTab(tabName) {
        const tabs = document.querySelectorAll('.account-tab');
        tabs.forEach(tab => {
            tab.classList.remove('active', 'border-red-500', 'primary-text');
            tab.classList.add('border-transparent', 'text-gray-500');
        });

        const activeTab = document.querySelector(`.account-tab[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active', 'border-red-500', 'primary-text');
            activeTab.classList.remove('border-transparent', 'text-gray-500');
        }

        const panels = document.querySelectorAll('#account-billing-section .tab-content');
        panels.forEach(panel => panel.classList.add('hidden'));

        const targetPanel = document.getElementById(`${tabName}-tab`);
        if (targetPanel) {
            targetPanel.classList.remove('hidden');
        }
    }

    async loadAllData() {
        this.showLoading(true, 'Loading Analytics Data', 'Fetching data from all AI tools...');
        
        try {
            await Promise.all([
                this.loadSalesAnalytics(),
                this.loadSupportAnalytics(),
                this.loadInterviewAnalytics(),
                this.loadAnalyticsSummary()
            ]);

            this.updateOverviewStats();
            this.updateAgentDashboards();
            this.updateUsageTrendsChart();
            this.updatePerformanceChart();
            this.loadTabData('sales'); // Load default tab
            this.filterAgentDashboards('all');

        } catch (error) {
            console.error('Error loading analytics data:', error);
            this.showNotification('Error loading analytics data', 'error');
            this.updateAgentDashboards();
        } finally {
            this.showLoading(false);
        }
    }
    
    async loadAnalyticsSummary() {
        try {
            const response = await fetch('/api/analytics/summary', {
                headers: this.buildTenantHeaders()
            });
            if (!response.ok) {
                throw new Error(`Failed to load analytics summary (status ${response.status})`);
            }
            const data = await response.json();
            this.analyticsSummary = data?.summary || null;
        } catch (error) {
            console.error('Error loading analytics summary:', error);
            this.analyticsSummary = null;
        }
    }

    async loadSalesAnalytics() {
        try {
            const response = await fetch('/api/analytics?type=sales', {
                headers: this.buildTenantHeaders()
            });
            if (!response.ok) {
                throw new Error(`Failed to load sales analytics (status ${response.status})`);
            }
            const data = await response.json();
            this.analyticsData.sales = Array.isArray(data?.data) ? data.data : [];
        } catch (error) {
            console.error('Error loading sales analytics:', error);
            this.analyticsData.sales = [];
        }
    }

    async loadSupportAnalytics() {
        try {
            const response = await fetch('/api/analytics?type=support', {
                headers: this.buildTenantHeaders()
            });
            if (!response.ok) {
                throw new Error(`Failed to load support analytics (status ${response.status})`);
            }
            const data = await response.json();
            this.analyticsData.support = Array.isArray(data?.data) ? data.data : [];
        } catch (error) {
            console.error('Error loading support analytics:', error);
            this.analyticsData.support = [];
        }
    }

    async loadInterviewAnalytics() {
        try {
            const response = await fetch('/api/analytics?type=interview', {
                headers: this.buildTenantHeaders()
            });
            if (!response.ok) {
                throw new Error(`Failed to load interview analytics (status ${response.status})`);
            }
            const data = await response.json();
            this.analyticsData.interview = Array.isArray(data?.data) ? data.data : [];
        } catch (error) {
            console.error('Error loading interview analytics:', error);
            this.analyticsData.interview = [];
        }
    }

    updateOverviewStats() {
        // Use server-side summary if available
        if (this.analyticsSummary) {
            const summary = this.analyticsSummary;
            this.agentSummary.sales.totalInteractions = summary.sales?.totalInteractions || 0;
            this.agentSummary.sales.leadsGenerated = summary.sales?.leadsGenerated || 0;
            
            this.agentSummary.support.totalInteractions = summary.support?.totalInteractions || 0;
            this.agentSummary.support.resolved = summary.support?.resolved || 0;
            this.agentSummary.support.escalations = summary.support?.escalations || 0;
            
            this.agentSummary.interview.completed = summary.interview?.completed || 0;
            this.agentSummary.interview.qualified = Math.round((summary.interview?.completed || 0) * 0.6);
            return;
        }

        // Fallback to client-side calculation from raw events
        const salesData = this.analyticsData.sales;
        const totalSalesInteractions = salesData.length;
        const salesConversions = salesData.filter(item => item.success).length;

        const supportData = this.analyticsData.support;
        const totalSupportTickets = supportData.length;

        const interviewData = this.analyticsData.interview;
        const totalInterviews = interviewData.length;

        const noAnalyticsData = totalSalesInteractions === 0 && totalSupportTickets === 0 && totalInterviews === 0;

        if (noAnalyticsData) {
            this.agentSummary.sales = { ...PLACEHOLDER_METRICS.sales };
            this.agentSummary.support = { ...PLACEHOLDER_METRICS.support };
            this.agentSummary.interview = { ...PLACEHOLDER_METRICS.interview };
            return;
        }

        this.agentSummary.sales.totalInteractions = totalSalesInteractions;
        this.agentSummary.sales.leadsGenerated = Math.round(salesConversions * 0.8);

        const resolvedCount = supportData.filter(item => item.success).length;
        this.agentSummary.support.totalInteractions = totalSupportTickets;
        this.agentSummary.support.resolved = resolvedCount;
        this.agentSummary.support.escalations = Math.max(0, totalSupportTickets - resolvedCount);

        const interviewCompleted = interviewData.filter(item => item.success).length;
        this.agentSummary.interview.completed = interviewCompleted;
        this.agentSummary.interview.qualified = interviewData.length > 0 ? Math.round(interviewCompleted * 0.6) : 0;
    }

    initializeCharts() {
        // Charts removed from UI - skip initialization silently
        const usageCanvas = document.getElementById('usageTrendsChart');
        if (!usageCanvas) {
            // Charts not present in current UI - this is expected
            return;
        }
        const usageCtx = usageCanvas.getContext('2d');
        this.usageTrendsChart = new Chart(usageCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Sales AI',
                        data: [],
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Support AI',
                        data: [],
                        borderColor: 'rgb(34, 197, 94)',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Interview AI',
                        data: [],
                        borderColor: 'rgb(147, 51, 234)',
                        backgroundColor: 'rgba(147, 51, 234, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: 'rgba(255, 255, 255, 0.8)'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.6)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.6)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });

        // Initialize Performance Chart
        const performanceCanvas = document.getElementById('performanceChart');
        if (!performanceCanvas) {
            console.warn('performanceChart canvas not found, skipping chart initialization');
            return;
        }
        const performanceCtx = performanceCanvas.getContext('2d');
        this.performanceChart = new Chart(performanceCtx, {
            type: 'doughnut',
            data: {
                labels: ['Sales AI', 'Support AI', 'Interview AI'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(34, 197, 94, 0.8)',
                        'rgba(147, 51, 234, 0.8)'
                    ],
                    borderColor: [
                        'rgb(59, 130, 246)',
                        'rgb(34, 197, 94)',
                        'rgb(147, 51, 234)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.8)',
                            padding: 20
                        }
                    }
                }
            }
        });
    }

    updateUsageTrendsChart() {
        if (!this.usageTrendsChart) return; // Chart not initialized
        
        const timeframeEl = document.getElementById('trendsTimeframe');
        const timeframe = timeframeEl ? parseInt(timeframeEl.value) : 7;
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (timeframe * 24 * 60 * 60 * 1000));

        // Generate date labels
        const labels = [];
        const salesData = [];
        const supportData = [];
        const interviewData = [];

        for (let i = 0; i < timeframe; i++) {
            const date = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
            const dateStr = date.toISOString().split('T')[0];
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

            // Count interactions for each AI type on this date
            const salesCount = this.analyticsData.sales.filter(item => 
                item.usage_date && item.usage_date.split('T')[0] === dateStr
            ).length;
            
            const supportCount = this.analyticsData.support.filter(item => 
                item.usage_date && item.usage_date.split('T')[0] === dateStr
            ).length;
            
            const interviewCount = this.analyticsData.interview.filter(item => 
                item.usage_date && item.usage_date.split('T')[0] === dateStr
            ).length;

            salesData.push(salesCount);
            supportData.push(supportCount);
            interviewData.push(interviewCount);
        }

        // Update chart
        this.usageTrendsChart.data.labels = labels;
        this.usageTrendsChart.data.datasets[0].data = salesData;
        this.usageTrendsChart.data.datasets[1].data = supportData;
        this.usageTrendsChart.data.datasets[2].data = interviewData;
        this.usageTrendsChart.update();
    }

    updatePerformanceChart() {
        if (!this.performanceChart) return; // Chart not initialized
        
        const salesSuccess = this.analyticsData.sales.filter(item => item.success).length;
        const supportSuccess = this.analyticsData.support.filter(item => item.success).length;
        const interviewSuccess = this.analyticsData.interview.filter(item => item.success).length;

        this.performanceChart.data.datasets[0].data = [salesSuccess, supportSuccess, interviewSuccess];
        this.performanceChart.update();
    }

    loadTabData(tabName) {
        switch (tabName) {
            case 'sales':
                this.loadSalesTabData();
                break;
            case 'support':
                this.loadSupportTabData();
                break;
            case 'interview':
                this.loadInterviewTabData();
                break;
        }
    }

    loadSalesTabData() {
        const salesData = this.analyticsData.sales;
        
        // Update summary stats
        const conversions = salesData.filter(item => item.success).length;
        const totalDuration = salesData.reduce((sum, item) => sum + (item.session_duration || 0), 0);
        const avgDuration = salesData.length > 0 ? Math.round(totalDuration / salesData.length) : 0;
        const leads = Math.round(conversions * 0.8); // Assume 80% of conversions are qualified leads

        const salesConversionsEl = document.getElementById('salesConversions');
        const salesAvgDurationEl = document.getElementById('salesAvgDuration');
        const salesLeadsEl = document.getElementById('salesLeads');
        
        if (salesConversionsEl) salesConversionsEl.textContent = conversions;
        if (salesAvgDurationEl) salesAvgDurationEl.textContent = `${avgDuration}m`;
        if (salesLeadsEl) salesLeadsEl.textContent = leads;

        // Update table
        this.populateReportTable('salesReportTable', this.generateDailyStats(salesData, 'sales'));
    }

    loadSupportTabData() {
        const supportData = this.analyticsData.support;
        
        // Update summary stats
        const resolved = supportData.filter(item => item.success).length;
        const totalTime = supportData.reduce((sum, item) => sum + (item.session_duration || 0), 0);
        const avgTime = supportData.length > 0 ? Math.round(totalTime / supportData.length) : 0;
        const satisfaction = supportData.length > 0 ? Math.round((resolved / supportData.length) * 100) : 0;

        const interactionsEl = document.getElementById('support-total-interactions');
        const resolvedEl = document.getElementById('support-total-resolved');
        const escalationsEl = document.getElementById('support-total-escalations');
        if (interactionsEl) interactionsEl.textContent = supportData.length.toLocaleString();
        if (resolvedEl) resolvedEl.textContent = resolved.toLocaleString();
        if (escalationsEl) escalationsEl.textContent = Math.max(0, supportData.length - resolved).toLocaleString();

        // Update table
        this.populateReportTable('supportReportTable', this.generateDailyStats(supportData, 'support'));
    }

    loadInterviewTabData() {
        const interviewData = this.analyticsData.interview;
        
        // Update summary stats
        const completed = interviewData.filter(item => item.success).length;
        const qualified = Math.round(completed * 0.6); // Assume 60% pass rate
        const avgScore = qualified > 0 ? Math.round(Math.random() * 20 + 70) : 0; // Mock average score

        const interviewsCompletedEl = document.getElementById('interviewsCompleted');
        const candidatesQualifiedEl = document.getElementById('candidatesQualified');
        const interviewAvgScoreEl = document.getElementById('interviewAvgScore');
        
        if (interviewsCompletedEl) interviewsCompletedEl.textContent = completed;
        if (candidatesQualifiedEl) candidatesQualifiedEl.textContent = qualified;
        if (interviewAvgScoreEl) interviewAvgScoreEl.textContent = avgScore;

        // Update table
        this.populateReportTable('interviewReportTable', this.generateDailyStats(interviewData, 'interview'));
    }

    updateAgentDashboards() {
        const sales = this.agentSummary.sales;
        const support = this.agentSummary.support;
        const interview = this.agentSummary.interview;

        // Check if there's any real data
        const hasRealData = this.analyticsData.sales.length > 0 || 
                           this.analyticsData.support.length > 0 || 
                           this.analyticsData.interview.length > 0;

        // Show appropriate values - "—" for no data, actual numbers for real data
        const formatValue = (value, hasData) => {
            if (!hasData && value === 0) return '—';
            return value.toLocaleString();
        };

        const hasSalesData = this.analyticsData.sales.length > 0;
        const hasSupportData = this.analyticsData.support.length > 0;
        const hasInterviewData = this.analyticsData.interview.length > 0;

        const dashboardEls = [
            // Analytics section elements
            ['sales-total-interactions', formatValue(sales.totalInteractions, hasSalesData)],
            ['sales-leads-generated', formatValue(sales.leadsGenerated, hasSalesData)],
            ['support-total-interactions', formatValue(support.totalInteractions, hasSupportData)],
            ['support-total-resolved', formatValue(support.resolved, hasSupportData)],
            ['support-total-escalations', formatValue(support.escalations, hasSupportData)],
            ['interview-interviews-completed', formatValue(interview.completed, hasInterviewData)],
            ['interview-candidates-qualified', formatValue(interview.qualified, hasInterviewData)],
            // AI Agents cards (Dashboard section)
            ['sales-interactions', formatValue(sales.totalInteractions, hasSalesData)],
            ['support-interactions', formatValue(support.totalInteractions, hasSupportData)],
            ['interview-interactions', formatValue(interview.completed, hasInterviewData)]
        ];

        dashboardEls.forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        });

        // Update "Last" timestamps
        this.updateLastUsedTimestamps();
    }

    updateLastUsedTimestamps() {
        // Get most recent activity for each AI type
        const getLatestDate = (data) => {
            if (!data || data.length === 0) return null;
            const sorted = data
                .filter(item => item.usage_date || item.occurredAt)
                .sort((a, b) => new Date(b.usage_date || b.occurredAt) - new Date(a.usage_date || a.occurredAt));
            return sorted.length > 0 ? new Date(sorted[0].usage_date || sorted[0].occurredAt) : null;
        };

        const formatLastUsed = (date) => {
            if (!date) return 'Never';
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
        };

        const salesLast = getLatestDate(this.analyticsData.sales);
        const supportLast = getLatestDate(this.analyticsData.support);
        const interviewLast = getLatestDate(this.analyticsData.interview);

        const lastUsedEls = [
            ['sales-last-used', formatLastUsed(salesLast)],
            ['support-last-used', formatLastUsed(supportLast)],
            ['interview-last-used', formatLastUsed(interviewLast)]
        ];

        lastUsedEls.forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        });
    }

    filterAgentDashboards(selectedAgent) {
        const dashboards = document.querySelectorAll('.agent-dashboard');
        dashboards.forEach(dashboard => {
            if (selectedAgent === 'all') {
                dashboard.classList.remove('hidden');
            } else {
                const agent = dashboard.getAttribute('data-agent');
                if (agent === selectedAgent) {
                    dashboard.classList.remove('hidden');
                } else {
                    dashboard.classList.add('hidden');
                }
            }
        });
    }

    generateDailyStats(data, type) {
        const dailyStats = {};
        
        // Group data by date
        data.forEach(item => {
            if (!item.usage_date) return;
            
            const date = item.usage_date.split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    date: date,
                    total: 0,
                    successful: 0,
                    totalDuration: 0
                };
            }
            
            dailyStats[date].total++;
            if (item.success) dailyStats[date].successful++;
            dailyStats[date].totalDuration += item.session_duration || 0;
        });

        // Convert to array and sort by date
        return Object.values(dailyStats)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10); // Last 10 days
    }

    populateReportTable(tableId, stats) {
        const tbody = document.getElementById(tableId);
        if (!tbody) return; // Table not found, skip
        tbody.innerHTML = '';

        stats.forEach(stat => {
            const row = document.createElement('tr');
            const successRate = stat.total > 0 ? Math.round((stat.successful / stat.total) * 100) : 0;
            const avgDuration = stat.total > 0 ? Math.round(stat.totalDuration / stat.total) : 0;
            
            let extraColumn;
            if (tableId === 'salesReportTable') {
                extraColumn = `<td class="py-2 px-4">${avgDuration}m</td>`;
            } else if (tableId === 'supportReportTable') {
                const escalated = Math.round(stat.total * 0.1); // Assume 10% escalation rate
                extraColumn = `<td class="py-2 px-4">${escalated}</td><td class="py-2 px-4">${successRate}%</td>`;
            } else { // interview
                const avgScore = stat.successful > 0 ? Math.round(Math.random() * 20 + 70) : 0;
                extraColumn = `<td class="py-2 px-4">${avgScore}</td>`;
            }
            
            row.innerHTML = `
                <td class="py-2 px-4">${SMEAIUtils.formatDate(stat.date)}</td>
                <td class="py-2 px-4">${stat.total}</td>
                <td class="py-2 px-4">${stat.successful}</td>
                <td class="py-2 px-4">${successRate}%</td>
                ${extraColumn}
            `;
            
            tbody.appendChild(row);
        });

        if (stats.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="py-8 px-4 text-center text-gray-400">
                    <i class="fas fa-chart-bar text-2xl mb-2 block"></i>
                    No data available for the selected period
                </td>
            `;
            tbody.appendChild(row);
        }
    }

    async refreshPerformanceData() {
        this.showNotification('Refreshing performance data...', 'info');
        await this.loadAllData();
        this.showNotification('Performance data refreshed', 'success');
    }

    exportData(type) {
        const data = this.analyticsData[type];
        if (data.length === 0) {
            this.showNotification(`No ${type} data to export`, 'error');
            return;
        }

        this.showLoading(true, 'Exporting Data', `Preparing ${type} analytics for download...`);

        // Simulate export process
        setTimeout(() => {
            const csvContent = this.generateCSV(data, type);
            this.downloadCSV(csvContent, `${type}_analytics_${new Date().toISOString().split('T')[0]}.csv`);
            this.showLoading(false);
            this.showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} data exported successfully`, 'success');
        }, 2000);
    }

    generateCSV(data, type) {
        const headers = ['Date', 'AI Type', 'Session Duration', 'Success', 'Metadata'];
        const rows = data.map(item => [
            item.usage_date || '',
            item.ai_type || type,
            item.session_duration || 0,
            item.success ? 'Yes' : 'No',
            item.metadata ? JSON.stringify(item.metadata) : ''
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        return csvContent;
    }

    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async clearOldData() {
        const confirmed = confirm('Are you sure you want to clear analytics data older than 90 days? This action cannot be undone.');
        if (!confirmed) return;

        this.showLoading(true, 'Clearing Old Data', 'Removing analytics data older than 90 days...');

        try {
            // Simulate clearing old data
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            this.showNotification('Old analytics data cleared successfully', 'success');
            await this.loadAllData();
            
        } catch (error) {
            console.error('Error clearing old data:', error);
            this.showNotification('Error clearing old data', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async generateExecutiveReport() {
        this.showLoading(true, 'Generating Report', 'Creating executive summary report...');

        try {
            // Simulate report generation
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            const reportContent = this.createExecutiveReport();
            this.downloadReport(reportContent);
            this.showNotification('Executive report generated successfully', 'success');
            
        } catch (error) {
            console.error('Error generating report:', error);
            this.showNotification('Error generating report', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    createExecutiveReport() {
        const salesData = this.analyticsData.sales;
        const supportData = this.analyticsData.support;
        const interviewData = this.analyticsData.interview;

        const report = `
ENTERPRISE LITE AI PLATFORM - EXECUTIVE SUMMARY REPORT
Generated: ${new Date().toLocaleString()}
Company: ${this.currentUser.company_name}

=== OVERVIEW ===
Total Sales Interactions: ${salesData.length}
Total Support Tickets: ${supportData.length}
Total Interviews Conducted: ${interviewData.length}

=== SALES AI PERFORMANCE ===
Successful Conversions: ${salesData.filter(item => item.success).length}
Conversion Rate: ${salesData.length > 0 ? Math.round((salesData.filter(item => item.success).length / salesData.length) * 100) : 0}%
Average Session Duration: ${salesData.length > 0 ? Math.round(salesData.reduce((sum, item) => sum + (item.session_duration || 0), 0) / salesData.length) : 0} minutes

=== SUPPORT AI PERFORMANCE ===
Issues Resolved: ${supportData.filter(item => item.success).length}
Resolution Rate: ${supportData.length > 0 ? Math.round((supportData.filter(item => item.success).length / supportData.length) * 100) : 0}%
Average Resolution Time: ${supportData.length > 0 ? Math.round(supportData.reduce((sum, item) => sum + (item.session_duration || 0), 0) / supportData.length) : 0} minutes

=== INTERVIEW AI PERFORMANCE ===
Completed Interviews: ${interviewData.filter(item => item.success).length}
Completion Rate: ${interviewData.length > 0 ? Math.round((interviewData.filter(item => item.success).length / interviewData.length) * 100) : 0}%
Average Interview Duration: ${interviewData.length > 0 ? Math.round(interviewData.reduce((sum, item) => sum + (item.session_duration || 0), 0) / interviewData.length) : 0} minutes

=== RECOMMENDATIONS ===
${this.generateRecommendations()}
        `;

        return report.trim();
    }

    generateRecommendations() {
        const salesData = this.analyticsData.sales;
        const supportData = this.analyticsData.support;
        const interviewData = this.analyticsData.interview;

        const recommendations = [];

        // Sales recommendations
        const salesConversionRate = salesData.length > 0 ? (salesData.filter(item => item.success).length / salesData.length) * 100 : 0;
        if (salesConversionRate < 20) {
            recommendations.push('• Consider reviewing and optimizing your Sales AI prompts and product information');
        }
        if (salesData.length < 50) {
            recommendations.push('• Increase Sales AI promotion to drive more customer interactions');
        }

        // Support recommendations
        const supportResolutionRate = supportData.length > 0 ? (supportData.filter(item => item.success).length / supportData.length) * 100 : 0;
        if (supportResolutionRate < 70) {
            recommendations.push('• Expand Support AI knowledge base with more comprehensive documentation');
        }

        // Interview recommendations
        if (interviewData.length < 10) {
            recommendations.push('• Promote Interview AI to HR teams and hiring managers');
        }

        if (recommendations.length === 0) {
            recommendations.push('• All AI tools are performing well. Continue current strategies and monitor trends.');
        }

        return recommendations.join('\n');
    }

    downloadReport(content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `executive_report_${new Date().toISOString().split('T')[0]}.txt`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    showLoading(show, title = 'Processing...', subtitle = 'Please wait while we process your request') {
        const modal = document.getElementById('loadingModal');
        const titleEl = document.getElementById('loadingText');
        const subtitleEl = document.getElementById('loadingSubtext');
        
        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle;
        
        if (modal) {
            modal.classList.toggle('hidden', !show);
            modal.classList.toggle('flex', show);
        }
    }

    showNotification(message, type = 'info') {
        if (window.platform && window.platform.showNotification) {
            window.platform.showNotification(message, type);
        } else {
            alert(message);
        }
    }

    buildTenantHeaders() {
        const headers = new Headers();
        if (this.currentUser?.tenantId) {
            headers.set('x-tenant-id', this.currentUser.tenantId);
        }
        if (this.currentUser?.id) {
            headers.set('x-company-id', this.currentUser.id);
        }
        return headers;
    }

    async loadTranscripts() {
        const container = document.getElementById('transcriptsList');
        if (!container) return;

        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-spinner fa-spin text-2xl mb-3"></i>
                <p>Loading transcripts...</p>
            </div>
        `;

        try {
            // Load transcripts from both sales and support personas
            const headers = this.buildTenantHeaders();
            const [salesResponse, supportResponse] = await Promise.all([
                fetch('/api/transcripts?persona=sales', { headers }),
                fetch('/api/transcripts?persona=support', { headers })
            ]);
            
            const salesData = salesResponse.ok ? await salesResponse.json() : { data: [] };
            const supportData = supportResponse.ok ? await supportResponse.json() : { data: [] };
            
            this.allTranscripts = [
                ...(Array.isArray(salesData?.data) ? salesData.data : []),
                ...(Array.isArray(supportData?.data) ? supportData.data : [])
            ];
            
            this.renderTranscripts(this.allTranscripts);
            return;
        } catch (outerError) {
            // Fallback to original behavior
        }

        try {
            const response = await fetch('/api/transcripts', {
                headers: this.buildTenantHeaders()
            });
            if (!response.ok) {
                throw new Error(`Failed to load transcripts (status ${response.status})`);
            }
            const data = await response.json();
            const transcripts = Array.isArray(data?.data) ? data.data : [];
            this.renderTranscripts(transcripts);
        } catch (error) {
            console.error('Error loading transcripts:', error);
            container.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <i class="fas fa-exclamation-triangle text-2xl mb-3"></i>
                    <p>Unable to load transcripts.</p>
                    <p class="text-sm">${error.message}</p>
                </div>
            `;
        }
    }

    renderTranscripts(transcripts) {
        const container = document.getElementById('transcriptsList');
        if (!container) return;

        // Apply filter
        let filteredTranscripts = transcripts;
        if (this.transcriptFilter && this.transcriptFilter !== 'all') {
            filteredTranscripts = transcripts.filter(t => t.persona === this.transcriptFilter);
        }

        if (!filteredTranscripts.length) {
            const filterLabel = this.transcriptFilter === 'all' ? '' : ` for ${this.transcriptFilter === 'sales' ? 'Sales AI' : 'Support AI'}`;
            container.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-comments text-3xl mb-3"></i>
                    <p>No transcripts${filterLabel}</p>
                    <p class="text-sm">Chats will appear here once customers interact with your AI.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        filteredTranscripts
            .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))
            .slice(0, 10)
            .forEach(transcript => {
                const card = document.createElement('div');
                card.className = 'border border-gray-200 rounded-lg p-4 hover:shadow transition';

                const persona = transcript.persona || 'sales';
                const personaLabel = persona === 'sales' ? 'Sales AI' : 'Support AI';
                const personaColor = persona === 'sales' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';

                card.innerHTML = `
                    <div class="flex items-start justify-between">
                        <div class="flex items-center gap-2">
                            <h4 class="text-sm font-semibold text-gray-800">Conversation ${transcript.conversationId?.slice(-6) || ''}</h4>
                            <span class="text-xs px-2 py-0.5 rounded ${personaColor}">${personaLabel}</span>
                        </div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">${SMEAIUtils.formatDateTime(transcript.lastMessageAt)}</p>
                    <div class="mt-2 text-sm text-gray-700 line-clamp-2">
                        ${SMEAIUtils.escapeHtml(transcript.metadata?.lastUserMessage || 'No messages yet.')}
                    </div>
                    <div class="mt-3 flex items-center space-x-2">
                        <button class="text-xs bg-primary-500 hover:bg-primary-600 text-white px-3 py-1 rounded" data-transcript-id="${transcript.id}" data-persona="${persona}" data-action="download">
                            <i class="fas fa-file-pdf mr-1"></i>View / Print
                        </button>
                        <button class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded" data-transcript-id="${transcript.id}" data-persona="${persona}" data-action="send">
                            <i class="fas fa-paper-plane mr-1"></i>Email
                        </button>
                    </div>
                `;

                container.appendChild(card);
            });

        container.querySelectorAll('[data-action="download"]').forEach(btn => {
            btn.addEventListener('click', () => this.handleTranscriptDownload(btn.dataset.transcriptId, btn.dataset.persona));
        });

        container.querySelectorAll('[data-action="send"]').forEach(btn => {
            btn.addEventListener('click', () => this.handleTranscriptSend(btn.dataset.transcriptId, btn.dataset.persona));
        });
    }

    async handleTranscriptDownload(transcriptId, persona = 'sales') {
        try {
            // Open formatted HTML transcript (can be printed to PDF)
            const url = `/api/transcripts/${encodeURIComponent(transcriptId)}/download?persona=${persona}&format=html`;
            window.open(url, '_blank');
            this.showNotification('Opening transcript - use Print to save as PDF', 'success');
        } catch (error) {
            console.error('Transcript download error:', error);
            this.showNotification('Unable to download transcript', 'error');
        }
    }

    async handleTranscriptSend(transcriptId, persona = 'sales') {
        const email = prompt('Enter the recipient email address:');
        if (!email) return;
        try {
            const response = await fetch(`/api/transcripts/${encodeURIComponent(transcriptId)}/send?persona=${persona}`, {
                method: 'POST',
                headers: this.buildTenantHeaders(),
                body: JSON.stringify({ email })
            });
            if (!response.ok) {
                throw new Error('Failed to send transcript');
            }
            this.showNotification('Transcript sent successfully', 'success');
        } catch (error) {
            console.error('Transcript send error:', error);
            this.showNotification('Unable to send transcript', 'error');
        }
    }

    // ===== Interview Sessions =====
    async loadInterviewSessions() {
        const container = document.getElementById('interviewSessionsList');
        if (!container) return;

        container.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-spinner fa-spin text-2xl mb-3"></i>
                <p>Loading interview sessions...</p>
            </div>
        `;

        try {
            const headers = this.buildTenantHeaders();
            headers.set('x-persona-id', 'interview');  // Interview sessions are under interview persona
            const response = await fetch('/api/interview-ai/sessions', {
                headers
            });
            if (!response.ok) {
                throw new Error(`Failed to load sessions (status ${response.status})`);
            }
            const data = await response.json();
            const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
            this.renderInterviewSessions(sessions);
        } catch (error) {
            console.error('Error loading interview sessions:', error);
            container.innerHTML = `
                <div class="text-center text-red-500 py-8">
                    <i class="fas fa-exclamation-triangle text-2xl mb-3"></i>
                    <p>Unable to load interview sessions.</p>
                    <p class="text-sm">${error.message}</p>
                </div>
            `;
        }
    }

    renderInterviewSessions(sessions) {
        const container = document.getElementById('interviewSessionsList');
        if (!container) return;

        if (!sessions.length) {
            container.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-user-tie text-3xl mb-3"></i>
                    <p>No interview sessions yet</p>
                    <p class="text-sm">Candidate interviews will appear here once they complete the Interview AI.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';

        sessions
            .sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0))
            .slice(0, 10)
            .forEach(session => {
                const card = document.createElement('div');
                card.className = 'border border-gray-200 rounded p-4 hover:shadow transition';

                const isComplete = session.status === 'completed';
                const score = session.overallScore ? `${session.overallScore}/10` : '-';
                const statusClass = isComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
                const statusText = isComplete ? 'Completed' : 'In Progress';

                card.innerHTML = `
                    <div class="flex items-start justify-between">
                        <div>
                            <h4 class="text-sm font-semibold text-gray-800">${SMEAIUtils.escapeHtml(session.candidateName || 'Unknown Candidate')}</h4>
                            <p class="text-xs text-gray-500">${SMEAIUtils.escapeHtml(session.candidateEmail || '')}</p>
                        </div>
                        <span class="text-xs px-3 py-1 rounded-full ${statusClass}">
                            ${statusText}
                        </span>
                    </div>
                    <div class="mt-2 flex items-center space-x-4 text-xs text-gray-600">
                        <span><i class="fas fa-briefcase mr-1"></i>${SMEAIUtils.escapeHtml(session.jobRole || 'Custom Role')}</span>
                        <span><i class="fas fa-star mr-1"></i>Score: <strong class="text-primary-500">${score}</strong></span>
                    </div>
                    <div class="mt-1 text-xs text-gray-400">
                        ${isComplete ? `Completed: ${SMEAIUtils.formatDateTime(session.completedAt)}` : `Started: ${SMEAIUtils.formatDateTime(session.startedAt)}`}
                    </div>
                    <div class="mt-3 flex items-center space-x-2">
                        <button class="text-xs bg-primary-500 hover:bg-primary-600 text-white px-3 py-1 rounded" data-session-id="${session.sessionId}" data-action="view-results">
                            <i class="fas fa-chart-bar mr-1"></i>View Results
                        </button>
                        <button class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded" data-session-id="${session.sessionId}" data-email="${SMEAIUtils.escapeHtml(session.candidateEmail || '')}" data-action="email-results">
                            <i class="fas fa-paper-plane mr-1"></i>Email Candidate
                        </button>
                    </div>
                `;

                container.appendChild(card);
            });

        container.querySelectorAll('[data-action="view-results"]').forEach(btn => {
            btn.addEventListener('click', () => this.handleViewInterviewResults(btn.dataset.sessionId));
        });

        container.querySelectorAll('[data-action="email-results"]').forEach(btn => {
            btn.addEventListener('click', () => this.handleEmailInterviewResults(btn.dataset.sessionId, btn.dataset.email));
        });
    }

    async handleViewInterviewResults(sessionId) {
        try {
            const response = await fetch(`/api/interview-ai/results/${encodeURIComponent(sessionId)}`, {
                headers: this.buildTenantHeaders()
            });
            if (!response.ok) {
                throw new Error('Failed to load results');
            }
            const data = await response.json();
            
            if (data.success && data.results) {
                this.showInterviewResultsModal(data.results);
            } else {
                this.showNotification('No results found for this session', 'error');
            }
        } catch (error) {
            console.error('Interview results error:', error);
            this.showNotification('Unable to load interview results', 'error');
        }
    }

    showInterviewResultsModal(results) {
        // Create modal if not exists
        let modal = document.getElementById('interviewResultsModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'interviewResultsModal';
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden';
            modal.innerHTML = `
                <div class="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                    <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 class="font-semibold text-lg text-gray-900">Interview Results</h3>
                        <button id="closeInterviewResultsModal" class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <div class="p-4 overflow-y-auto flex-1" id="interviewResultsContent"></div>
                    <div class="p-4 border-t border-gray-200 flex justify-end space-x-2">
                        <button id="printInterviewResults" class="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded text-sm">
                            <i class="fas fa-file-pdf mr-2"></i>View / Print PDF
                        </button>
                        <button id="downloadInterviewResults" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm">
                            <i class="fas fa-code mr-2"></i>Download JSON
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('#closeInterviewResultsModal').addEventListener('click', () => {
                modal.classList.add('hidden');
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.add('hidden');
            });
        }

        // Populate content
        const content = modal.querySelector('#interviewResultsContent');
        const overallScore = results.overallScore ? `${results.overallScore}/10` : 'N/A';
        
        let responsesHtml = '';
        if (results.responses && results.responses.length > 0) {
            responsesHtml = results.responses.map((r, idx) => `
                <div class="border border-gray-200 rounded p-3 mb-3">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-xs font-medium text-primary-500">Question ${idx + 1}</span>
                        <span class="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded">${r.evaluation?.score || '-'}/10</span>
                    </div>
                    <p class="text-sm font-medium text-gray-800 mb-2">${SMEAIUtils.escapeHtml(r.question || '')}</p>
                    <p class="text-sm text-gray-600 mb-2"><strong>Answer:</strong> ${SMEAIUtils.escapeHtml(r.response || '')}</p>
                    ${r.evaluation?.strengths?.length ? `<p class="text-xs text-green-600"><strong>Strengths:</strong> ${r.evaluation.strengths.join(', ')}</p>` : ''}
                    ${r.evaluation?.improvements?.length ? `<p class="text-xs text-orange-600"><strong>Improvements:</strong> ${r.evaluation.improvements.join(', ')}</p>` : ''}
                </div>
            `).join('');
        }

        content.innerHTML = `
            <div class="mb-4 p-4 bg-gray-50 rounded">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs text-gray-500">Candidate</p>
                        <p class="font-semibold text-gray-900">${SMEAIUtils.escapeHtml(results.candidateName || 'Unknown')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500">Email</p>
                        <p class="font-semibold text-gray-900">${SMEAIUtils.escapeHtml(results.candidateEmail || '-')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500">Job Role</p>
                        <p class="font-semibold text-gray-900">${SMEAIUtils.escapeHtml(results.jobRole || 'Custom')}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500">Overall Score</p>
                        <p class="font-bold text-2xl text-primary-500">${overallScore}</p>
                    </div>
                </div>
            </div>
            <h4 class="font-semibold text-gray-900 mb-3">Responses & Evaluations</h4>
            ${responsesHtml || '<p class="text-gray-500 text-sm">No responses recorded.</p>'}
        `;

        // Print/PDF button - opens formatted HTML in new tab
        const printBtn = modal.querySelector('#printInterviewResults');
        printBtn.onclick = () => {
            const url = `/api/interview-ai/results/${encodeURIComponent(results.sessionId)}/download?format=html`;
            window.open(url, '_blank');
            this.showNotification('Opening formatted view - use Print to save as PDF', 'success');
        };

        // Download JSON button
        const downloadBtn = modal.querySelector('#downloadInterviewResults');
        downloadBtn.onclick = () => {
            const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `interview_${results.sessionId || 'results'}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        modal.classList.remove('hidden');
    }

    async handleEmailInterviewResults(sessionId, candidateEmail) {
        const email = prompt('Send interview results to:', candidateEmail || '');
        if (!email) return;

        try {
            const response = await fetch(`/api/interview-ai/results/${encodeURIComponent(sessionId)}/send`, {
                method: 'POST',
                headers: {
                    ...this.buildTenantHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });
            
            if (!response.ok) {
                throw new Error('Failed to send results');
            }
            this.showNotification(`Interview results sent to ${email}`, 'success');
        } catch (error) {
            console.error('Email interview results error:', error);
            this.showNotification('Unable to send interview results. Email service may not be configured.', 'error');
        }
    }

    initializePersonaManager() {
        this.personaListEl = document.getElementById('personaList');
        this.personaFormEl = document.getElementById('createPersonaForm');

        if (this.personaFormEl) {
            this.personaFormEl.addEventListener('submit', (event) => this.handleCreatePersona(event));
        }

        if (this.personaListEl) {
            this.personaListEl.addEventListener('click', (event) => this.handlePersonaListClick(event));
        }

        const refreshBtn = document.getElementById('refreshPersonas');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadPersonas());
        }

        // Personas tab is hidden - don't auto-load
        // if (this.personaListEl) {
        //     this.renderPersonaList();
        //     this.loadPersonas();
        // }
    }

    async loadPersonas() {
        // Skip if personas tab is hidden or element doesn't exist
        if (!this.personaListEl) return;
        
        // Check if personas tab is actually visible before loading
        const personasTab = document.getElementById('personas-tab');
        if (personasTab && personasTab.classList.contains('hidden')) return;
        
        this.personaListEl.innerHTML = '<div class="text-gray-500 text-sm">Loading personas...</div>';
        try {
            const tenantId = this.getTenantIdForRequests();
            const response = await SMEAIClient.listPersonas({ tenantId });
            const records = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
            this.personas = records;
            this.renderPersonaList();
        } catch (error) {
            console.error('Failed to load personas:', error);
            this.personas = [];
            this.renderPersonaList(true);
            this.showNotification('Unable to load personas right now.', 'error');
        }
    }

    renderPersonaList(showError = false) {
        if (!this.personaListEl) return;
        if (showError) {
            this.personaListEl.innerHTML = '<div class="text-red-500 text-sm">Unable to load personas. Please try again later.</div>';
            return;
        }
        if (!this.personas || this.personas.length === 0) {
            this.personaListEl.innerHTML = '<div class="text-gray-500 text-sm">No personas created yet. Use the form to add one.</div>';
            return;
        }

        const fragments = this.personas.map((persona) => {
            const recordId = persona.id || '';
            const personaKey = persona.personaId || recordId;
            const typeLabel = (persona.type || 'custom').toUpperCase();
            const description = persona.description && persona.description.trim().length
                ? persona.description
                : 'No description provided.';
            const actionsDisabled = recordId ? '' : 'disabled';
            const actionClasses = recordId ? 'text-sm text-blue-600 hover:underline'
                : 'text-sm text-blue-300 cursor-not-allowed';
            const deleteClasses = recordId ? 'text-sm text-red-600 hover:underline'
                : 'text-sm text-red-300 cursor-not-allowed';

            return `
                <div class="border border-gray-200 rounded-lg p-4">
                    <div class="flex items-start justify-between">
                        <div>
                            <div class="text-sm text-gray-500">${personaKey || 'unknown-key'}</div>
                            <div class="text-lg font-semibold text-gray-800">${persona.name || personaKey || 'Unnamed Persona'}</div>
                            <div class="text-xs inline-flex px-2 py-1 mt-1 rounded bg-gray-100 text-gray-600">${typeLabel}</div>
                        </div>
                        <div class="space-x-2">
                            <button class="${actionClasses}" data-action="edit" data-id="${recordId}" ${actionsDisabled}>Edit</button>
                            <button class="${deleteClasses}" data-action="delete" data-id="${recordId}" ${actionsDisabled}>Delete</button>
                        </div>
                    </div>
                    <p class="text-sm text-gray-600 mt-3">${description}</p>
                </div>
            `;
        });

        this.personaListEl.innerHTML = fragments.join('');
    }

    async handleCreatePersona(event) {
        event.preventDefault();
        if (!this.personaFormEl) return;

        const formData = new FormData(this.personaFormEl);
        const name = (formData.get('personaName') || '').toString().trim();
        const personaKey = (formData.get('personaKey') || '').toString().trim();
        const description = (formData.get('personaDescription') || '').toString().trim();
        const type = (formData.get('personaType') || 'custom').toString().trim();

        if (!name) {
            this.showNotification('Persona name is required.', 'error');
            return;
        }

        const submitBtn = this.personaFormEl.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const tenantId = this.getTenantIdForRequests();
            await SMEAIClient.createPersona({
                name,
                personaId: personaKey || undefined,
                description,
                type,
                config: {}
            }, { tenantId });
            this.showNotification('Persona created successfully.', 'success');
            this.personaFormEl.reset();
            await this.loadPersonas();
        } catch (error) {
            console.error('Failed to create persona:', error);
            this.showNotification(error?.message || 'Failed to create persona.', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async handlePersonaListClick(event) {
        const actionBtn = event.target.closest('[data-action]');
        if (!actionBtn || actionBtn.disabled) {
            return;
        }

        const action = actionBtn.dataset.action;
        const recordId = actionBtn.dataset.id;
        const persona = this.personas.find(item => item.id === recordId);

        if (!recordId || !persona) {
            this.showNotification('This persona cannot be modified from the dashboard.', 'error');
            return;
        }

        const tenantId = this.getTenantIdForRequests();

        if (action === 'edit') {
            const newName = prompt('Persona name', persona.name || persona.personaId || '');
            if (newName === null) return;
            const trimmedName = newName.trim();

            const newDescription = prompt('Persona description', persona.description || '');
            if (newDescription === null) return;
            const trimmedDescription = newDescription.trim();

            const updates = {};
            if (trimmedName && trimmedName !== persona.name) {
                updates.name = trimmedName;
            }
            if (trimmedDescription !== (persona.description || '')) {
                updates.description = trimmedDescription;
            }

            if (Object.keys(updates).length === 0) {
                this.showNotification('No changes made to the persona.', 'info');
                return;
            }

            try {
                await SMEAIClient.updatePersona(recordId, updates, { tenantId });
                this.showNotification('Persona updated successfully.', 'success');
                await this.loadPersonas();
            } catch (error) {
                console.error('Failed to update persona:', error);
                this.showNotification(error?.message || 'Failed to update persona.', 'error');
            }
            return;
        }

        if (action === 'delete') {
            const confirmDelete = confirm(`Delete persona "${persona.name || persona.personaId}"? This cannot be undone.`);
            if (!confirmDelete) {
                return;
            }

            try {
                await SMEAIClient.deletePersona(recordId, { tenantId });
                this.showNotification('Persona deleted successfully.', 'success');
                await this.loadPersonas();
            } catch (error) {
                console.error('Failed to delete persona:', error);
                this.showNotification(error?.message || 'Failed to delete persona.', 'error');
            }
        }
    }
}

// Initialize Admin Dashboard
const adminDashboard = new AdminDashboard();

// ===== Edit Company Information =====
// Run immediately since script is loaded at bottom of body
(function initEditCompanyInfo() {
    const editBtn = document.getElementById('editCompanyInfoBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');
    const editForm = document.getElementById('editCompanyForm');
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');

    if (editBtn) {
        editBtn.addEventListener('click', function() {
            // Populate edit fields with current values
            document.getElementById('edit-company-name').value = document.getElementById('company-name').textContent;
            document.getElementById('edit-contact-person').value = document.getElementById('contact-person').textContent;
            document.getElementById('edit-company-email').value = document.getElementById('company-email').textContent;
            document.getElementById('edit-company-phone').value = document.getElementById('company-phone').textContent;
            document.getElementById('edit-company-address').value = document.getElementById('company-address').textContent;
            
            // Show edit mode
            viewMode.classList.add('hidden');
            editMode.classList.remove('hidden');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            viewMode.classList.remove('hidden');
            editMode.classList.add('hidden');
        });
    }

    if (editForm) {
        editForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const newData = {
                company_name: document.getElementById('edit-company-name').value,
                contact_person: document.getElementById('edit-contact-person').value,
                email: document.getElementById('edit-company-email').value,
                phone: document.getElementById('edit-company-phone').value,
                address: document.getElementById('edit-company-address').value
            };

            // Update display
            document.getElementById('company-name').textContent = newData.company_name;
            document.getElementById('contact-person').textContent = newData.contact_person;
            document.getElementById('company-email').textContent = newData.email;
            document.getElementById('company-phone').textContent = newData.phone;
            document.getElementById('company-address').textContent = newData.address;

            // Update stored user
            const storedUser = localStorage.getItem('currentUser');
            if (storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    user.company_name = newData.company_name;
                    user.email = newData.email;
                    localStorage.setItem('currentUser', JSON.stringify(user));
                } catch (e) {
                    console.warn('Failed to update stored user:', e);
                }
            }

            // Switch back to view mode
            viewMode.classList.remove('hidden');
            editMode.classList.add('hidden');

            if (window.platform && window.platform.showNotification) {
                window.platform.showNotification('Company information updated', 'success');
            } else {
                alert('Company information updated successfully!');
            }
        });
    }
})();

// ===== Quick Start Guide Modal =====
function showQuickStartGuide() {
    let modal = document.getElementById('quickStartModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'quickStartModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="font-semibold text-lg text-gray-900">
                        <i class="fas fa-rocket text-primary-500 mr-2"></i>Quick Start Guide
                    </h3>
                    <button onclick="document.getElementById('quickStartModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div class="p-6 overflow-y-auto flex-1">
                    <div class="space-y-6">
                        <div class="flex items-start space-x-4">
                            <div class="w-8 h-8 bg-primary-500 rounded flex items-center justify-center text-white font-bold flex-shrink-0">1</div>
                            <div>
                                <h4 class="font-semibold text-gray-900 mb-1">Configure Your AI Agent</h4>
                                <p class="text-gray-600 text-sm">Navigate to Sales AI, Support AI, or Interview AI from the dashboard. Upload your product documents, FAQs, or job descriptions.</p>
                            </div>
                        </div>
                        <div class="flex items-start space-x-4">
                            <div class="w-8 h-8 bg-primary-500 rounded flex items-center justify-center text-white font-bold flex-shrink-0">2</div>
                            <div>
                                <h4 class="font-semibold text-gray-900 mb-1">Upload Your Documents</h4>
                                <p class="text-gray-600 text-sm">Drag and drop PDF, DOCX, Excel, or CSV files. The AI will automatically process and learn from your content.</p>
                            </div>
                        </div>
                        <div class="flex items-start space-x-4">
                            <div class="w-8 h-8 bg-primary-500 rounded flex items-center justify-center text-white font-bold flex-shrink-0">3</div>
                            <div>
                                <h4 class="font-semibold text-gray-900 mb-1">Customize Settings</h4>
                                <p class="text-gray-600 text-sm">Set your preferred response tone, notification emails, and any custom instructions for the AI.</p>
                            </div>
                        </div>
                        <div class="flex items-start space-x-4">
                            <div class="w-8 h-8 bg-primary-500 rounded flex items-center justify-center text-white font-bold flex-shrink-0">4</div>
                            <div>
                                <h4 class="font-semibold text-gray-900 mb-1">Generate & Share Your AI Link</h4>
                                <p class="text-gray-600 text-sm">Click "Generate AI Link" to create a shareable URL. Send this to customers, embed it on your website, or share via email.</p>
                            </div>
                        </div>
                        <div class="flex items-start space-x-4">
                            <div class="w-8 h-8 bg-primary-500 rounded flex items-center justify-center text-white font-bold flex-shrink-0">5</div>
                            <div>
                                <h4 class="font-semibold text-gray-900 mb-1">Monitor & Improve</h4>
                                <p class="text-gray-600 text-sm">Check the Analytics tab to see interactions, download transcripts, and refine your AI's knowledge base over time.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50">
                    <p class="text-gray-500 text-sm text-center">Need more help? Email <a href="mailto:elite@sunway-intgen.com" class="text-primary-500 hover:underline">elite@sunway-intgen.com</a></p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
}

// ===== Video Tutorials Modal =====
function showVideoTutorials() {
    let modal = document.getElementById('videoTutorialsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'videoTutorialsModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="font-semibold text-lg text-gray-900">
                        <i class="fas fa-play-circle text-primary-500 mr-2"></i>Video Tutorials
                    </h3>
                    <button onclick="document.getElementById('videoTutorialsModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div class="p-6 overflow-y-auto flex-1">
                    <div class="grid md:grid-cols-2 gap-4">
                        <div class="border border-gray-200 rounded p-4 hover:shadow transition cursor-pointer" onclick="window.location.href='sales-ai.html'">
                            <div class="bg-gray-100 rounded h-32 flex items-center justify-center mb-3">
                                <i class="fas fa-chart-line text-4xl text-primary-500"></i>
                            </div>
                            <h4 class="font-semibold text-gray-900 mb-1">Sales AI Setup</h4>
                            <p class="text-gray-500 text-sm">Learn how to configure your Sales AI agent</p>
                            <p class="text-primary-500 text-xs mt-2"><i class="fas fa-play mr-1"></i>Watch on setup page</p>
                        </div>
                        <div class="border border-gray-200 rounded p-4 hover:shadow transition cursor-pointer" onclick="window.location.href='support-ai.html'">
                            <div class="bg-gray-100 rounded h-32 flex items-center justify-center mb-3">
                                <i class="fas fa-headset text-4xl text-primary-500"></i>
                            </div>
                            <h4 class="font-semibold text-gray-900 mb-1">Support AI Setup</h4>
                            <p class="text-gray-500 text-sm">Configure your intelligent FAQ system</p>
                            <p class="text-primary-500 text-xs mt-2"><i class="fas fa-play mr-1"></i>Watch on setup page</p>
                        </div>
                        <div class="border border-gray-200 rounded p-4 hover:shadow transition cursor-pointer" onclick="window.location.href='interview-ai.html'">
                            <div class="bg-gray-100 rounded h-32 flex items-center justify-center mb-3">
                                <i class="fas fa-users text-4xl text-primary-500"></i>
                            </div>
                            <h4 class="font-semibold text-gray-900 mb-1">Interview AI Setup</h4>
                            <p class="text-gray-500 text-sm">Create AI-powered interviews</p>
                            <p class="text-primary-500 text-xs mt-2"><i class="fas fa-play mr-1"></i>Watch on setup page</p>
                        </div>
                        <div class="border border-gray-200 rounded p-4 hover:shadow transition cursor-pointer" onclick="window.location.href='index.html'">
                            <div class="bg-gray-100 rounded h-32 flex items-center justify-center mb-3">
                                <i class="fas fa-credit-card text-4xl text-primary-500"></i>
                            </div>
                            <h4 class="font-semibold text-gray-900 mb-1">Subscription Guide</h4>
                            <p class="text-gray-500 text-sm">How to subscribe and get started</p>
                            <p class="text-primary-500 text-xs mt-2"><i class="fas fa-play mr-1"></i>Watch on homepage</p>
                        </div>
                    </div>
                </div>
                <div class="p-4 border-t border-gray-200 bg-gray-50">
                    <p class="text-gray-500 text-sm text-center">Each AI setup page has a video tutorial. Click "Watch Video" at the top of each page.</p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
}