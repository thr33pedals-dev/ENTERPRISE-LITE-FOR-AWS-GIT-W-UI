# Enterprise Lite AI Platform

A comprehensive AI platform designed specifically for Small and Medium Enterprises (SMEs) to automate sales, support, and interview processes with intelligent AI solutions.

## 🎯 Project Overview

The Enterprise Lite AI Platform provides a complete suite of AI-powered tools that help businesses streamline their operations:

- **Sales AI**: Intelligent sales assistant for customer interactions and lead generation
- **Support AI**: 24/7 automated customer support with knowledge base integration
- **Interview AI**: Automated hiring process with AI-generated questions and candidate evaluation
- **Basic Analytics**: Performance monitoring and insights across all AI tools

## 🚀 Currently Completed Features

### ✅ Subscription & Authentication
- **Main Landing Page** (`index.html`): Complete subscription flow with video tutorial
- **Single Plan Structure**: $99/month Enterprise Lite AI Complete package including all features
- **Payment Integration**: Secure payment form with validation
- **User Session Management**: Login/logout functionality with localStorage persistence

### ✅ Navigation & User Experience
- **Streamlined Navigation**: Direct access to the admin control panel from all pages
- **Consistent UI**: Unified navigation across all AI configuration pages
- **User Status Tracking**: Real-time configuration status for each AI tool

### ✅ Sales AI Configuration (`sales-ai.html`)
- **Video Tutorial**: Embedded tutorial for setup guidance
- **File Upload System**: Product information and catalog upload
- **Custom Prompt Configuration**: Tailored sales instructions and approaches
- **Lead Qualification**: Configurable qualifying questions
- **AI Link Generation**: Shareable links for customer interactions
- **Preview System**: Test and preview AI responses before deployment

### ✅ Support AI Configuration (`support-ai.html`)
- **Category Management**: Define support categories (Technical, Billing, Product Info)
- **Knowledge Base Upload**: Upload support documentation and FAQs
- **Escalation Rules**: Configure when and how to escalate to human agents
- **Response Style Configuration**: Choose AI personality and tone
- **Multi-language Support**: Primary language selection with auto-detection option
- **Integration Options**: Widget embedding and live chat replacement

### ✅ Admin Hub (`admin.html`)
- **Admin Hub**: Comprehensive admin interface designed for busy SME owners
- **Left Sidebar Navigation**: Four main sections (My AI Agents, Analytics, Account & Billing, Help Center)
- **AI Agent Management**: Card-based interface with status indicators and quick action buttons
- **Copy Link Feature**: One-click link copying for easy AI tool sharing (primary action)
- **Real-time Analytics**: Chart.js integration with usage metrics and performance tracking
- **Account Management**: Tabbed interface for subscription, billing history, and payment methods
- **Help Center**: FAQ accordion with common setup and usage questions
- **Action-Oriented Design**: Clean, simple interface focused on quick task completion
- **Direct Access**: Users are redirected directly to control panel after login for immediate productivity

### ✅ Design & User Experience
- **Clean White Background**: Professional appearance with Pantone 1796 (red) as primary color
- **Responsive Design**: Mobile-friendly interface using Tailwind CSS
- **Glass Card Effects**: Modern UI components with subtle shadows
- **Consistent Branding**: Unified color scheme and typography throughout

## 🔧 Technical Architecture

### Database Schema
The platform uses a RESTful Table API with the following schemas:

#### Companies Table
- Company information and subscription details
- Subscription status tracking
- Billing and contact information

#### AI Configuration Tables
- `sales_ai`: Sales AI settings, uploaded files, and custom prompts
- `support_ai`: Support categories, escalation rules, and knowledge base
- `interview_ai`: Job roles, questions, and interview configurations
- `usage_analytics`: Performance tracking and session data

### File Structure
```
├── index.html              # Main subscription page

├── sales-ai.html          # Sales AI configuration
├── support-ai.html        # Support AI configuration  
├── interview-ai.html      # Interview AI configuration (in progress)
├── admin.html             # Admin hub interface
├── js/
│   ├── main.js            # Core platform functionality

│   ├── sales-ai.js        # Sales AI configuration logic
│   ├── support-ai.js      # Support AI configuration logic
│   └── control-panel.js   # Admin control panel functionality
└── README.md              # Project documentation
```

## 🎨 Design System

### Color Palette
- **Primary Color**: Pantone 1796 (#E31837) - Red
- **Background**: White (#FFFFFF)
- **Text**: Gray scale (#374151, #6B7280, #9CA3AF)
- **Accents**: Blue (#3B82F6), Green (#10B981), Purple (#8B5CF6)

### Key Features
- **Tailwind CSS**: Utility-first CSS framework
- **Font Awesome Icons**: Comprehensive icon library
- **Inter Font**: Clean, modern typography
- **Glass Card Effects**: Subtle transparency and blur effects

## 📊 Current Functional URIs

### Public Pages
- `/` - Main subscription landing page
- `/index.html` - Subscription form and payment processing

### Authenticated Pages (Require Login)

- `/sales-ai.html` - Sales AI configuration and management
- `/support-ai.html` - Support AI setup and customization
- `/admin.html` - Admin hub for SME owners

### API Endpoints (RESTful Table API)
- `GET/POST tables/companies` - Company management
- `GET/POST/PATCH tables/sales_ai` - Sales AI configurations
- `GET/POST/PATCH tables/support_ai` - Support AI configurations
- `GET/POST/PATCH tables/interview_ai` - Interview AI configurations
- `GET/POST tables/usage_analytics` - Usage tracking and analytics

## 🚧 Features Not Yet Implemented

### Interview AI (In Progress)
- Complete Interview AI configuration page
- Job role definition and question generation
- Voice and video interview capabilities
- Candidate evaluation system

### Enhanced Analytics (Future)
- Export capabilities for analytics reports
- Advanced performance insights
- Customer satisfaction analysis
- Historical trend analysis

### Advanced Features (Future Enhancements)
- Real AI integration (currently simulated)
- Advanced customization options
- White-label solutions
- Multi-language interface
- API documentation for third-party integrations

## 🎯 Recommended Next Steps

1. **Complete Interview AI Configuration**
   - Finish the interview-ai.html page implementation
   - Add job role question generation
   - Implement candidate evaluation criteria

2. **Enhance Admin Hub**
   - Connect analytics to real usage data
   - Add export functionality for analytics data
   - Implement advanced filtering and date range selection

3. **Enhanced User Experience**
   - Add onboarding tour for new users
   - Implement in-app help system
   - Create detailed documentation for each AI tool

4. **Real AI Integration**
   - Connect to actual AI services (OpenAI, etc.)
   - Implement real file processing capabilities
   - Add live testing environments for AI tools

## 💻 Development Setup

1. **File Structure**: All files are organized for easy deployment
2. **Dependencies**: Uses CDN for external libraries (Tailwind, Font Awesome)
3. **Storage**: Uses RESTful Table API for data persistence
4. **Session Management**: localStorage for user authentication state

## 🔒 Security Features

- Client-side form validation
- Secure payment form structure
- Session-based authentication
- Input sanitization and validation

## 📱 Mobile Responsiveness

The platform is fully responsive and works seamlessly on:
- Desktop computers
- Tablets
- Mobile phones
- Various screen sizes and orientations

---

**Note**: This is a frontend-only static website implementation. For production deployment, additional backend infrastructure would be needed for real payment processing, AI integrations, and enhanced security features.