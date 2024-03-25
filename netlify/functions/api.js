// netlify/functions/api.js

const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');
const mime = require('mime-types');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Use dynamic import for node-fetch
const fetch = require('node-fetch').default;

const router = express.Router();
router.use(cors());

mongoose.connect(process.env.MONGODB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const B2_BUCKET_URL = 'https://f005.backblazeb2.com/file/DiscreetShare-CDN/'; // Replace with your B2 bucket URL

const BannedHash = mongoose.model('BannedHash', new mongoose.Schema({
    hash: String,
}));

const fileSchema = new mongoose.Schema({
    originalName: String,
    encryptedFileName: String,
    extension: String,
    encryptionKey: String,
    iv: String,
    fileHash: String,
});

const File = mongoose.model('File', fileSchema);

function decryptAndDecompress(data, encryptionKey, iv) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), Buffer.from(iv, 'hex'));
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        const decompressed = zlib.gunzipSync(decrypted);
        return decompressed;
    } catch (error) {
        console.error('Error during decryption and decompression:', error);
        throw new Error('Error decrypting and decompressing data');
    }
}

router.get('/:fileId', async (req, res) => {
    const fileId = req.params.fileId.trim();

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
        return res.status(400).send('Invalid file ID format');
    }

    try {
        const file = await File.findById(fileId);

        if (!file) {
            return res.status(404).send('File not found');
        }

        const fileUrl = B2_BUCKET_URL + file.encryptedFileName;

        const mimeType = mime.lookup(file.extension);

        if (mimeType && (mimeType.startsWith('image/') || mimeType.startsWith('video/'))) {
            res.setHeader('Content-Type', mimeType);
            const response = await fetch(fileUrl);
            if (!response.ok) {
                console.error('Error fetching file from Backblaze B2:', response.statusText);
                return res.status(500).send('Error fetching file');
            }
            response.body.pipe(res);
        } else {
            res.status(400).send('Requested file is not an image or video');
        }
    } catch (error) {
        console.error('Error retrieving file:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
