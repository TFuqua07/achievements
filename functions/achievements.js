const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const FILE_PATH = 'data/achievements.json';

async function getFileFromGitHub() {
    try {
        const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'nebula-achievements'
            }
        });
        
        if (response.status === 404) {
            return {
                content: {
                    celeste_goldens: [],
                    celeste_clears: [],
                    demons: [],
                    gd_platformer: []
                },
                sha: null
            };
        }
        
        if (!response.ok) throw new Error('GitHub API error: ' + response.status);
        
        const data = await response.json();
        const content = JSON.parse(Buffer.from(data.content, 'base64').toString());
        return { content, sha: data.sha };
    } catch (error) {
        console.error('GitHub fetch error:', error);
        // Return default on error
        return {
            content: {
                celeste_goldens: [],
                celeste_clears: [],
                demons: [],
                gd_platformer: []
            },
            sha: null
        };
    }
}

async function saveFileToGitHub(content, sha) {
    const body = {
        message: 'Update achievements',
        content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
        sha: sha
    };
    
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'nebula-achievements'
        },
        body: JSON.stringify(body)
    });
    
    if (!response.ok) {
        const err = await response.text();
        throw new Error('GitHub save failed: ' + err);
    }
    
    return response.json();
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
        // GET - Public read
        if (event.httpMethod === 'GET') {
            const { content } = await getFileFromGitHub();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(content)
            };
        }
        
        // Check auth for modifications
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: 'Unauthorized' };
        }
        
        const token = authHeader.replace('Bearer ', '');
        // Basic token validation
        if (token.length < 10) {
            return { statusCode: 401, headers, body: 'Invalid token' };
        }
        
        const { content, sha } = await getFileFromGitHub();
        
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            const { category, name, tier, star, campaign, video, thumbnail, time, deaths, attempts } = body;
            
            if (!category || !name) {
                return { statusCode: 400, headers, body: 'Missing required fields' };
            }
            
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
            
            if (!content[category]) content[category] = [];
            content[category].push(newEntry);
            
            // Sort
            if (category === 'celeste_clears') {
                content[category].sort((a, b) => (b.star || 0) - (a.star || 0));
            } else {
                content[category].sort((a, b) => (b.tier || 0) - (a.tier || 0));
            }
            
            await saveFileToGitHub(content, sha);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }
        
        if (event.httpMethod === 'DELETE') {
            const { category, index } = event.queryStringParameters || {};
            
            if (content[category] && content[category][index]) {
                content[category].splice(parseInt(index), 1);
                await saveFileToGitHub(content, sha);
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true })
            };
        }
        
        return { statusCode: 405, headers, body: 'Method not allowed' };
        
    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: 'Server error: ' + error.message
        };
    }
};


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


