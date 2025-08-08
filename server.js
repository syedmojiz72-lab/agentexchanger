const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 5000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Session simulation (in production, use proper session management)
const sessions = new Map();

// Middleware to check user session
function checkSession(req, res, next) {
    const sessionId = req.headers['x-session-id'];
    if (sessionId && sessions.has(sessionId)) {
        req.user = sessions.get(sessionId);
    }
    next();
}

app.use(checkSession);

// Initialize SQLite database
const db = new sqlite3.Database('./marketplace.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        
        // Create users table for wallet-based authentication
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT UNIQUE NOT NULL,
            subscription_tier TEXT DEFAULT 'creator' CHECK (subscription_tier IN ('creator', 'user_pro', 'agency')),
            lens_handle TEXT,
            farcaster_handle TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating users table:', err.message);
            } else {
                console.log('Users table ready');
            }
        });
        
        // Create agents table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            link TEXT,
            ipfs_hash TEXT,
            creator_wallet TEXT,
            original_agent_id INTEGER DEFAULT NULL,
            fork_count INTEGER DEFAULT 0,
            is_premium BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (original_agent_id) REFERENCES agents(id),
            FOREIGN KEY (creator_wallet) REFERENCES users(wallet_address)
        )`, (err) => {
            if (err) {
                console.error('Error creating agents table:', err.message);
            } else {
                console.log('Agents table ready');
            }
        });
        
        // Create tags table
        db.run(`CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('Error creating tags table:', err.message);
            } else {
                console.log('Tags table ready');
            }
        });
        
        // Create agent_tags junction table
        db.run(`CREATE TABLE IF NOT EXISTS agent_tags (
            agent_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (agent_id, tag_id),
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )`, (err) => {
            if (err) {
                console.error('Error creating agent_tags table:', err.message);
            } else {
                console.log('Agent_tags table ready');
            }
        });
        
        // Create ratings table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id INTEGER NOT NULL,
            wallet_address TEXT,
            stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
            comment TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(agent_id, wallet_address),
            FOREIGN KEY (agent_id) REFERENCES agents(id),
            FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
        )`, (err) => {
            if (err) {
                console.error('Error creating ratings table:', err.message);
            } else {
                console.log('Ratings table ready');
            }
        });
    }
});

// Routes

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Wallet login endpoint
app.post('/api/login', (req, res) => {
    const { walletAddress, signature } = req.body;
    
    if (!walletAddress) {
        return res.status(400).json({ error: 'Wallet address required' });
    }
    
    // In production, verify the signature here
    // For MVP, we'll just accept the wallet address
    
    // Create or update user
    db.run(`INSERT OR REPLACE INTO users (wallet_address, last_login) 
            VALUES (?, CURRENT_TIMESTAMP)`, [walletAddress], function(err) {
        if (err) {
            console.error('Error creating/updating user:', err.message);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Create session
        const sessionId = generateSessionId();
        sessions.set(sessionId, { walletAddress });
        
        res.json({ 
            success: true, 
            sessionId,
            walletAddress 
        });
    });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
        sessions.delete(sessionId);
    }
    res.json({ success: true });
});

// Get user profile
app.get('/api/profile', (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    db.get(`SELECT * FROM users WHERE wallet_address = ?`, [req.user.walletAddress], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(user || { walletAddress: req.user.walletAddress });
    });
});

// Submit agent page
app.get('/submit', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'submit.html'));
});

// My Account page
app.get('/my-account', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'my-account.html'));
});

// Browse agents page
app.get('/browse', (req, res) => {
    const { category, search, sort } = req.query;
    let whereClause = '';
    let orderClause = 'ORDER BY a.created_at DESC';
    const params = [];
    
    if (category && category !== 'all') {
        whereClause += 'WHERE a.category = ?';
        params.push(category);
    }
    
    if (search) {
        whereClause += whereClause ? ' AND ' : 'WHERE ';
        whereClause += '(a.name LIKE ? OR a.description LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    
    if (sort === 'rating') {
        orderClause = 'ORDER BY avg_rating DESC, rating_count DESC';
    } else if (sort === 'forks') {
        orderClause = 'ORDER BY a.fork_count DESC';
    } else if (sort === 'trending') {
        orderClause = 'ORDER BY (a.fork_count * 0.7 + COALESCE(AVG(r.stars), 0) * rating_count * 0.3) DESC';
    }
    
    const sql = `
        SELECT a.*, 
               u.wallet_address as creator_wallet,
               COALESCE(AVG(r.stars), 0) as avg_rating,
               COUNT(r.id) as rating_count,
               GROUP_CONCAT(t.name) as tags
        FROM agents a
        LEFT JOIN users u ON a.creator_wallet = u.wallet_address
        LEFT JOIN ratings r ON a.id = r.agent_id
        LEFT JOIN agent_tags at ON a.id = at.agent_id
        LEFT JOIN tags t ON at.tag_id = t.id
        ${whereClause}
        GROUP BY a.id
        ${orderClause}
    `;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err.message);
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error - AI Marketplace</title>
                    <link rel="stylesheet" href="/style.css">
                </head>
                <body>
                    <div class="container">
                        <h1>Error</h1>
                        <p>Unable to load agents. Please try again later.</p>
                        <a href="/" class="btn">Back to Home</a>
                    </div>
                </body>
                </html>
            `);
            return;
        }

        let agentsHtml = '';
        if (rows.length === 0) {
            agentsHtml = '<div class="empty-state"><p>No AI agents found. <a href="/submit">Submit the first one!</a></p></div>';
        } else {
            agentsHtml = rows.map(agent => {
                const avgRating = parseFloat(agent.avg_rating) || 0;
                const ratingStars = generateStarDisplay(avgRating, false);
                const shortDescription = agent.description.length > 100 ? 
                    agent.description.substring(0, 100) + '...' : agent.description;
                const tags = agent.tags ? agent.tags.split(',').map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('') : '';
                const creatorDisplay = agent.creator_wallet ? 
                    `<span class="creator">By: ${formatWalletAddress(agent.creator_wallet)}</span>` : '';
                const premiumBadge = agent.is_premium ? '<span class="premium-badge">Premium</span>' : '';
                
                return `
                    <div class="agent-card ${agent.is_premium ? 'premium' : ''}">
                        <div class="card-header">
                            <h3><a href="/agent/${agent.id}">${escapeHtml(agent.name)}</a></h3>
                            ${premiumBadge}
                        </div>
                        <p class="category">Category: ${escapeHtml(agent.category)}</p>
                        ${creatorDisplay}
                        <p class="description">${escapeHtml(shortDescription)}</p>
                        ${tags ? `<div class="tags">${tags}</div>` : ''}
                        <div class="agent-stats">
                            <div class="rating-display">
                                ${ratingStars}
                                <span class="rating-text">(${agent.rating_count})</span>
                            </div>
                            <div class="fork-count">
                                <span class="fork-icon">🍴</span>
                                <span>${agent.fork_count}</span>
                            </div>
                        </div>
                        <div class="agent-actions">
                            <a href="/agent/${agent.id}" class="btn btn-primary">View Details</a>
                        </div>
                    </div>
                `;
            }).join('');
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Browse Agents - Web3 AI Marketplace</title>
                <link rel="stylesheet" href="/style.css">
            </head>
            <body>
                <div class="container">
                    <header>
                        <h1>Web3 AI Marketplace</h1>
                        <nav>
                            <a href="/">Home</a>
                            <a href="/browse" class="active">Browse Agents</a>
                            <a href="/submit">Submit Agent</a>
                            <a href="/my-account">My Account</a>
                            <div class="wallet-section">
                                <button id="connectWallet" class="btn btn-wallet">Connect Wallet</button>
                                <div id="walletInfo" class="wallet-info" style="display: none;">
                                    <span id="walletAddress"></span>
                                    <button id="logout" class="btn btn-sm">Logout</button>
                                </div>
                            </div>
                        </nav>
                    </header>
                    
                    <main>
                        <div class="browse-header">
                            <h2>Browse AI Agents</h2>
                            <div class="browse-controls">
                                <form method="GET" action="/browse" class="filter-form">
                                    <input type="text" name="search" placeholder="Search agents..." value="${req.query.search || ''}">
                                    <select name="category">
                                        <option value="all">All Categories</option>
                                        <option value="Productivity" ${req.query.category === 'Productivity' ? 'selected' : ''}>Productivity</option>
                                        <option value="Content Creation" ${req.query.category === 'Content Creation' ? 'selected' : ''}>Content Creation</option>
                                        <option value="Data Analysis" ${req.query.category === 'Data Analysis' ? 'selected' : ''}>Data Analysis</option>
                                        <option value="DeFi" ${req.query.category === 'DeFi' ? 'selected' : ''}>DeFi</option>
                                        <option value="NFT" ${req.query.category === 'NFT' ? 'selected' : ''}>NFT</option>
                                        <option value="Gaming" ${req.query.category === 'Gaming' ? 'selected' : ''}>Gaming</option>
                                        <option value="Other" ${req.query.category === 'Other' ? 'selected' : ''}>Other</option>
                                    </select>
                                    <select name="sort">
                                        <option value="recent" ${req.query.sort === 'recent' ? 'selected' : ''}>Most Recent</option>
                                        <option value="rating" ${req.query.sort === 'rating' ? 'selected' : ''}>Highest Rated</option>
                                        <option value="forks" ${req.query.sort === 'forks' ? 'selected' : ''}>Most Forked</option>
                                        <option value="trending" ${req.query.sort === 'trending' ? 'selected' : ''}>Trending</option>
                                    </select>
                                    <button type="submit" class="btn btn-secondary">Filter</button>
                                </form>
                            </div>
                        </div>
                        <div class="agents-grid">
                            ${agentsHtml}
                        </div>
                    </main>
                </div>
                <script src="/wallet.js"></script>
            </body>
            </html>
        `;
        
        res.send(html);
    });
});

// Fork agent page
app.get('/fork/:id', (req, res) => {
    const agentId = parseInt(req.params.id);
    
    if (isNaN(agentId)) {
        res.redirect('/browse');
        return;
    }

    const sql = 'SELECT * FROM agents WHERE id = ?';
    
    db.get(sql, [agentId], (err, row) => {
        if (err || !row) {
            res.redirect('/browse');
            return;
        }
        
        // Pre-fill the submit form with forked agent data
        const forkData = {
            name: `Fork of ${row.name}`,
            description: row.description,
            category: row.category,
            link: row.link,
            original_agent_id: row.id
        };
        
        res.redirect(`/submit?fork=true&name=${encodeURIComponent(forkData.name)}&description=${encodeURIComponent(forkData.description)}&category=${encodeURIComponent(forkData.category)}&link=${encodeURIComponent(forkData.link)}&original_agent_id=${forkData.original_agent_id}`);
    });
});

// Individual agent page
app.get('/agent/:id', (req, res) => {
    const agentId = parseInt(req.params.id);
    
    if (isNaN(agentId)) {
        res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error - AI Marketplace</title>
                <link rel="stylesheet" href="/style.css">
            </head>
            <body>
                <div class="container">
                    <h1>Invalid Agent ID</h1>
                    <p>The agent ID must be a valid number.</p>
                    <a href="/browse" class="btn">Browse Agents</a>
                </div>
            </body>
            </html>
        `);
        return;
    }

    const sql = `
        SELECT a.*, 
               COALESCE(AVG(r.stars), 0) as avg_rating,
               COUNT(r.id) as rating_count
        FROM agents a
        LEFT JOIN ratings r ON a.id = r.agent_id
        WHERE a.id = ?
        GROUP BY a.id
    `;
    
    db.get(sql, [agentId], (err, row) => {
        if (err) {
            console.error('Database error:', err.message);
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error - AI Marketplace</title>
                    <link rel="stylesheet" href="/style.css">
                </head>
                <body>
                    <div class="container">
                        <h1>Error</h1>
                        <p>Unable to load agent details. Please try again later.</p>
                        <a href="/browse" class="btn">Browse Agents</a>
                    </div>
                </body>
                </html>
            `);
            return;
        }

        if (!row) {
            res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Agent Not Found - AI Marketplace</title>
                    <link rel="stylesheet" href="/style.css">
                </head>
                <body>
                    <div class="container">
                        <h1>Agent Not Found</h1>
                        <p>The requested AI agent could not be found.</p>
                        <a href="/browse" class="btn">Browse Agents</a>
                    </div>
                </body>
                </html>
            `);
            return;
        }

        const avgRating = parseFloat(row.avg_rating) || 0;
        const ratingStars = generateStarDisplay(avgRating, false);
        const interactiveRating = generateStarDisplay(0, true, row.id);
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${escapeHtml(row.name)} - AI Marketplace</title>
                <link rel="stylesheet" href="/style.css">
            </head>
            <body>
                <div class="container">
                    <header>
                        <h1>AI Agent Marketplace</h1>
                        <nav>
                            <a href="/">Home</a>
                            <a href="/browse">Browse Agents</a>
                            <a href="/submit">Submit Agent</a>
                        </nav>
                    </header>
                    
                    <main>
                        <div class="agent-detail">
                            <h2>${escapeHtml(row.name)}</h2>
                            <div class="agent-meta">
                                <span class="category">Category: ${escapeHtml(row.category)}</span>
                                <span class="date">Added: ${new Date(row.created_at).toLocaleDateString()}</span>
                                <span class="fork-count">🍴 ${row.fork_count} ${row.fork_count === 1 ? 'fork' : 'forks'}</span>
                            </div>
                            
                            <div class="rating-section">
                                <div class="current-rating">
                                    <h3>Rating</h3>
                                    <div class="rating-display">
                                        ${ratingStars}
                                        <span class="rating-text">(${row.rating_count} ${row.rating_count === 1 ? 'rating' : 'ratings'})</span>
                                    </div>
                                </div>
                                
                                <div class="rate-agent">
                                    <h4>Rate this agent:</h4>
                                    <form action="/rate" method="POST" class="rating-form">
                                        <input type="hidden" name="agent_id" value="${row.id}">
                                        <div class="interactive-rating">
                                            ${interactiveRating}
                                        </div>
                                        <div class="form-group">
                                            <label for="comment">Comment (optional):</label>
                                            <textarea id="comment" name="comment" rows="3" placeholder="Share your thoughts about this agent..."></textarea>
                                        </div>
                                        <button type="submit" class="btn btn-secondary">Submit Rating</button>
                                    </form>
                                </div>
                            </div>
                            
                            <div class="agent-description">
                                <h3>Description</h3>
                                <p>${escapeHtml(row.description)}</p>
                            </div>
                            
                            <div class="agent-actions">
                                <a href="${escapeHtml(row.link)}" target="_blank" class="btn btn-primary">Visit Agent</a>
                                <a href="/fork/${row.id}" class="btn btn-secondary">🍴 Fork Agent</a>
                                <a href="/browse" class="btn btn-secondary">Back to Browse</a>
                            </div>
                        </div>
                    </main>
                </div>
                
                <script>
                    // Interactive rating system
                    document.querySelectorAll('.interactive-star').forEach((star, index) => {
                        star.addEventListener('click', function() {
                            const rating = index + 1;
                            const form = this.closest('form');
                            
                            // Remove existing hidden rating input
                            const existingInput = form.querySelector('input[name="stars"]');
                            if (existingInput) {
                                existingInput.remove();
                            }
                            
                            // Add new rating input
                            const ratingInput = document.createElement('input');
                            ratingInput.type = 'hidden';
                            ratingInput.name = 'stars';
                            ratingInput.value = rating;
                            form.appendChild(ratingInput);
                            
                            // Update visual feedback
                            document.querySelectorAll('.interactive-star').forEach((s, i) => {
                                if (i < rating) {
                                    s.classList.add('selected');
                                } else {
                                    s.classList.remove('selected');
                                }
                            });
                        });
                        
                        star.addEventListener('mouseover', function() {
                            const rating = index + 1;
                            document.querySelectorAll('.interactive-star').forEach((s, i) => {
                                if (i < rating) {
                                    s.classList.add('hover');
                                } else {
                                    s.classList.remove('hover');
                                }
                            });
                        });
                    });
                    
                    document.querySelector('.interactive-rating').addEventListener('mouseleave', function() {
                        document.querySelectorAll('.interactive-star').forEach(s => {
                            s.classList.remove('hover');
                        });
                    });
                </script>
            </body>
            </html>
        `;
        
        res.send(html);
    });
});

// Handle rating submission
app.post('/rate', (req, res) => {
    const { agent_id, stars, comment } = req.body;
    
    const agentIdInt = parseInt(agent_id);
    const starsInt = parseInt(stars);
    
    if (isNaN(agentIdInt) || isNaN(starsInt) || starsInt < 1 || starsInt > 5) {
        res.redirect(`/agent/${agent_id}`);
        return;
    }
    
    const sql = 'INSERT INTO ratings (agent_id, stars, comment) VALUES (?, ?, ?)';
    
    db.run(sql, [agentIdInt, starsInt, comment || null], function(err) {
        if (err) {
            console.error('Error saving rating:', err.message);
        }
        res.redirect(`/agent/${agent_id}`);
    });
});

// Handle form submission
app.post('/submit', (req, res) => {
    const { name, description, category, link, ipfs_hash, tags, is_premium, original_agent_id } = req.body;
    const creatorWallet = req.user ? req.user.walletAddress : null;
    
    // Validation
    if (!name || !description || !category || !link) {
        res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Submission Error - AI Marketplace</title>
                <link rel="stylesheet" href="/style.css">
            </head>
            <body>
                <div class="container">
                    <h1>Submission Error</h1>
                    <p>All fields are required. Please go back and fill in all information.</p>
                    <a href="/submit" class="btn">Back to Form</a>
                </div>
            </body>
            </html>
        `);
        return;
    }

    // Validate URL format
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlPattern.test(link)) {
        res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Submission Error - AI Marketplace</title>
                <link rel="stylesheet" href="/style.css">
            </head>
            <body>
                <div class="container">
                    <h1>Submission Error</h1>
                    <p>Please provide a valid URL for the agent link.</p>
                    <a href="/submit" class="btn">Back to Form</a>
                </div>
            </body>
            </html>
        `);
        return;
    }

    const originalAgentId = original_agent_id ? parseInt(original_agent_id) : null;
    const sql = originalAgentId ? 
        'INSERT INTO agents (name, description, category, link, original_agent_id) VALUES (?, ?, ?, ?, ?)' :
        'INSERT INTO agents (name, description, category, link) VALUES (?, ?, ?, ?)';
    
    const params = originalAgentId ? 
        [name, description, category, link, originalAgentId] :
        [name, description, category, link];
    
    db.run(sql, params, function(err) {
        if (err) {
            console.error('Database error:', err.message);
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Submission Error - AI Marketplace</title>
                    <link rel="stylesheet" href="/style.css">
                </head>
                <body>
                    <div class="container">
                        <h1>Submission Error</h1>
                        <p>Unable to save the agent. Please try again later.</p>
                        <a href="/submit" class="btn">Back to Form</a>
                    </div>
                </body>
                </html>
            `);
            return;
        }
        
        console.log(`Agent added with ID: ${this.lastID}`);
        
        // If this is a fork, increment the fork count of the original agent
        if (originalAgentId) {
            db.run('UPDATE agents SET fork_count = fork_count + 1 WHERE id = ?', [originalAgentId], (updateErr) => {
                if (updateErr) {
                    console.error('Error updating fork count:', updateErr.message);
                }
            });
        }
        
        res.redirect('/browse');
    });
});

// Utility function to escape HTML
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Utility function to format wallet address
function formatWalletAddress(address) {
    if (!address) return 'Anonymous';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Utility function to generate session ID
function generateSessionId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Utility function to generate star display
function generateStarDisplay(rating, interactive = false, agentId = null) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    let stars = '';
    
    if (interactive) {
        for (let i = 0; i < 5; i++) {
            stars += `<span class="interactive-star" data-rating="${i + 1}">☆</span>`;
        }
    } else {
        // Full stars
        for (let i = 0; i < fullStars; i++) {
            stars += '<span class="star filled">★</span>';
        }
        
        // Half star
        if (hasHalfStar) {
            stars += '<span class="star half">★</span>';
        }
        
        // Empty stars
        for (let i = 0; i < emptyStars; i++) {
            stars += '<span class="star empty">☆</span>';
        }
        
        if (rating > 0) {
            stars += ` <span class="rating-value">${rating.toFixed(1)}</span>`;
        }
    }
    
    return stars;
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Marketplace server running on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nClosing database connection...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});
