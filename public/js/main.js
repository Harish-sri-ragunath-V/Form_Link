document.addEventListener('DOMContentLoaded', () => {
    // Render Production URL
    const API_BASE_URL = 'https://form-link-goki.onrender.com';

    // UI Elements
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const authForm = document.getElementById('auth-form');
    const authTitle = document.getElementById('auth-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const toggleAuth = document.getElementById('toggle-auth');
    const authToggleText = document.getElementById('auth-toggle-text');
    const displayUsername = document.getElementById('display-username');
    const logoutBtn = document.getElementById('logout-btn');

    const generateBtn = document.getElementById('generate-btn');
    const qrContainer = document.getElementById('qr-container');
    const formSelect = document.getElementById('form-select');
    const formsList = document.getElementById('forms-list');
    const addFormBtn = document.getElementById('add-form-btn');
    const newFormName = document.getElementById('new-form-name');
    const newFormUrl = document.getElementById('new-form-url');

    let forms = [];
    let isLogin = true;
    let token = localStorage.getItem('token');
    let username = localStorage.getItem('username');

    // --- Authentication Logic ---

    function updateUI() {
        if (token) {
            authContainer.style.display = 'none';
            mainContent.style.display = 'block';
            displayUsername.textContent = username;
            fetchForms();
            checkActiveToken();
        } else {
            authContainer.style.display = 'flex';
            mainContent.style.display = 'none';
        }
    }

    toggleAuth.addEventListener('click', () => {
        isLogin = !isLogin;
        authTitle.textContent = isLogin ? 'Welcome Back' : 'Create Account';
        authSubmitBtn.textContent = isLogin ? 'Login' : 'Sign Up';
        authToggleText.innerHTML = isLogin 
            ? 'Don\'t have an account? <span id="toggle-auth">Sign Up</span>' 
            : 'Already have an account? <span id="toggle-auth">Login</span>';
        
        // Re-add listener to the new span
        document.getElementById('toggle-auth').addEventListener('click', () => toggleAuth.click());
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('username').value;
        const passwordInput = document.getElementById('password').value;
        const endpoint = isLogin ? '/api/login' : '/api/register';

        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: usernameInput, password: passwordInput })
            });
            const data = await res.json();

            if (data.success) {
                if (isLogin) {
                    token = data.token;
                    username = data.username;
                    localStorage.setItem('token', token);
                    localStorage.setItem('username', username);
                    updateUI();
                } else {
                    alert('Registration successful! Please login.');
                    isLogin = true;
                    toggleAuth.click();
                }
            } else {
                alert(data.error);
            }
        } catch (err) {
            alert('Connection failed.');
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        token = null;
        username = null;
        updateUI();
    });

    // Helper for Authenticated Fetch
    async function authFetch(url, options = {}) {
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`
        };
        const response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
        
        if (response.status === 401 || response.status === 403) {
            logoutBtn.click();
            throw new Error('Session expired');
        }
        return response;
    }

    // --- Dashboard Logic ---

    async function fetchForms() {
        try {
            const res = await authFetch('/api/forms');
            const data = await res.json();
            if (data.success) {
                forms = data.forms;
                renderForms();
            }
        } catch (err) {
            console.error('Error fetching forms:', err);
        }
    }

    function renderForms() {
        formSelect.innerHTML = '<option value="">-- Select a Form --</option>';
        forms.forEach(form => {
            const option = document.createElement('option');
            option.value = form.id;
            option.textContent = form.name;
            formSelect.appendChild(option);
        });

        formsList.innerHTML = '';
        if (forms.length === 0) {
            formsList.innerHTML = '<li style="color: #666; text-align: center; padding: 10px;">No forms added yet.</li>';
            return;
        }

        forms.forEach(form => {
            const li = document.createElement('li');
            li.className = 'form-list-item';
            li.innerHTML = `
                <div class="form-list-info">
                    <strong>${form.name}</strong>
                    <small><i>Hidden Link</i></small>
                </div>
                <button class="delete-btn" data-id="${form.id}">Delete</button>
            `;
            
            li.querySelector('.delete-btn').onclick = () => deleteForm(form.id);
            formsList.appendChild(li);
        });
    }

    addFormBtn.addEventListener('click', async () => {
        const name = newFormName.value.trim();
        const url = newFormUrl.value.trim();
        if (!name || !url) return alert('Fill all fields.');

        try {
            const res = await authFetch('/api/forms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url })
            });
            const data = await res.json();
            if (data.success) {
                newFormName.value = '';
                newFormUrl.value = '';
                fetchForms();
            }
        } catch (err) { console.error(err); }
    });

    async function deleteForm(id) {
        if (!confirm('Delete this form?')) return;
        try {
            const res = await authFetch(`/api/forms/${id}`, { method: 'DELETE' });
            if ((await res.json()).success) fetchForms();
        } catch (err) { console.error(err); }
    }

    async function generateQR() {
        if (generateBtn.disabled) return;
        const formId = formSelect.value;
        if (!formId) return alert('Select a form.');

        generateBtn.disabled = true;
        const originalText = generateBtn.innerHTML;
        generateBtn.innerHTML = '<span>Generating...</span>';

        try {
            const response = await authFetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formId })
            });
            const data = await response.json();
            if (data.success) renderQR(data);
        } catch (err) {
            console.error(err);
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = originalText;
        }
    }

    function renderQR(data) {
        qrContainer.innerHTML = `
            <div class="qr-wrapper animate-fade-in">
                <img id="qr-image" src="${data.qrImage}" alt="QR Code">
                <div class="token-info">
                    <span class="status-badge active">Active</span>
                    <code id="token-id">${data.token}</code>
                </div>
                <div class="url-copy">
                    <input type="text" readonly value="${data.url}" id="qr-url-input">
                    <button id="copy-btn">Copy</button>
                </div>
            </div>
        `;
        document.getElementById('copy-btn').addEventListener('click', copyUrl);
    }

    function copyUrl() {
        const copyText = document.getElementById("qr-url-input");
        copyText.select();
        document.execCommand("copy");
        const btn = document.getElementById('copy-btn');
        btn.innerText = 'Copied!';
        setTimeout(() => { btn.innerText = 'Copy'; }, 2000);
    }

    generateBtn.addEventListener('click', generateQR);

    let currentTokenId = null;
    async function checkActiveToken() {
        if (!token) return;
        try {
            const response = await authFetch('/api/active-token');
            const data = await response.json();
            if (data.active && data.token !== currentTokenId) {
                currentTokenId = data.token;
                renderQR(data);
            } else if (!data.active) {
                qrContainer.innerHTML = `<div class="qr-placeholder"><p>No active QR code.</p></div>`;
                currentTokenId = null;
            }
        } catch (err) { }
    }

    // Initial load
    updateUI();
    setInterval(checkActiveToken, 5000);
});
