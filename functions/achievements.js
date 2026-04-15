const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'achievements.json');

// Helper to read data
async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Return default structure if file doesn't exist
        return {
            celeste_goldens: [],
            celeste_clears: [],
            demons: [],
            gd_platformer: []
        };
    }
}

// Helper to write data
async function writeData(data) {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Verify JWT token with Netlify Identity
async function verifyToken(token) {
    if (!token) return false;
    
    try {
        // Netlify Identity validation
        const response = await fetch('https://api.netlify.com/api/v1/user', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    };
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    
    try {
        // GET - Public read access
        if (event.httpMethod === 'GET') {
            const data = await readData();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(data)
            };
        }
        
        // POST/DELETE - Require authentication
        const token = event.headers.authorization?.replace('Bearer ', '');
        const isAuthenticated = await verifyToken(token);
        
        if (!isAuthenticated) {
            return {
                statusCode: 401,
                headers,
                body: 'Unauthorized'
            };
        }
        
        // POST - Add new achievement
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            const { category, name, tier, star, campaign, video } = body;
            
            if (!category || !name) {
                return {
                    statusCode: 400,
                    headers,
                    body: 'Missing required fields'
                };
            }
            
            const data = await readData();
            
            const newEntry = {
                name,
                campaign: campaign || null,
                video: video || null,
                date: new Date().toISOString()
            };
            
            if (tier !== undefined) newEntry.tier = tier;
            if (star !== undefined) newEntry.star = star;
            
            if (!data[category]) data[category] = [];
            data[category].push(newEntry);
            
            // Sort: Goldens/Demons by tier (desc), Clears by star (desc)
            if (category === 'celeste_clears') {
                data[category].sort((a, b) => (b.star || 0) - (a.star || 0));
            } else {
                data[category].sort((a, b) => (b.tier || 0) - (a.tier || 0));
            }
            
            await writeData(data);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }
        
        // DELETE - Remove achievement
        if (event.httpMethod === 'DELETE') {
            const { category, index } = event.queryStringParameters;
            const data = await readData();
            
            if (data[category] && data[category][index]) {
                data[category].splice(index, 1);
                await writeData(data);
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }
        
        return {
            statusCode: 405,
            headers,
            body: 'Method not allowed'
        };
        
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: 'Server error: ' + error.message
        };
    }
};


