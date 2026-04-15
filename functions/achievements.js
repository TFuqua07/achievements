const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // We'll set this in Netlify
const REPO_OWNER = process.env.REPO_OWNER;    // Your GitHub username
const REPO_NAME = process.env.REPO_NAME;        // Your repo name
const FILE_PATH = 'data/achievements.json';

async function getFileFromGitHub() {
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });
    
    if (response.status === 404) {
        // File doesn't exist yet, return default
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
    
    const data = await response.json();
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString());
    return { content, sha: data.sha };
}

async function saveFileToGitHub(content, sha) {
    const body = {
        message: 'Update achievements',
        content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
        sha: sha // null if creating new file
    };
    
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    
    return response.ok;
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
        // GET is public
        if (event.httpMethod === 'GET') {
            const { content } = await getFileFromGitHub();
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(content)
            };
        }
        
        // Check auth
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: 'Unauthorized' };
        }
        
        const { content, sha } = await getFileFromGitHub();
        
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            const { category, name, tier, star, campaign, video } = body;
            
            if (!category || !name) {
                return { statusCode: 400, headers, body: 'Missing required fields' };
            }
            
            const newEntry = {
                name,
                campaign: campaign || null,
                video: video || null,
                date: new Date().toISOString()
            };
            
            if (tier !== undefined) newEntry.tier = parseInt(tier);
            if (star !== undefined) newEntry.star = parseInt(star);
            
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
        return {
            statusCode: 500,
            headers,
            body: 'Error: ' + error.message
        };
    }
};


