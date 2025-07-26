const cron = require('node-cron');
const fetch = require('node-fetch');

// AMFI NAV API integration
class NAVScheduler {
    constructor(serverUrl = 'http://localhost:3000') {
        this.serverUrl = serverUrl;
        this.fundCodes = []; // Will be populated from database
    }

    async fetchAMFINAV(isin) {
        try {
            const response = await fetch(`https://api.mfapi.in/mf/${isin}`);
            const data = await response.json();
            return data.data[0]?.nav || null;
        } catch (error) {
            console.error(`Failed to fetch NAV for ${isin}:`, error.message);
            return null;
        }
    }

    async updateAllNAVs() {
        console.log('🔄 Starting scheduled NAV update...');
        
        try {
            // Get all active funds
            const response = await fetch(`${this.serverUrl}/api/portfolio/funds`);
            const { data: funds } = await response.json();
            
            const updates = [];
            
            for (const fund of funds) {
                if (fund.status === 'active') {
                    const newNAV = await this.fetchAMFINAV(fund.fund_code);
                    if (newNAV) {
                        updates.push({
                            fund_code: fund.fund_code,
                            nav: parseFloat(newNAV)
                        });
                        console.log(`✅ ${fund.fund_name}: ₹${newNAV}`);
                    }
                }
                
                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Bulk update NAVs
            if (updates.length > 0) {
                await fetch(`${this.serverUrl}/api/portfolio/nav-update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates })
                });
                
                console.log(`🎯 Updated ${updates.length} fund NAVs successfully`);
            }
            
        } catch (error) {
            console.error('❌ NAV update failed:', error.message);
        }
    }

    start() {
        console.log('📅 NAV Scheduler started');
        
        // Schedule daily NAV updates at 8 PM IST (market close + buffer)
        cron.schedule('0 20 * * 1-5', () => {
            this.updateAllNAVs();
        }, {
            timezone: "Asia/Kolkata"
        });
        
        // Schedule weekend updates (for any Friday late updates)
        cron.schedule('0 10 * * 6', () => {
            this.updateAllNAVs();
        }, {
            timezone: "Asia/Kolkata"
        });
        
        console.log('⏰ Scheduled NAV updates: Weekdays 8 PM, Saturday 10 AM IST');
    }
}

// Start scheduler if running directly
if (require.main === module) {
    const scheduler = new NAVScheduler();
    scheduler.start();
    
    // Run once immediately for testing
    setTimeout(() => {
        scheduler.updateAllNAVs();
    }, 5000);
}

module.exports = NAVScheduler;
