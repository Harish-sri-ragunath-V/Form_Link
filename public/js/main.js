document.addEventListener('DOMContentLoaded', () => {
    // IMPORTANT: Change this to your actual Ngrok URL or hosted server URL
    const API_BASE_URL = 'https://rephrase-vastly-fetal.ngrok-free.dev';

    const generateBtn = document.getElementById('generate-btn');
    const qrContainer = document.getElementById('qr-container');
    const formSelect = document.getElementById('form-select');
    const formsList = document.getElementById('forms-list');
    const addFormBtn = document.getElementById('add-form-btn');
    const newFormName = document.getElementById('new-form-name');
    const newFormUrl = document.getElementById('new-form-url');

    let forms = [];

    async function fetchForms() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/forms`);
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
        // Render dropdown
        formSelect.innerHTML = '<option value="">-- Select a Form --</option>';
        forms.forEach(form => {
            const option = document.createElement('option');
            option.value = form.id;
            option.textContent = form.name;
            formSelect.appendChild(option);
        });

        // Render management list
        formsList.innerHTML = '';
        if (forms.length === 0) {
            formsList.innerHTML = '<li style="color: #666; text-align: center; padding: 10px;">No forms added yet.</li>';
            return;
        }

        forms.forEach(form => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '10px';
            li.style.borderBottom = '1px solid #eee';

            const info = document.createElement('div');
            // Hide the raw URL to prevent users from copying it
            info.innerHTML = `<strong>${form.name}</strong> <br><small style="color: #888;"><i>Hidden Link</i></small>`;

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.style.padding = '5px 10px';
            deleteBtn.style.backgroundColor = '#ff4d4f';
            deleteBtn.style.color = 'white';
            deleteBtn.style.border = 'none';
            deleteBtn.style.borderRadius = '4px';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.onclick = () => deleteForm(form.id);

            li.appendChild(info);
            li.appendChild(deleteBtn);
            formsList.appendChild(li);
        });
    }

    addFormBtn.addEventListener('click', async () => {
        const name = newFormName.value.trim();
        const url = newFormUrl.value.trim();
        if (!name || !url) {
            alert('Please provide both a name and a URL.');
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/forms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url })
            });
            const data = await res.json();
            if (data.success) {
                newFormName.value = '';
                newFormUrl.value = '';
                fetchForms();
            } else {
                alert('Error adding form: ' + data.error);
            }
        } catch (err) {
            console.error('Error adding form:', err);
        }
    });

    async function deleteForm(id) {
        if (!confirm('Are you sure you want to delete this form?')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/forms/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                fetchForms();
            } else {
                alert('Error deleting form: ' + data.error);
            }
        } catch (err) {
            console.error('Error deleting form:', err);
        }
    }

    async function generateQR() {
        if (generateBtn.disabled) return;
        
        const formId = formSelect.value;
        if (!formId) {
            alert('Please select a form from the dropdown first.');
            return;
        }

        generateBtn.disabled = true;
        const originalText = generateBtn.innerHTML;
        generateBtn.innerHTML = '<span>Generating...</span>';

        try {
            const response = await fetch(`${API_BASE_URL}/api/generate`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formId })
            });
            const data = await response.json();

            if (data.success) {
                renderQR(data);
            } else {
                alert('Error: ' + data.error);
            }
        } catch (err) {
            console.error('Error generating QR:', err);
            alert('Failed to connect to server.');
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

    // Check for an existing active token on load and poll for updates
    async function checkActiveToken() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/active-token`);
            const data = await response.json();

            if (data.active) {
                // Only re-render if the token has actually changed
                if (data.token !== currentTokenId) {
                    currentTokenId = data.token;
                    renderQR(data);
                }
            } else {
                qrContainer.innerHTML = `
                    <div class="qr-placeholder">
                        <p>No active QR code. Click below to generate one.</p>
                    </div>
                `;
                currentTokenId = null;
            }
        } catch (err) {
            console.log('No active token found or server offline');
        }
    }

    // Initial check
    fetchForms();
    checkActiveToken();

    // Auto-update dashboard every 3 seconds
    setInterval(checkActiveToken, 3000);
});
