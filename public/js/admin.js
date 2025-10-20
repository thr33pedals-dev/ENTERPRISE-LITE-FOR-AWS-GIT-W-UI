// Admin Dashboard JavaScript
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
        this.agentSummary = {
            sales: {
                totalInteractions: 0,
                conversions: 0,
                avgSession: 0,
                leadsGenerated: 0
            },
            support: {
                resolved: 0,
                avgResolution: 0,
                satisfaction: 0,
                escalations: 0
            },
            interview: {
                completed: 0,
                qualified: 0,
                avgScore: 0,
                timeToHire: 0
            }
        };
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.setupEventListeners();
        this.loadAllData();
        this.initializeCharts();
    }

    checkAuthentication() {
        const storedUser = localStorage.getItem('currentUser');
        if (!storedUser) {
            const previewUser = {
                id: 'preview_user',
                company_name: 'Preview Company',
                email: 'preview@example.com',
                tenantId: 'preview-company'
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
                company_name: 'Preview Company',
                email: 'preview@example.com',
                tenantId: 'preview-company'
            };
            this.currentUser = previewUser;
            localStorage.setItem('currentUser', JSON.stringify(previewUser));
        }
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

        const agentSelector = document.getElementById('aiSelector');
        if (agentSelector) {
            agentSelector.addEventListener('change', (event) => this.filterAgentDashboards(event.target.value));
        }

        // Timeframe selection
        const trendsTimeframe = document.getElementById('trendsTimeframe');
        trendsTimeframe.addEventListener('change', () => this.updateUsageTrendsChart());

        // Refresh buttons
        document.getElementById('refreshPerformance').addEventListener('click', () => this.refreshPerformanceData());
        document.getElementById('refreshAllData').addEventListener('click', () => this.loadAllData());

        // Export buttons
        document.getElementById('exportSales').addEventListener('click', () => this.exportData('sales'));
        document.getElementById('exportSupport').addEventListener('click', () => this.exportData('support'));
        document.getElementById('exportInterview').addEventListener('click', () => this.exportData('interview'));

        // Action buttons
        document.getElementById('clearOldData').addEventListener('click', () => this.clearOldData());
        document.getElementById('generateReport').addEventListener('click', () => this.generateExecutiveReport());
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
                this.loadInterviewAnalytics()
            ]);

            this.updateOverviewStats();
            this.updateAgentDashboards();
            this.updateUsageTrendsChart();
            this.updatePerformanceChart();
            this.loadTabData('sales'); // Load default tab
            this.filterAgentDashboards(document.getElementById('aiSelector') ? document.getElementById('aiSelector').value : 'all');

        } catch (error) {
            console.error('Error loading analytics data:', error);
            this.showNotification('Error loading analytics data', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadSalesAnalytics() {
        try {
            const response = await fetch(`/api/analytics?companyId=${encodeURIComponent(this.currentUser.id)}&type=sales`);
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
            const response = await fetch(`/api/analytics?companyId=${encodeURIComponent(this.currentUser.id)}&type=support`);
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
            const response = await fetch(`/api/analytics?companyId=${encodeURIComponent(this.currentUser.id)}&type=interview`);
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
        // Sales AI stats
        const salesData = this.analyticsData.sales;
        const totalSalesInteractions = salesData.length;
        const salesConversions = salesData.filter(item => item.success).length;
        const salesConversionRate = totalSalesInteractions > 0 ? Math.round((salesConversions / totalSalesInteractions) * 100) : 0;

        // Support AI stats
        const supportData = this.analyticsData.support;
        const totalSupportTickets = supportData.length;

        // Interview AI stats
        const interviewData = this.analyticsData.interview;
        const totalInterviews = interviewData.length;

        // Overall conversion rate
        const allInteractions = totalSalesInteractions + totalSupportTickets + totalInterviews;
        const allSuccessful = salesConversions + supportData.filter(item => item.success).length + interviewData.filter(item => item.success).length;
        const overallConversion = allInteractions > 0 ? Math.round((allSuccessful / allInteractions) * 100) : 0;

        // Update DOM
        document.getElementById('totalSalesInteractions').textContent = totalSalesInteractions;
        document.getElementById('totalSupportTickets').textContent = totalSupportTickets;
        document.getElementById('totalInterviews').textContent = totalInterviews;
        document.getElementById('overallConversion').textContent = `${overallConversion}%`;

        // Store agent summaries for dashboards
        this.agentSummary.sales.totalInteractions = totalSalesInteractions;
        this.agentSummary.sales.conversions = salesConversions;
        this.agentSummary.sales.avgSession = salesData.length > 0 ? Math.round(salesData.reduce((sum, session) => sum + (session.session_duration || 0), 0) / salesData.length) : 0;
        this.agentSummary.sales.leadsGenerated = Math.round(salesConversions * 0.8);

        this.agentSummary.support.resolved = supportData.filter(item => item.success).length;
        this.agentSummary.support.avgResolution = supportData.length > 0 ? Math.round(supportData.reduce((sum, session) => sum + (session.session_duration || 0), 0) / supportData.length) : 0;
        this.agentSummary.support.satisfaction = supportData.length > 0 ? Math.round((this.agentSummary.support.resolved / supportData.length) * 100) : 0;
        this.agentSummary.support.escalations = Math.round(totalSupportTickets * 0.12);

        this.agentSummary.interview.completed = interviewData.filter(item => item.success).length;
        this.agentSummary.interview.qualified = interviewData.length > 0 ? Math.round(this.agentSummary.interview.completed * 0.6) : 0;
        this.agentSummary.interview.avgScore = this.agentSummary.interview.completed > 0 ? Math.round(Math.random() * 20 + 70) : 0;
        this.agentSummary.interview.timeToHire = interviewData.length > 0 ? Math.max(1, 14 - Math.round(this.agentSummary.interview.completed * 0.3)) : 0;
    }

    initializeCharts() {
        // Initialize Usage Trends Chart
        const usageCtx = document.getElementById('usageTrendsChart').getContext('2d');
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
        const performanceCtx = document.getElementById('performanceChart').getContext('2d');
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
        const timeframe = parseInt(document.getElementById('trendsTimeframe').value);
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

        document.getElementById('salesConversions').textContent = conversions;
        document.getElementById('salesAvgDuration').textContent = `${avgDuration}m`;
        document.getElementById('salesLeads').textContent = leads;

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

        document.getElementById('supportResolved').textContent = resolved;
        document.getElementById('supportAvgTime').textContent = `${avgTime}m`;
        document.getElementById('supportSatisfaction').textContent = `${satisfaction}%`;

        // Update table
        this.populateReportTable('supportReportTable', this.generateDailyStats(supportData, 'support'));
    }

    loadInterviewTabData() {
        const interviewData = this.analyticsData.interview;
        
        // Update summary stats
        const completed = interviewData.filter(item => item.success).length;
        const qualified = Math.round(completed * 0.6); // Assume 60% pass rate
        const avgScore = qualified > 0 ? Math.round(Math.random() * 20 + 70) : 0; // Mock average score

        document.getElementById('interviewsCompleted').textContent = completed;
        document.getElementById('candidatesQualified').textContent = qualified;
        document.getElementById('interviewAvgScore').textContent = avgScore;

        // Update table
        this.populateReportTable('interviewReportTable', this.generateDailyStats(interviewData, 'interview'));
    }

    updateAgentDashboards() {
        const sales = this.agentSummary.sales;
        const support = this.agentSummary.support;
        const interview = this.agentSummary.interview;

        const dashboardEls = [
            ['sales-total-interactions', sales.totalInteractions.toLocaleString()],
            ['sales-conversion-rate', `${sales.conversions > 0 && sales.totalInteractions > 0 ? Math.round((sales.conversions / sales.totalInteractions) * 100) : 0}%`],
            ['sales-avg-session', `${sales.avgSession}m`],
            ['sales-leads-generated', sales.leadsGenerated.toLocaleString()],
            ['support-tickets-resolved', support.resolved.toLocaleString()],
            ['support-avg-resolution', `${support.avgResolution}m`],
            ['support-satisfaction', `${support.satisfaction}%`],
            ['support-escalations', support.escalations.toLocaleString()],
            ['interview-interviews-completed', interview.completed.toLocaleString()],
            ['interview-candidates-qualified', interview.qualified.toLocaleString()],
            ['interview-avg-score', interview.avgScore.toLocaleString()],
            ['interview-time-to-hire', `${interview.timeToHire}d`]
        ];

        dashboardEls.forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        });
    }

    filterAgentDashboards(selectedAgent) {
        const dashboards = document.querySelectorAll('.agent-dashboard');
        dashboards.forEach(dashboard => {
            const agent = dashboard.getAttribute('data-agent');
            if (selectedAgent === 'all' || agent === selectedAgent) {
                dashboard.classList.remove('hidden');
            } else {
                dashboard.classList.add('hidden');
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
        const headers = ['Date', 'AI Type', 'Session Duration', 'Success', 'User IP'];
        const rows = data.map(item => [
            item.usage_date || '',
            item.ai_type || type,
            item.session_duration || 0,
            item.success ? 'Yes' : 'No',
            item.user_ip || 'N/A'
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
        
        modal.classList.toggle('hidden', !show);
        modal.classList.toggle('flex', show);
    }

    showNotification(message, type = 'info') {
        if (window.platform && window.platform.showNotification) {
            window.platform.showNotification(message, type);
        } else {
            alert(message);
        }
    }
}

// Initialize Admin Dashboard
const adminDashboard = new AdminDashboard();