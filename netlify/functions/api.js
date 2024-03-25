// netlify/functions/api.js

const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');
const mime = require('mime-types');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // Import Axios for making HTTP requests
require('dotenv').config();

const router = express.Router();
router.use(cors());

mongoose.connect(process.env.MONGODB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const B2_BUCKET_URL = 'https://f005.backblazeb2.com/file/DiscreetShare-CDN/';

const File = mongoose.model('File', new mongoose.Schema({
    originalName: String,
    encryptedFileName: String,
    extension: String,
    encryptionKey: String,
    iv: String,
    fileHash: String,
}));

// Function to decrypt and decompress data
function decryptAndDecompress(data, encryptionKey, iv) {
    const startTime = process.hrtime(); // Log start time
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), Buffer.from(iv, 'hex'));
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        const decompressed = zlib.gunzipSync(decrypted);
        const elapsed = process.hrtime(startTime); // Calculate elapsed time
        console.log(`decryptAndDecompress function alive for ${elapsed[0]} seconds and ${elapsed[1] / 1000000} milliseconds`); // Log elapsed time
        return decompressed;
    } catch (error) {
        console.error('Error during decryption and decompression:', error);
        throw new Error('Error decrypting and decompressing data');
    }
}

// Function to fetch file from B2 bucket
async function fetchFile(fileUrl) {
    const startTime = process.hrtime(); // Log start time
    try {
        const response = await axios.get(fileUrl, { responseType: 'stream' });
        if (!response.status === 200) {
            throw new Error(`Error fetching file from Backblaze B2: ${response.statusText}`);
        }
        const elapsed = process.hrtime(startTime); // Calculate elapsed time
        console.log(`fetchFile function alive for ${elapsed[0]} seconds and ${elapsed[1] / 1000000} milliseconds`); // Log elapsed time
        return response.data;
    } catch (error) {
        console.error('Error fetching file:', error);
        throw new Error('Error fetching file');
    }
}

// Route to get file by ID
router.get('/:fileId', async (req, res) => {
    const startTime = process.hrtime(); // Log start time
    const fileId = req.params.fileId.trim();

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
        return res.status(400).send('Invalid file ID format');
    }

    try {
        const file = await File.findById(fileId, 'encryptedFileName extension');
        if (!file) {
            return res.status(404).send('File not found');
        }

        const fileUrl = B2_BUCKET_URL + file.encryptedFileName;
        const mimeType = mime.lookup(file.extension);

        if (!mimeType || !(mimeType.startsWith('image/') || mimeType.startsWith('video/'))) {
            return res.status(400).send('Requested file is not an image or video');
        }

        res.setHeader('Content-Type', mimeType);
        const fileStream = await fetchFile(fileUrl);
        fileStream.pipe(res);
        const elapsed = process.hrtime(startTime); // Calculate elapsed time
        console.log(`Route handler function alive for ${elapsed[0]} seconds and ${elapsed[1] / 1000000} milliseconds`); // Log elapsed time
    } catch (error) {
        console.error('Error retrieving file:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports.handler = router;
