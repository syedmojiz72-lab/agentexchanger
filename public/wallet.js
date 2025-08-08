// Simple wallet connection simulation for MVP
// In production, integrate with WalletConnect or similar

let currentWallet = null;
let sessionId = null;

document.addEventListener('DOMContentLoaded', function() {
    const connectButton = document.getElementById('connectWallet');
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress');
    const logoutButton = document.getElementById('logout');

    // Check for existing session
    sessionId = localStorage.getItem('sessionId');
    if (sessionId) {
        fetch('/api/profile', {
            headers: {
                'X-Session-Id': sessionId
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.wallet_address) {
                showWalletInfo(data.wallet_address);
            } else {
                localStorage.removeItem('sessionId');
            }
        })
        .catch(() => {
            localStorage.removeItem('sessionId');
        });
    }

    if (connectButton) {
        connectButton.addEventListener('click', connectWallet);
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }

    function connectWallet() {
        // Simulate wallet connection (in production, use WalletConnect)
        const mockWallet = generateMockWallet();
        
        fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                walletAddress: mockWallet,
                signature: 'mock-signature'
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                sessionId = data.sessionId;
                localStorage.setItem('sessionId', sessionId);
                showWalletInfo(data.walletAddress);
            } else {
                alert('Failed to connect wallet: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error connecting wallet:', error);
            alert('Failed to connect wallet');
        });
    }

    function logout() {
        if (sessionId) {
            fetch('/api/logout', {
                method: 'POST',
                headers: {
                    'X-Session-Id': sessionId
                }
            });
        }
        
        sessionId = null;
        currentWallet = null;
        localStorage.removeItem('sessionId');
        
        connectButton.style.display = 'block';
        walletInfo.style.display = 'none';
        
        // Reload page to update UI
        window.location.reload();
    }

    function showWalletInfo(address) {
        currentWallet = address;
        walletAddress.textContent = formatWalletAddress(address);
        connectButton.style.display = 'none';
        walletInfo.style.display = 'flex';
    }

    function formatWalletAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    function generateMockWallet() {
        // Generate a mock Ethereum-like wallet address for demo
        const chars = '0123456789abcdef';
        let result = '0x';
        for (let i = 0; i < 40; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
});

// Export session ID for use in other scripts
function getSessionId() {
    return sessionId || localStorage.getItem('sessionId');
}

// Add session ID to all fetch requests
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    const sessionId = getSessionId();
    if (sessionId) {
        options.headers = options.headers || {};
        options.headers['X-Session-Id'] = sessionId;
    }
    return originalFetch(url, options);
};