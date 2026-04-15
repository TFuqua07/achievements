const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'achievements.json');

async function readData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {
            celeste_goldens: [],
            celeste_clears: [],
            demons: [],
            gd_platformer: []
        };
    }
}

async function writeData(data) {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
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
        if (event.httpMethod === 'GET') {
            const data = await readData();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(data)
            };
        }
        
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: 'Unauthorized' };
        }
        
        const token = authHeader.replace('Bearer ', '');
        if (!context.clientContext || !context.clientContext.user) {
            if (token.length < 10) {
                return { statusCode: 401, headers, body: 'Unauthorized' };
            }
        }
        
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            const { category, name, tier, star, campaign, video, thumbnail, time, deaths, attempts } = body;
            
            if (!category || !name) {
                return { statusCode: 400, headers, body: 'Missing required fields' };
            }
            
            const data = await readData();
            
            const newEntry = {
                name,
                campaign: campaign || null,
                thumbnail: thumbnail || null,
                video: video || null,
                date: new Date().toISOString()
            };
            
            if (tier !== undefined) newEntry.tier = parseInt(tier);
            if (star !== undefined) newEntry.star = parseInt(star);
            if (time) newEntry.time = time;
            if (deaths !== undefined && deaths !== null) newEntry.deaths = parseInt(deaths);
            if (attempts !== undefined && attempts !== null) newEntry.attempts = parseInt(attempts);
            
            if (!data[category]) data[category] = [];
            data[category].push(newEntry);
            
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
        
        if (event.httpMethod === 'DELETE') {
            const { category, index } = event.queryStringParameters || {};
            const data = await readData();
            
            if (data[category] && data[category][index]) {
                data[category].splice(parseInt(index), 1);
                await writeData(data);
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }
        
        return { statusCode: 405, headers, body: 'Method not allowed' };
        
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: 'Error: ' + error.message
        };
    }
};


