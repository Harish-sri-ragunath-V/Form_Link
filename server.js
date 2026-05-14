const express = require('express');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- MongoDB Setup ---
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error("ERROR: MONGODB_URI is not defined!");
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log("Connected to MongoDB Atlas"))
    .catch(err => console.error("Could not connect to MongoDB:", err));

// --- Schemas ---

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const FormSchema = new mongoose.Schema({
    name: String,
    url: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

TokenSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) { delete ret._id }
});

const User = mongoose.model('User', UserSchema);
const Form = mongoose.model('Form', FormSchema);
const Token = mongoose.model('Token', TokenSchema);

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false, error: "Access denied. Please login." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: "Session expired. Please login again." });
        req.user = user;
        next();
    });
};

// --- Auth Routes ---

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, error: "Fill all fields." });

        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).json({ success: false, error: "Username taken." });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();

        res.json({ success: true, message: "Registered! Please login." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ success: false, error: "User not found." });

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ success: false, error: "Wrong password." });

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, username: user.username });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Protected Forms API ---

app.get('/api/forms', authenticateToken, async (req, res) => {
    try {
        const forms = await Form.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json({ success: true, forms });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/forms', authenticateToken, async (req, res) => {
    try {
        const { name, url } = req.body;
        if (!name || !url) return res.status(400).json({ success: false, error: "Name and URL required" });
        
        const newForm = new Form({ name, url, userId: req.user.id });
        await newForm.save();
        
        res.json({ success: true, form: newForm });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/forms/:id', authenticateToken, async (req, res) => {
    try {
        await Form.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/active-token', authenticateToken, async (req, res) => {
    try {
        const activeToken = await Token.findOne({ used: false, userId: req.user.id }).sort({ createdAt: -1 });

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

app.post('/api/generate', authenticateToken, async (req, res) => {
    try {
        const { formId } = req.body;
        if (!formId) return res.status(400).json({ success: false, error: "Select a form." });

        const newToken = new Token({
            id: uuidv4(),
            formId: formId,
            userId: req.user.id
        });

        await newToken.save();

        const qrUrl = `${process.env.BASE_URL}/scan/${newToken.id}`;
        const qrImage = await qrcode.toDataURL(qrUrl);

        res.json({ success: true, token: newToken.id, qrImage, url: qrUrl });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Public APIs (No Auth needed for redirection) ---

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

app.get('/scan/:tokenId', async (req, res) => {
    try {
        const { tokenId } = req.params;
        const token = await Token.findOne({ id: tokenId });

        if (!token || token.used) {
            return res.sendFile(path.join(__dirname, 'public', 'expired.html'));
        }

        token.used = true;
        token.usedAt = new Date();
        await token.save();

        // Auto-gen next for SAME user
        const nextToken = new Token({
            id: uuidv4(),
            formId: token.formId,
            userId: token.userId
        });
        await nextToken.save();

        const targetForm = await Form.findById(token.formId);
        
        if (targetForm) {
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Secure Form</title>
                    <style>
                        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background-color: #f0f2f5; }
                        iframe { border: none; width: 100%; height: 100%; }
                    </style>
                </head>
                <body><iframe src="${targetForm.url}"></iframe></body>
                </html>
            `);
        } else {
            res.sendFile(path.join(__dirname, 'public', 'expired.html'));
        }
    } catch (error) {
        res.sendFile(path.join(__dirname, 'public', 'expired.html'));
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
