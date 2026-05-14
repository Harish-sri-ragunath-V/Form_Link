const express = require('express');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- MongoDB Setup ---
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("ERROR: MONGODB_URI is not defined in .env file!");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log("Connected to MongoDB Atlas"))
    .catch(err => console.error("Could not connect to MongoDB:", err));

// Schemas
const FormSchema = new mongoose.Schema({
    name: String,
    url: String,
    createdAt: { type: Date, default: Date.now }
});

// Convert _id to id for frontend compatibility
FormSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) { delete ret._id }
});

const TokenSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4, unique: true },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
    formId: String,
    createdAt: { type: Date, default: Date.now }
});

TokenSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) { delete ret._id }
});

const Form = mongoose.model('Form', FormSchema);
const Token = mongoose.model('Token', TokenSchema);

// Admin Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Forms API ---
app.get('/api/forms', async (req, res) => {
    try {
        const forms = await Form.find().sort({ createdAt: -1 });
        res.json({ success: true, forms });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/forms', async (req, res) => {
    try {
        const { name, url } = req.body;
        if (!name || !url) return res.status(400).json({ success: false, error: "Name and URL required" });
        
        const newForm = new Form({ name, url });
        await newForm.save();
        
        res.json({ success: true, form: newForm });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/forms/:id', async (req, res) => {
    try {
        await Form.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get currently active token (if any)
app.get('/api/active-token', async (req, res) => {
    try {
        const activeToken = await Token.findOne({ used: false }).sort({ createdAt: -1 });

        if (activeToken) {
            const qrUrl = `${process.env.BASE_URL}/scan/${activeToken.id}`;
            const qrImage = await qrcode.toDataURL(qrUrl);
            res.json({
                active: true,
                token: activeToken.id,
                qrImage,
                url: qrUrl
            });
        } else {
            res.json({ active: false });
        }
    } catch (error) {
        res.status(500).json({ active: false, error: error.message });
    }
});

// Generate new QR Token
app.post('/api/generate', async (req, res) => {
    try {
        const { formId } = req.body;
        if (!formId) {
            return res.status(400).json({ success: false, error: "Please select a form first." });
        }

        const newToken = new Token({
            id: uuidv4(),
            formId: formId
        });

        await newToken.save();

        const qrUrl = `${process.env.BASE_URL}/scan/${newToken.id}`;
        const qrImage = await qrcode.toDataURL(qrUrl);

        res.json({
            success: true,
            token: newToken.id,
            qrImage,
            url: qrUrl
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Check if a specific token is valid (Used by Google Apps Script)
app.get('/api/validate/:tokenId', async (req, res) => {
    try {
        const token = await Token.findOne({ id: req.params.tokenId });

        if (token && token.used) {
            res.json({ valid: true });
        } else {
            res.json({ valid: false });
        }
    } catch (error) {
        res.status(500).json({ valid: false });
    }
});

// Scan/Redirect endpoint
app.get('/scan/:tokenId', async (req, res) => {
    try {
        const { tokenId } = req.params;
        const token = await Token.findOne({ id: tokenId });

        if (!token || token.used) {
            return res.sendFile(path.join(__dirname, 'public', 'expired.html'));
        }

        // Mark as used
        token.used = true;
        token.usedAt = new Date();
        const usedFormId = token.formId;
        await token.save();

        // AUTO-GENERATE NEXT TOKEN:
        const nextToken = new Token({
            id: uuidv4(),
            formId: usedFormId
        });
        await nextToken.save();

        // Find the form
        const targetForm = await Form.findById(usedFormId);
        
        if (targetForm) {
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Secure Form</title>
                    <style>
                        body, html {
                            margin: 0; 
                            padding: 0; 
                            height: 100%; 
                            overflow: hidden;
                            background-color: #f0f2f5;
                        }
                        iframe {
                            border: none;
                            width: 100%;
                            height: 100%;
                        }
                    </style>
                </head>
                <body>
                    <iframe src="${targetForm.url}"></iframe>
                </body>
                </html>
            `);
        } else {
            res.sendFile(path.join(__dirname, 'public', 'expired.html'));
        }
    } catch (error) {
        res.sendFile(path.join(__dirname, 'public', 'expired.html'));
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
